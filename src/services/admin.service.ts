import bcrypt from 'bcryptjs';
import { User, ClassLevel, Chapter, Topic, Question, Attempt, SystemSetting, Classroom, TopicProgress } from '../models';
import { AppError } from '../utils/apiResponse';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function stats() {
  const [byRoleAgg, blocked, chapters, topics, questions, attempts, correct, activeClasses, newThisWeek] = await Promise.all([
    User.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$role', n: { $sum: 1 } } }]),
    User.countDocuments({ deletedAt: null, isBlocked: true }),
    Chapter.countDocuments(), Topic.countDocuments(), Question.countDocuments({ deletedAt: { $in: [null, undefined] } }),
    Attempt.countDocuments(), Attempt.countDocuments({ isCorrect: true }),
    ClassLevel.countDocuments({ isActive: true }),
    User.countDocuments({ deletedAt: null, createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
  ]);
  const byRole: Record<string, number> = {}; byRoleAgg.forEach((r: any) => { byRole[r._id] = r.n; });
  const users = Object.values(byRole).reduce((a, b) => a + b, 0);
  return { users, byRole, blocked, chapters, topics, questions, attempts, accuracy: attempts ? Math.round((correct / attempts) * 100) : 0, activeClasses, newThisWeek };
}

export async function listUsers(q: { search?: string; role?: string; page?: number; limit?: number }) {
  const page = Math.max(1, Number(q.page) || 1), limit = Math.min(100, Number(q.limit) || 20);
  const filter: any = { deletedAt: null };
  if (q.role) filter.role = q.role === 'ADMIN' ? { $in: ADMIN_ROLES } : q.role;
  if (q.search) { const re = new RegExp(escRe(String(q.search).slice(0, 60)), 'i'); filter.$or = [{ name: re }, { email: re }]; }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('classLevel', 'order name').lean(),
    User.countDocuments(filter),
  ]);
  return { items: items.map((u: any) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, isBlocked: !!u.isBlocked, classNo: u.classLevel?.order ?? null, xp: u.xp, createdAt: u.createdAt })), page, limit, total };
}

