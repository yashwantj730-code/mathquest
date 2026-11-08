import { Request, Response } from 'express';
import { ok, AppError } from '../utils/apiResponse';
import * as auth from '../services/auth.service';
import * as learning from '../services/learning.service';
import * as dash from '../services/dashboard.service';
import * as doubt from '../services/doubt.service';
import * as admin from '../services/admin.service';
import { awardXp, checkBadges, levelFor } from '../services/gamification.service';
import { ClassLevel, Subject, Chapter, Topic, Question, Quiz, QuizAttempt, TopicProgress, Badge, StudentBadge, Level, Classroom, Assignment, Notification, User } from '../models';

const uid = (req: Request) => req.user!.id;
const authCookie = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: 7 * 86400000 };

export const AuthController = {
  register: async (req: Request, res: Response) => { const r = await auth.register(req.body); res.cookie('token', r.token, authCookie); ok(res, r, 'Registered', 201); },
  login: async (req: Request, res: Response) => { const r = await auth.login(req.body.email, req.body.password); res.cookie('token', r.token, authCookie); ok(res, r, 'Logged in'); },
  logout: async (_req: Request, res: Response) => { res.clearCookie('token'); ok(res, {}, 'Logged out'); },
  me: async (req: Request, res: Response) => { const u: any = await User.findById(uid(req)).lean(); ok(res, { ...u, level: await levelFor(u.xp) }); },
};

export const CurriculumController = {
  classes: async (_req: Request, res: Response) => ok(res, await ClassLevel.find().sort({ order: 1 }).lean()),
  subjects: async (req: Request, res: Response) => ok(res, await Subject.find({ classLevel: req.params.classId }).sort({ order: 1 }).lean()),
  chapters: async (req: Request, res: Response) => ok(res, await Chapter.find({ subject: req.params.subjectId }).sort({ order: 1 }).lean()),
  topics: async (req: Request, res: Response) => {
    const topics = await Topic.find({ chapter: req.params.chapterId }).sort({ order: 1 }).select('-steps').lean();
    const prog = req.user ? await TopicProgress.find({ student: uid(req), topic: { $in: topics.map(t => t._id) } }).lean() : [];
    ok(res, topics.map(t => { const p = prog.find(x => String(x.topic) === String(t._id)); return { ...t, mastery: p?.mastery ?? 0, state: p?.state ?? 'NOT_STARTED' }; }));
  },
  topic: async (req: Request, res: Response) => { const t = await Topic.findById(req.params.topicId).lean(); if (!t) throw new AppError(404, 'NOT_FOUND', 'Topic not found'); ok(res, t); },
  // One call for the frontend Learn screen: all chapters of a class with topics, steps and the student's mastery
  curriculum: async (req: Request, res: Response) => {
    const classNo = Number(req.query.class ?? 9);
    const cls = await ClassLevel.findOne({ order: classNo, isActive: true }).lean(); if (!cls) throw new AppError(404, 'NOT_FOUND', 'Class not available');
    const subject = await Subject.findOne({ classLevel: cls._id }).lean(); if (!subject) return ok(res, { class: classNo, chapters: [] });
    const chapters = await Chapter.find({ subject: subject._id }).sort({ order: 1 }).lean();
    const topics: any[] = await Topic.find({ chapter: { $in: chapters.map(c => c._id) } }).sort({ order: 1 }).lean();
    const prog: any[] = await TopicProgress.find({ student: uid(req), topic: { $in: topics.map(t => t._id) } }).lean();
    const out = chapters.map(c => {
      const ts = topics.filter(t => String(t.chapter) === String(c._id)).map(t => {
        const p = prog.find(x => String(x.topic) === String(t._id));
        return { id: t._id, slug: t.slug, name: t.name, icon: t.icon, summary: t.summary, quizId: t.quiz,
          steps: (t.steps ?? []).map((s: any) => ({ title: s.title, text: s.content, example: s.example })),
          mastery: p?.mastery ?? 0, state: p?.state ?? 'NOT_STARTED', stepsDone: !!p?.stepsDone, lastStep: p?.lastStep ?? 0 };
      });
      const mastery = ts.length ? Math.round(ts.reduce((s, t) => s + t.mastery, 0) / ts.length) : 0;
      return { id: c._id, chapterNo: c.chapterNo, name: c.name, icon: c.icon, color: c.color, mastery, topics: ts };
    });
    let unlocked = true; // chapter unlocks when previous chapter >= 50%
    for (const ch of out as any[]) { ch.locked = !unlocked; if (ch.mastery < 50) unlocked = false; }
    ok(res, { class: classNo, subjectId: subject._id, chapters: out });
  },
  completeSteps: async (req: Request, res: Response) => {
    const p: any = (await TopicProgress.findOne({ student: uid(req), topic: req.params.topicId })) ?? new TopicProgress({ student: uid(req), topic: req.params.topicId });
    let xp = null;
    if (!p.stepsDone) { p.stepsDone = true; if (p.state === 'NOT_STARTED') p.state = 'LEARNING'; await p.save(); xp = await awardXp(uid(req), 'LESSON_COMPLETE'); }
    ok(res, { stepsDone: true, xp, state: p.state });
  },
  topicQuiz: async (req: Request, res: Response) => {
    const t: any = await Topic.findById(req.params.topicId).lean(); if (!t?.quiz) throw new AppError(404, 'NOT_FOUND', 'Quiz not found');
    const quiz = await Quiz.findById(t.quiz).populate({ path: 'questions', select: '-misconceptions -solutionSteps' }).lean();
    ok(res, quiz);
  },
  saveStep: async (req: Request, res: Response) => {
    const p: any = await TopicProgress.findOneAndUpdate({ student: uid(req), topic: req.params.topicId }, { lastStep: Number(req.body.step) || 0 }, { upsert: true, new: true });
    if (p.state === 'NOT_STARTED') { p.state = 'LEARNING'; await p.save(); }
    ok(res, p, 'Progress saved');
  },
  journey: async (req: Request, res: Response) => {
    const chapters = await Chapter.find({ subject: req.params.subjectId }).sort({ order: 1 }).lean();
    const topics = await Topic.find({ chapter: { $in: chapters.map(c => c._id) } }).select('_id chapter').lean();
    const prog = await TopicProgress.find({ student: uid(req), topic: { $in: topics.map(t => t._id) } }).lean();
    const chapterMastery = (cid: any) => { const ts = topics.filter(t => String(t.chapter) === String(cid)); if (!ts.length) return 0;
      return Math.round(ts.reduce((s, t) => s + (prog.find(p => String(p.topic) === String(t._id))?.mastery ?? 0), 0) / ts.length); };
    let unlocked = true;
    const nodes = chapters.map(c => { const m = chapterMastery(c._id); const node = { id: c._id, name: c.name, icon: c.icon, mastery: m, status: !unlocked ? 'LOCKED' : m >= 50 ? 'DONE' : 'CURRENT' };
      if (node.status !== 'DONE') unlocked = false; return node; });
    ok(res, nodes);
  },
  search: async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '').slice(0, 50);
    if (!q) return ok(res, []);
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [chapters, topics] = await Promise.all([Chapter.find({ name: rx }).limit(10).lean(), Topic.find({ name: rx }).select('-steps').limit(10).lean()]);
    ok(res, { chapters, topics });
  },
};

