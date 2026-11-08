import { Question, Attempt, TopicProgress, Topic } from '../models';
import { AppError } from '../utils/apiResponse';
import { awardXp, touchStreak, checkBadges } from './gamification.service';
import { classifyMistake } from './doubt.service';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
const STATE = (m: number, attempts: number) =>
  attempts === 0 ? 'NOT_STARTED' : m >= 90 ? 'MASTERED' : m >= 75 ? 'PROFICIENT' : m >= 55 ? 'DEVELOPING' : 'LEARNING';
const DIFF_W = { EASY: 0.8, MEDIUM: 1, HARD: 1.2 } as const;

// Mastery = blend of overall accuracy + recent performance, weighted by difficulty
function computeMastery(p: any) {
  const acc = p.attempts ? p.correct / p.attempts : 0;
  const recent = p.recent.length ? p.recent.filter(Boolean).length / p.recent.length : 0;
  const volume = Math.min(1, p.attempts / 10); // need enough attempts before full mastery
  return Math.round(Math.min(100, (0.4 * acc + 0.6 * recent) * 100 * DIFF_W[p.currentDifficulty as keyof typeof DIFF_W] * (0.5 + 0.5 * volume)));
}
// Adaptive difficulty: 3 right in a row -> harder, 2 wrong in a row -> easier
function adapt(p: any) {
  const last3 = p.recent.slice(-3), last2 = p.recent.slice(-2);
  const order = ['EASY', 'MEDIUM', 'HARD'];
  let i = order.indexOf(p.currentDifficulty);
  if (last3.length === 3 && last3.every(Boolean)) i = Math.min(2, i + 1);
  else if (last2.length === 2 && last2.every((x: boolean) => !x)) i = Math.max(0, i - 1);
  p.currentDifficulty = order[i];
}

export async function getHint(questionId: string, index: number) {
  const q: any = await Question.findById(questionId).select('+correctAnswer').lean();
  if (!q) throw new AppError(404, 'NOT_FOUND', 'Question not found');
  const hints: string[] = q.hints ?? [];
  if (index < hints.length) return { type: 'HINT', index, text: hints[index], more: true };
  if (index === hints.length) return { type: 'STEPS', steps: q.solutionSteps ?? [], more: true };
  return { type: 'ANSWER', answer: q.correctAnswer, explanation: q.explanation, more: false }; // final answer only last
}

export async function submitAnswer(studentId: string, body: { questionId: string; answer: string; hintsUsed: number; mode: any; timeTakenMs?: number }) {
  const q: any = await Question.findById(body.questionId).select('+correctAnswer +keywords +modelAnswer').populate('topic', 'slug');
  if (!q) throw new AppError(404, 'NOT_FOUND', 'Question not found');
  const maxMarks = q.maxMarks ?? 1;
  let isCorrect: boolean, marks: number, subjective: any = null;
  if (q.type === 'SUBJECTIVE') {
    const ans = norm(body.answer ?? '');
    const kws: string[] = q.keywords ?? [];
    const found = kws.filter(k => ans.includes(norm(k)));
    marks = kws.length ? Math.round((found.length / kws.length) * maxMarks * 10) / 10 : 0;
    isCorrect = marks >= maxMarks / 2;
    subjective = { marks, maxMarks, found, missing: kws.filter(k => !found.includes(k)), modelAnswer: q.modelAnswer };
  } else {
    isCorrect = norm(body.answer) === norm(q.correctAnswer);
    marks = isCorrect ? maxMarks : 0;
  }
  const errorType = isCorrect ? null : classifyMistake(q, body.answer, subjective);
  await Attempt.create({ student: studentId, question: q._id, topic: q.topic._id, answer: body.answer, isCorrect, errorType, hintsUsed: body.hintsUsed, mode: body.mode, timeTakenMs: body.timeTakenMs });

  const p: any = (await TopicProgress.findOne({ student: studentId, topic: q.topic._id })) ?? new TopicProgress({ student: studentId, topic: q.topic._id });
  p.attempts += 1; if (isCorrect) p.correct += 1;
  p.recent = [...p.recent, isCorrect].slice(-10);
  adapt(p); p.mastery = computeMastery(p); p.state = STATE(p.mastery, p.attempts);
  await p.save();

  await touchStreak(studentId);
  let xp = null;
  if (isCorrect) xp = await awardXp(studentId, 'CORRECT_ANSWER', Math.max(2, q.xpReward - body.hintsUsed * 2));
  if (p.state === 'MASTERED') await checkBadges(studentId, { masteredTopicSlug: q.topic.slug });

  // "Why am I wrong?" - never just "Wrong"
  let whyWrong = null;
  if (!isCorrect && q.type !== 'SUBJECTIVE') {
    const m = (q.misconceptions ?? []).find((x: any) => norm(x.wrongAnswer) === norm(body.answer));
    whyWrong = {
      title: "Let's understand your mistake",
      yourAnswer: body.answer,
      explanation: m?.explanation ?? q.explanation ?? 'Look at the steps again carefully.',
      steps: q.solutionSteps ?? [],
      correctAnswer: q.correctAnswer,
    };
  }
  return { isCorrect, errorType, marks, maxMarks, subjective, xp, whyWrong, mastery: { value: p.mastery, state: p.state, nextDifficulty: p.currentDifficulty } };
}

export async function nextPracticeQuestion(studentId: string, topicId: string) {
  const p: any = await TopicProgress.findOne({ student: studentId, topic: topicId }).lean();
  const difficulty = p?.currentDifficulty ?? 'EASY';
  const recentIds = (await Attempt.find({ student: studentId, topic: topicId }).sort({ createdAt: -1 }).limit(5).lean()).map(a => a.question);
  const [q] = await Question.aggregate([
    { $match: { topic: (await Topic.findById(topicId))!._id, difficulty, status: 'PUBLISHED', _id: { $nin: recentIds } } },
    { $sample: { size: 1 } }, { $project: { correctAnswer: 0, misconceptions: 0, solutionSteps: 0, keywords: 0, modelAnswer: 0 } },
  ]);
  return q ?? null;
}

// Revision: questions the student got wrong before
export async function revisionSet(studentId: string, limit = 10) {
  const wrong = await Attempt.aggregate([
    { $match: { student: (await import('mongoose')).Types.ObjectId.createFromHexString(studentId), isCorrect: false } },
    { $group: { _id: '$question', last: { $max: '$createdAt' } } }, { $sort: { last: -1 } }, { $limit: limit },
  ]);
  return Question.find({ _id: { $in: wrong.map(w => w._id) } }).select('-misconceptions -solutionSteps').lean();
}