export async function createUser(actorRole: string, d: { name: string; email: string; password: string; role: string }) {
  if (!d.name || d.name.trim().length < 2) throw new AppError(400, 'VALIDATION', 'Name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email || '')) throw new AppError(400, 'VALIDATION', 'Valid email is required');
  if (!d.password || d.password.length < 8 || !/\d/.test(d.password)) throw new AppError(400, 'VALIDATION', 'Password needs 8+ characters with a number');
  if (!['STUDENT', 'PARENT', 'TEACHER', 'ADMIN'].includes(d.role)) throw new AppError(400, 'VALIDATION', 'Invalid role');
  if (d.role === 'ADMIN' && !ADMIN_ROLES.includes(actorRole)) throw new AppError(403, 'FORBIDDEN', 'Only admins can create admins');
  const email = d.email.toLowerCase().trim();
  if (await User.exists({ email })) throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
  const u = await User.create({ name: d.name.trim(), email, passwordHash: await bcrypt.hash(d.password, 12), role: d.role });
  return { _id: u._id, name: u.name, email: u.email, role: u.role };
}

export async function updateUser(actorId: string, actorRole: string, id: string, patch: { role?: string; isBlocked?: boolean; name?: string }) {
  if (String(actorId) === String(id)) throw new AppError(400, 'SELF_EDIT', 'You can’t change your own role or block yourself');
  const u: any = await User.findOne({ _id: id, deletedAt: null }); if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (u.role === 'SUPER_ADMIN' && actorRole !== 'SUPER_ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only a super admin can change a super admin');
  if (patch.role) {
    if (!['STUDENT', 'PARENT', 'TEACHER', 'ADMIN'].includes(patch.role)) throw new AppError(400, 'VALIDATION', 'Invalid role');
    u.role = patch.role;
  }
  if (typeof patch.isBlocked === 'boolean') u.isBlocked = patch.isBlocked;
  if (patch.name && patch.name.trim().length >= 2) u.name = patch.name.trim();
  await u.save();
  return { _id: u._id, name: u.name, email: u.email, role: u.role, isBlocked: u.isBlocked };
}

export async function deleteUser(actorId: string, actorRole: string, id: string) {
  if (String(actorId) === String(id)) throw new AppError(400, 'SELF_DELETE', 'You can’t delete your own account here');
  const u: any = await User.findOne({ _id: id, deletedAt: null }); if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (u.role === 'SUPER_ADMIN' && actorRole !== 'SUPER_ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only a super admin can delete a super admin');
  u.deletedAt = new Date(); u.email = `deleted+${u._id}@${u.email.split('@')[1] || 'mathquest.dev'}`; await u.save(); // soft delete, frees the email
  await Classroom.updateMany({ students: u._id }, { $pull: { students: u._id } });
  return { deleted: true };
}

export async function listClasses() {
  const l = await ClassLevel.find().sort({ order: 1 }).lean();
  return l.map((c: any) => ({ _id: c._id, name: c.name, classNo: c.order, isActive: c.isActive !== false }));
}
export async function setClassActive(id: string, isActive: boolean) {
  const c = await ClassLevel.findByIdAndUpdate(id, { isActive: !!isActive }, { new: true }); if (!c) throw new AppError(404, 'NOT_FOUND', 'Class not found');
  return { _id: c._id, classNo: (c as any).order, isActive: (c as any).isActive };
}

export async function getSetting(key: string) {
  const s: any = await SystemSetting.findOne({ key }).lean(); return { key, value: s?.value ?? {} };
}
export async function putSetting(key: string, value: any) {
  if (key !== 'xpRules') throw new AppError(400, 'VALIDATION', 'Unknown setting');
  const clean: Record<string, number> = {};
  for (const k of ['CORRECT_ANSWER', 'LESSON_COMPLETE', 'QUIZ_COMPLETE', 'DAILY_CHALLENGE', 'PERFECT_QUIZ']) clean[k] = Math.max(0, Math.min(1000, Number(value?.[k]) || 0));
  await SystemSetting.updateOne({ key }, { $set: { value: clean } }, { upsert: true });
  return { key, value: clean };
}

export async function deleteQuestion(id: string) {
  const q = await Question.findById(id); if (!q) throw new AppError(404, 'NOT_FOUND', 'Question not found');
  await q.deleteOne(); return { deleted: true };
}
export { TopicProgress };

/* ================= Content management: chapters, topics, questions ================= */
import { Subject, Quiz } from '../models';
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const clip = (s: any, n: number) => String(s ?? '').trim().slice(0, n);

export async function adminCurriculum(classNo: number) {
  const cls = await ClassLevel.findOne({ order: classNo }).lean(); if (!cls) throw new AppError(404, 'NOT_FOUND', 'Class not found');
  const subject = await Subject.findOne({ classLevel: cls._id }).lean(); if (!subject) return { classNo, chapters: [] };
  const chapters = await Chapter.find({ subject: subject._id }).sort({ order: 1 }).lean();
  const topics: any[] = await Topic.find({ chapter: { $in: chapters.map(c => c._id) } }).sort({ order: 1 }).lean();
  return { classNo, chapters: chapters.map((c: any) => ({ _id: c._id, name: c.name, chapterNo: c.chapterNo, icon: c.icon, color: c.color,
    topics: topics.filter(t => String(t.chapter) === String(c._id)).map(t => ({ _id: t._id, slug: t.slug, name: t.name, quizId: t.quiz })) })) };
}

export async function createChapter(d: { classNo: number; name: string; icon?: string; color?: string }) {
  const name = clip(d.name, 80); if (name.length < 2) throw new AppError(400, 'VALIDATION', 'Chapter name is required');
  const cls = await ClassLevel.findOne({ order: Number(d.classNo) }); if (!cls) throw new AppError(404, 'NOT_FOUND', 'Class not found');
  let subject = await Subject.findOne({ classLevel: cls._id });
  if (!subject) subject = await Subject.create({ classLevel: cls._id, name: 'Mathematics', icon: '🧮', color: '#7C4DFF', order: 1 });
  const last: any = await Chapter.findOne({ subject: subject._id }).sort({ chapterNo: -1 }).lean();
  const chapterNo = (last?.chapterNo ?? 0) + 1;
  const c = await Chapter.create({ subject: subject._id, name, chapterNo, order: chapterNo, slug: `c${d.classNo}-${slugify(name)}`,
    icon: clip(d.icon, 8) || '📘', color: /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#7C4DFF', unlockAfter: last?._id ?? null });
  return { _id: c._id, name: c.name, chapterNo, icon: c.icon, color: c.color };
}

export async function deleteChapter(id: string) {
  const c: any = await Chapter.findById(id); if (!c) throw new AppError(404, 'NOT_FOUND', 'Chapter not found');
  const topics = await Topic.find({ chapter: c._id }).select('_id').lean();
  for (const t of topics) await deleteTopic(String(t._id));
  await Chapter.updateMany({ unlockAfter: c._id }, { unlockAfter: c.unlockAfter ?? null });
  await c.deleteOne(); return { deleted: true };
}

type StepIn = { title: string; text?: string; content?: string; example?: string };
export async function createTopic(d: { chapterId: string; name: string; icon?: string; summary?: string; steps?: StepIn[] }) {
  const ch: any = await Chapter.findById(d.chapterId).populate({ path: 'subject', populate: { path: 'classLevel' } }); if (!ch) throw new AppError(404, 'NOT_FOUND', 'Chapter not found');
  const name = clip(d.name, 80); if (name.length < 2) throw new AppError(400, 'VALIDATION', 'Topic name is required');
  const steps = (d.steps ?? []).filter(s => s && clip(s.title, 120)).slice(0, 12).map(s => ({ kind: 'concept', title: clip(s.title, 120), content: clip(s.text ?? s.content, 2000), example: clip(s.example, 500) }));
  if (!steps.length) throw new AppError(400, 'VALIDATION', 'Add at least one lesson step');
  const n = await Topic.countDocuments({ chapter: ch._id });
  const classNo = ch.subject?.classLevel?.order ?? 0;
  let slug = `c${classNo}-ch${ch.chapterNo}-t${n + 1}`; while (await Topic.exists({ slug })) slug += 'x';
  const t = await Topic.create({ chapter: ch._id, name, slug, icon: clip(d.icon, 8) || '📐', summary: clip(d.summary, 300), order: n + 1, steps });
  const quiz = await Quiz.create({ title: `${name} Quiz`, topic: t._id, questions: [] });
  t.set('quiz', quiz._id); await t.save();
  return { _id: t._id, slug, name, quizId: quiz._id };
}

export async function deleteTopic(id: string) {
  const t: any = await Topic.findById(id); if (!t) throw new AppError(404, 'NOT_FOUND', 'Topic not found');
  await Question.deleteMany({ topic: t._id }); await Quiz.deleteMany({ topic: t._id }); await TopicProgress.deleteMany({ topic: t._id });
  await t.deleteOne(); return { deleted: true };
}

export async function addTopicQuestion(topicId: string, actorId: string, d: any) {
  const t: any = await Topic.findById(topicId); if (!t) throw new AppError(404, 'NOT_FOUND', 'Topic not found');
  const text = clip(d.text, 1000); if (!text) throw new AppError(400, 'VALIDATION', 'Question text is required');
  let doc: any;
  if (d.type === 'SUBJECTIVE') {
    const modelAnswer = clip(d.modelAnswer, 3000), keywords = (Array.isArray(d.keywords) ? d.keywords : []).map((k: any) => clip(k, 60)).filter(Boolean).slice(0, 15);
    if (!modelAnswer || !keywords.length) throw new AppError(400, 'VALIDATION', 'Model answer and at least one keyword are required');
    doc = { topic: t._id, type: 'SUBJECTIVE', difficulty: 'HARD', text, correctAnswer: modelAnswer, modelAnswer, keywords, explanation: modelAnswer, solutionSteps: modelAnswer.split('\n').filter(Boolean), maxMarks: 2, xpReward: 20, createdBy: actorId };
  } else {
    const options = (Array.isArray(d.options) ? d.options : []).map((o: any) => clip(o, 300));
    const ci = Number(d.correctIndex);
    if (options.length < 2 || options.some((o: string) => !o) || !(ci >= 0 && ci < options.length)) throw new AppError(400, 'VALIDATION', 'Give 2-6 options and the correct one');
    doc = { topic: t._id, type: 'MCQ', difficulty: 'MEDIUM', text, options, correctAnswer: options[ci], explanation: clip(d.explanation, 1000), hints: d.hint ? [clip(d.hint, 300)] : [], solutionSteps: d.explanation ? [clip(d.explanation, 1000)] : [], maxMarks: 1, xpReward: 10, createdBy: actorId };
  }
  const q = await Question.create(doc);
  let quiz: any = t.quiz ? await Quiz.findById(t.quiz) : null;
  if (!quiz) { quiz = await Quiz.create({ title: `${t.name} Quiz`, topic: t._id, questions: [] }); t.set('quiz', quiz._id); await t.save(); }
  quiz.questions.push(q._id); await quiz.save();
  return { _id: q._id, type: q.type };
}

export async function topicQuestionsFull(topicId: string) {
  const t: any = await Topic.findById(topicId).lean(); if (!t) throw new AppError(404, 'NOT_FOUND', 'Topic not found');
  const quiz: any = t.quiz ? await Quiz.findById(t.quiz).lean() : null;
  const qs: any[] = await Question.find({ topic: t._id }).select('+correctAnswer +keywords +modelAnswer').lean();
  const order = (quiz?.questions ?? []).map(String);
  qs.sort((a, b) => (order.indexOf(String(a._id)) + 1 || 1e9) - (order.indexOf(String(b._id)) + 1 || 1e9));
  return qs;
}
export async function updateTopicQuestion(id: string, d: any) {
  const q: any = await Question.findById(id).select('+correctAnswer +keywords +modelAnswer'); if (!q) throw new AppError(404, 'NOT_FOUND', 'Question not found');
  if (d.text) q.text = clip(d.text, 1000);
  if (q.type === 'SUBJECTIVE') {
    if (Array.isArray(d.keywords)) q.keywords = d.keywords.map((k: any) => clip(k, 60)).filter(Boolean);
    if (d.modelAnswer) { q.modelAnswer = clip(d.modelAnswer, 3000); q.correctAnswer = q.modelAnswer; }
  } else if (Array.isArray(d.options)) {
    q.options = d.options.map((o: any) => clip(o, 300)); const ci = Number(d.correctIndex); if (ci >= 0 && ci < q.options.length) q.correctAnswer = q.options[ci];
  }
  await q.save(); return { _id: q._id };
}
export async function removeQuestion(id: string) {
  const q = await Question.findById(id); if (!q) throw new AppError(404, 'NOT_FOUND', 'Question not found');
  await Quiz.updateMany({ questions: q._id }, { $pull: { questions: q._id } }); await q.deleteOne(); return { deleted: true };
}