export const PracticeController = {
  next: async (req: Request, res: Response) => ok(res, await learning.nextPracticeQuestion(uid(req), req.params.topicId)),
  answer: async (req: Request, res: Response) => ok(res, await learning.submitAnswer(uid(req), req.body)),
  hint: async (req: Request, res: Response) => ok(res, await learning.getHint(req.params.questionId, Number(req.query.index ?? 0))),
  revision: async (req: Request, res: Response) => ok(res, await learning.revisionSet(uid(req))),
};

export const QuizController = {
  get: async (req: Request, res: Response) => {
    const quiz = await Quiz.findById(req.params.quizId).populate({ path: 'questions', select: '-misconceptions -solutionSteps' }).lean();
    if (!quiz) throw new AppError(404, 'NOT_FOUND', 'Quiz not found'); ok(res, quiz);
  },
  submit: async (req: Request, res: Response) => {
    const quiz = await Quiz.findById(req.params.quizId).lean(); if (!quiz) throw new AppError(404, 'NOT_FOUND', 'Quiz not found');
    const results = [];
    for (const a of req.body.answers) results.push({ questionId: a.questionId, answer: a.answer, ...(await learning.submitAnswer(uid(req), { ...a, hintsUsed: 0, mode: 'QUIZ' })) });
    const score = Math.round(results.reduce((s, r) => s + (r.marks ?? 0), 0) * 10) / 10;
    const total = results.reduce((s, r) => s + (r.maxMarks ?? 1), 0);
    const percent = total ? Math.round((score / total) * 100) : 0;
    const firstQuiz = !(await QuizAttempt.exists({ student: uid(req) }));
    let bonus = (await awardXp(uid(req), 'QUIZ_COMPLETE')).gained;
    const perfect = score >= total; if (perfect) bonus += (await awardXp(uid(req), 'PERFECT_QUIZ')).gained;
    const newBadges = await checkBadges(uid(req), { perfectQuiz: perfect, firstQuiz });
    const xpEarned = bonus + results.reduce((s, r) => s + (r.xp?.gained ?? 0), 0);
    await QuizAttempt.create({ quiz: quiz._id, student: uid(req), answers: results.map(r => ({ question: r.questionId, answer: r.answer, isCorrect: r.isCorrect, marks: r.marks, maxMarks: r.maxMarks })), score, total, percent, xpEarned });
    if (quiz.topic) { // topic quiz score drives mastery (keep best)
      const p: any = await TopicProgress.findOne({ student: uid(req), topic: quiz.topic });
      if (p && percent > (p.mastery ?? 0)) { p.mastery = percent; p.state = percent >= 90 ? 'MASTERED' : percent >= 75 ? 'PROFICIENT' : percent >= 55 ? 'DEVELOPING' : 'LEARNING'; await p.save(); }
    }
    ok(res, { score, total, percent, accuracy: percent, xpEarned, perfect, newBadges, results });
  },
};

