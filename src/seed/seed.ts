import { env } from '../config/env';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { ClassLevel, Subject, Chapter, Topic, Question, Quiz, Level, Badge, User, Classroom, Assignment, SystemSetting } from '../models';
import curriculum from './data/cbse_9_10.json';

// CBSE (NCERT rationalised) Class 9 & 10 Mathematics. Every topic: step-by-step lesson + 5-question quiz (3 MCQ + 2 subjective).
type Step = { title: string; text: string; example?: string };
type QMcq = { type: 'mcq'; q: string; options: string[]; answer: number; explanation: string };
type QSub = { type: 'subjective'; q: string; modelAnswer: string; keywords: string[] };
type TopicData = { id: string; name: string; icon: string; summary: string; steps: Step[]; quiz: (QMcq | QSub)[] };
type ChapterData = { class: number; chapterNo: number; chapter: string; icon: string; color: string; topics: TopicData[] };

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Fills the curriculum, levels, badges and demo users.
 *  drop=true wipes the database first (CLI: `npm run seed -- --fresh`).
 *  drop=false only adds what is missing, so it is safe on a database that already has users. */
export async function seedDatabase({ drop = false }: { drop?: boolean } = {}) {
  if (drop) await mongoose.connection.db!.dropDatabase();
  if (!drop && (await Chapter.countDocuments()) > 0) { console.log('Seed skipped: curriculum already present.'); return; }

  // Class 1-12 exist in DB; only Class 9 and 10 are active for now (others "coming soon").
  const classes: any[] = [];
  for (let i = 1; i <= 12; i++) {
    classes.push(await ClassLevel.findOneAndUpdate({ order: i }, { $setOnInsert: { name: `Class ${i}`, order: i, isActive: i === 9 || i === 10 } }, { upsert: true, new: true }));
  }
  const classByNo = (n: number) => classes[n - 1];

  const subjects: Record<number, any> = {};
  for (const n of [9, 10]) subjects[n] = await Subject.findOneAndUpdate({ classLevel: classByNo(n)._id, name: 'Mathematics' }, { $setOnInsert: { classLevel: classByNo(n)._id, name: 'Mathematics', icon: '🧮', color: '#7C4DFF', order: 1 } }, { upsert: true, new: true });

  let topicCount = 0, questionCount = 0;
  let firstTopicC9: any = null;
  const prevChapter: Record<number, any> = {};
  for (const ch of curriculum as ChapterData[]) {
    const chapter = await Chapter.create({
      subject: subjects[ch.class]._id, name: ch.chapter, chapterNo: ch.chapterNo, slug: `c${ch.class}-${slugify(ch.chapter)}`,
      icon: ch.icon, color: ch.color, order: ch.chapterNo, unlockAfter: prevChapter[ch.class]?._id ?? null,
    });
    prevChapter[ch.class] = chapter;

    for (let i = 0; i < ch.topics.length; i++) {
      const t = ch.topics[i];
      const topic = await Topic.create({
        chapter: chapter._id, name: t.name, slug: t.id, icon: t.icon, summary: t.summary, order: i + 1,
        steps: t.steps.map(s => ({ kind: 'concept', title: s.title, content: s.text, example: s.example ?? '' })),
      });
      if (!firstTopicC9 && ch.class === 9) firstTopicC9 = topic;

      const qs = await Question.insertMany(t.quiz.map((q, k) => q.type === 'mcq'
        ? { topic: topic._id, type: 'MCQ', difficulty: k === 0 ? 'EASY' : 'MEDIUM', text: q.q, options: q.options, correctAnswer: q.options[q.answer],
            explanation: q.explanation, hints: [], solutionSteps: [q.explanation], maxMarks: 1, xpReward: 10, tags: [t.id, `class-${ch.class}`] }
        : { topic: topic._id, type: 'SUBJECTIVE', difficulty: 'HARD', text: q.q, correctAnswer: q.modelAnswer, modelAnswer: q.modelAnswer,
            keywords: q.keywords, explanation: q.modelAnswer, solutionSteps: q.modelAnswer.split('\n').filter(Boolean), maxMarks: 2, xpReward: 20, tags: [t.id, `class-${ch.class}`] }));
      const quiz = await Quiz.create({ title: `${t.name} Quiz`, topic: topic._id, questions: qs.map(q => q._id) });
      topic.set('quiz', quiz._id); await topic.save();
      topicCount++; questionCount += qs.length;
    }
  }

  if (!(await Level.countDocuments())) await Level.insertMany([[1, 'Math Beginner', 0], [2, 'Number Explorer', 500], [3, 'Calculation Hero', 1000], [4, 'Math Adventurer', 1500], [5, 'Problem Solver', 2000], [6, 'Math Master', 2500]]
    .map(([level, title, minXp]) => ({ level, title, minXp })));
  if (!(await Badge.countDocuments())) await Badge.insertMany([
    { code: 'FIRST_QUIZ', name: 'First Quiz', icon: '🏅', rule: { type: 'FIRST_QUIZ' } },
    { code: 'PERFECT', name: 'Perfect Score', icon: '🏆', rule: { type: 'PERFECT_QUIZ' } },
    { code: 'STREAK_3', name: '3-Day Streak', icon: '🔥', rule: { type: 'STREAK', value: 3 } },
    { code: 'STREAK_7', name: '7-Day Streak', icon: '🔥', rule: { type: 'STREAK', value: 7 } },
    { code: 'LESSONS', name: 'Lesson Explorer', icon: '📚', rule: { type: 'LESSONS', value: 10 } },
    { code: 'SPEED', name: 'Speed Calculator', icon: '⚡', rule: { type: 'SPEED_SCORE', value: 15 } },
    { code: 'PUZZLE', name: 'Puzzle Master', icon: '🧠', rule: { type: 'PUZZLES', value: 10 } },
  ]);
  if (!(await SystemSetting.countDocuments({ key: 'xpRules' }))) await SystemSetting.create({ key: 'xpRules', value: { CORRECT_ANSWER: 10, LESSON_COMPLETE: 25, QUIZ_COMPLETE: 50, DAILY_CHALLENGE: 30, PERFECT_QUIZ: 100 } });

  // Demo users all start fresh: 0 XP, no progress. Existing accounts are never touched.
  const hash = await bcrypt.hash('Password@123', 12);
  const c9 = classByNo(9);
  const ensure = async (doc: any) => (await User.findOne({ email: doc.email })) || (await User.create(doc));
  const aarya = await ensure({ name: 'Aarya', email: 'aarya@mathquest.dev', passwordHash: hash, role: 'STUDENT', classLevel: c9._id, xp: 0 });
  const others: any[] = [];
  for (const n of ['Kabir', 'Meera', 'Rohan', 'Zoya']) others.push(await ensure({ name: n, email: `${n.toLowerCase()}@mathquest.dev`, passwordHash: hash, role: 'STUDENT', classLevel: c9._id, xp: 0 }));
  await ensure({ name: 'Aarya Parent', email: 'parent@mathquest.dev', passwordHash: hash, role: 'PARENT', children: [aarya._id] });
  const teacher = await ensure({ name: 'Ms. Sharma', email: 'teacher@mathquest.dev', passwordHash: hash, role: 'TEACHER' });
  // Owner / super admin from env (ADMIN_EMAIL, ADMIN_PASSWORD). Without ADMIN_PASSWORD it gets a random,
  // unusable password; set the env vars and restart to log in (ensureAdmin applies them on start).
  const adminPw = env.adminPassword || crypto.randomBytes(24).toString('hex');
  if (!env.adminPassword) console.warn('ADMIN_PASSWORD is not set: the admin account was created with a random password.');
  await ensure({ name: env.adminName, email: env.adminEmail, passwordHash: await bcrypt.hash(adminPw, 12), role: 'SUPER_ADMIN', emailVerified: true });
  if (!(await Classroom.countDocuments({ teacher: teacher._id }))) {
    const room = await Classroom.create({ name: 'Class 9-A', teacher: teacher._id, classLevel: c9._id, students: [aarya._id, ...others.map(o => o._id)] });
    if (firstTopicC9) await Assignment.create({ classroom: room._id, kind: 'LESSON', title: `Start: ${firstTopicC9.name}`, topic: firstTopicC9._id, dueDate: new Date(Date.now() + 4 * 86400000) });
  }

  console.log(`Seeded CBSE Class 9-10: ${(curriculum as ChapterData[]).length} chapters, ${topicCount} topics, ${questionCount} questions.`);
  console.log('Demo logins: aarya@ / parent@ / teacher@mathquest.dev (password in README). Admin: ADMIN_EMAIL / ADMIN_PASSWORD env.');
}

// CLI: `npm run seed` (adds what is missing) or `npm run seed -- --fresh` (wipes the database first)
if (require.main === module) {
  connectDB()
    .then(() => seedDatabase({ drop: process.argv.includes('--fresh') }))
    .then(() => mongoose.disconnect())
    .catch(e => { console.error(e); process.exit(1); });
}