export const GamificationController = {
  levels: async (_req: Request, res: Response) => ok(res, await Level.find().sort({ level: 1 }).lean()),
  badges: async (req: Request, res: Response) => {
    const [all, mine] = await Promise.all([Badge.find().lean(), StudentBadge.find({ student: uid(req) }).lean()]);
    ok(res, all.map(b => ({ ...b, earned: mine.some(m => String(m.badge) === String(b._id)) })));
  },
  leaderboard: async (_req: Request, res: Response) => ok(res, await dash.weeklyLeaderboard(20)),
  dailyChallenge: async (req: Request, res: Response) => { const r = await awardXp(uid(req), 'DAILY_CHALLENGE'); ok(res, r, 'Daily challenge complete'); },
};

export const DashboardController = {
  home: async (req: Request, res: Response) => ok(res, await dash.studentHome(uid(req))),
  parent: async (req: Request, res: Response) => { const r = await dash.parentSummary(uid(req), req.params.childId); if (!r) throw new AppError(403, 'FORBIDDEN', 'Not your child'); ok(res, r); },
  teacher: async (req: Request, res: Response) => { const r = await dash.teacherClassSummary(uid(req), req.params.classroomId); if (!r) throw new AppError(404, 'NOT_FOUND', 'Classroom not found'); ok(res, r); },
};

export const TeacherController = {
  myClasses: async (req: Request, res: Response) => ok(res, await Classroom.find({ teacher: uid(req) }).lean()),
  assign: async (req: Request, res: Response) => {
    const c = await Classroom.findOne({ _id: req.params.classroomId, teacher: uid(req) }).lean(); if (!c) throw new AppError(404, 'NOT_FOUND', 'Classroom not found');
    const a = await Assignment.create({ ...req.body, classroom: c._id });
    await Notification.insertMany(c.students.map(s => ({ user: s, title: 'New assignment from your teacher', body: req.body.title })));
    ok(res, a, 'Assigned', 201);
  },
};

export const AdminController = {
  createQuestion: async (req: Request, res: Response) => ok(res, await Question.create({ ...req.body, createdBy: uid(req) }), 'Question created', 201),
  updateQuestion: async (req: Request, res: Response) => ok(res, await Question.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: uid(req) }, { new: true })),
  listQuestions: async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(100, Number(req.query.limit) || 20);
    const filter: any = {}; if (req.query.topic) filter.topic = req.query.topic; if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    const [items, total] = await Promise.all([Question.find(filter).skip((page - 1) * limit).limit(limit).lean(), Question.countDocuments(filter)]);
    ok(res, { items, page, limit, total });
  },
};

export const NotificationController = {
  list: async (req: Request, res: Response) => ok(res, await Notification.find({ user: uid(req) }).sort({ createdAt: -1 }).limit(30).lean()),
  read: async (req: Request, res: Response) => ok(res, await Notification.findOneAndUpdate({ _id: req.params.id, user: uid(req) }, { read: true }, { new: true })),
};

export const DoubtController = {
  ocr: async (req: Request, res: Response) => ok(res, await doubt.ocrImage(String(req.body?.image ?? ''))),
  explain: async (req: Request, res: Response) => {
    const question = String(req.body?.question ?? '').trim().slice(0, 2000);
    if (!question) throw new AppError(400, 'VALIDATION', 'question is required');
    ok(res, await doubt.explainDoubt(question));
  },
};
export const AnalysisController = {
  me: async (req: Request, res: Response) => ok(res, await doubt.studentAnalysis(uid(req), req.query.class ? Number(req.query.class) : undefined)),
  student: async (req: Request, res: Response) => {
    const me: any = await User.findById(uid(req)).lean();
    const sid = req.params.studentId;
    const allowed = me.role === 'ADMIN' || me.role === 'SUPER_ADMIN' || (me.role === 'PARENT' && (me.children ?? []).some((c: any) => String(c) === sid))
      || (me.role === 'TEACHER' && await Classroom.exists({ teacher: me._id, students: sid }));
    if (!allowed) throw new AppError(403, 'FORBIDDEN', 'Not allowed to view this student');
    ok(res, await doubt.studentAnalysis(sid));
  },
};

const role = (req: Request) => (req as any).user?.role as string;
export const AdminPanelController = {
  stats: async (_req: Request, res: Response) => ok(res, await admin.stats()),
  users: async (req: Request, res: Response) => ok(res, await admin.listUsers(req.query as any)),
  createUser: async (req: Request, res: Response) => ok(res, await admin.createUser(role(req), req.body ?? {}), 'User created', 201),
  updateUser: async (req: Request, res: Response) => ok(res, await admin.updateUser(uid(req), role(req), req.params.id, req.body ?? {})),
  deleteUser: async (req: Request, res: Response) => ok(res, await admin.deleteUser(uid(req), role(req), req.params.id)),
  classes: async (_req: Request, res: Response) => ok(res, await admin.listClasses()),
  setClass: async (req: Request, res: Response) => ok(res, await admin.setClassActive(req.params.id, !!req.body?.isActive)),
  getSetting: async (req: Request, res: Response) => ok(res, await admin.getSetting(req.params.key)),
  putSetting: async (req: Request, res: Response) => ok(res, await admin.putSetting(req.params.key, req.body?.value)),
  deleteQuestion: async (req: Request, res: Response) => ok(res, await admin.removeQuestion(req.params.id)),
  curriculum: async (req: Request, res: Response) => ok(res, await admin.adminCurriculum(Number(req.query.class ?? 9))),
  createChapter: async (req: Request, res: Response) => ok(res, await admin.createChapter(req.body ?? {}), 'Chapter created', 201),
  deleteChapter: async (req: Request, res: Response) => ok(res, await admin.deleteChapter(req.params.id)),
  createTopic: async (req: Request, res: Response) => ok(res, await admin.createTopic(req.body ?? {}), 'Topic created', 201),
  deleteTopic: async (req: Request, res: Response) => ok(res, await admin.deleteTopic(req.params.id)),
  topicQuestions: async (req: Request, res: Response) => ok(res, await admin.topicQuestionsFull(req.params.id)),
  addQuestion: async (req: Request, res: Response) => ok(res, await admin.addTopicQuestion(req.params.id, uid(req), req.body ?? {}), 'Question added', 201),
  editQuestion: async (req: Request, res: Response) => ok(res, await admin.updateTopicQuestion(req.params.id, req.body ?? {})),
};

/* ---------- Step 1: Profile + Settings ---------- */
import * as profile from '../services/profile.service';
export const ProfileController = {
  get: async (req: Request, res: Response) => ok(res, await profile.getProfile(uid(req))),
  update: async (req: Request, res: Response) => ok(res, await profile.updateProfile(uid(req), req.body), 'Profile updated'),
  settings: async (req: Request, res: Response) => ok(res, await profile.getSettings(uid(req))),
  updateSettings: async (req: Request, res: Response) => ok(res, await profile.updateSettings(uid(req), req.body), 'Settings saved'),
  password: async (req: Request, res: Response) => {
    await profile.changePassword(uid(req), req.body.currentPassword, req.body.newPassword);
    res.clearCookie('token'); ok(res, { changed: true }, 'Password changed. Please log in again.');
  },
  remove: async (req: Request, res: Response) => { await profile.deleteAccount(uid(req), req.body.password); res.clearCookie('token'); ok(res, { deleted: true }, 'Account deleted'); },
};
