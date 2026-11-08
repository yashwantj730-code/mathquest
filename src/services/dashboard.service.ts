import { Types } from 'mongoose';
import { User, TopicProgress, Attempt, Streak, StudentBadge, Assignment, Classroom } from '../models';
import { levelFor } from './gamification.service';
import { dayKey } from '../utils/dates';

// Ordered exactly like the Home screen: greeting -> today's plan -> daily challenge -> progress -> recommended -> achievements -> leaderboard
export async function studentHome(studentId: string) {
  const sid = new Types.ObjectId(studentId);
  const user: any = await User.findById(sid).lean();
  const [streak, progress, badges, todayCount, leaderboard] = await Promise.all([
    Streak.findOne({ student: sid }).lean(),
    TopicProgress.find({ student: sid }).populate({ path: 'topic', select: 'name slug icon chapter', populate: { path: 'chapter', select: 'name icon' } }).sort({ updatedAt: -1 }).lean(),
    StudentBadge.find({ student: sid }).populate('badge').sort({ createdAt: -1 }).limit(4).lean(),
    Attempt.countDocuments({ student: sid, createdAt: { $gte: new Date(dayKey(new Date()) + 'T00:00:00+05:30') } }),
    weeklyLeaderboard(10),
  ]);
  const p = progress as any[];
  const continueLearning = p.find(x => x.state !== 'MASTERED') ?? null;
  const strong = p.filter(x => x.mastery >= 75), developing = p.filter(x => x.mastery >= 55 && x.mastery < 75), weak = p.filter(x => (x.attempts > 0 || x.stepsDone) && x.mastery < 55);
  return {
    greeting: { name: user.name, avatar: user.avatar, streak: streak?.current ?? 0, ...(await levelFor(user.xp)) },
    todaysPlan: {
      continueLearning: continueLearning && { topic: continueLearning.topic, mastery: continueLearning.mastery, resumeStep: continueLearning.lastStep },
      dailyGoal: { done: todayCount, target: user.dailyGoal },
    },
    dailyChallenge: { xp: 30, available: true },
    progress: { strong, developing, weak },
    recommended: weak.slice(0, 3).map(w => ({ topic: w.topic, reason: 'Weak topic', difficulty: w.currentDifficulty })),
    achievements: badges.map((b: any) => b.badge),
    leaderboard: user.leaderboardVisible ? leaderboard : null,
  };
}
export async function weeklyLeaderboard(limit = 10) {
  const since = new Date(Date.now() - 7 * 86400000);
  return (await import('../models')).XpTransaction.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$student', xp: { $sum: '$amount' } } }, { $sort: { xp: -1 } }, { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } }, { $unwind: '$u' },
    { $match: { 'u.leaderboardVisible': true } }, // privacy control
    { $project: { _id: 0, name: '$u.name', avatar: '$u.avatar', xp: 1 } },
  ]);
}
export async function parentSummary(parentId: string, childId: string) {
  const parent: any = await User.findById(parentId).lean();
  if (!parent?.children?.some((c: any) => String(c) === childId)) return null;
  const cid = new Types.ObjectId(childId);
  const since = new Date(Date.now() - 7 * 86400000);
  const [attempts, progress, streak] = await Promise.all([
    Attempt.find({ student: cid, createdAt: { $gte: since } }).lean(),
    TopicProgress.find({ student: cid }).populate('topic', 'name').lean(),
    Streak.findOne({ student: cid }).lean(),
  ]);
  const correct = attempts.filter(a => a.isCorrect).length;
  const minutes = Math.round(attempts.reduce((s, a) => s + (a.timeTakenMs ?? 30000), 0) / 60000);
  return {
    learningMinutesThisWeek: minutes, questionsSolved: attempts.length,
    accuracy: attempts.length ? Math.round((correct / attempts.length) * 100) : 0, streak: streak?.current ?? 0,
    strongTopics: (progress as any[]).filter(p => p.mastery >= 85).map(p => p.topic.name),
    weakTopics: (progress as any[]).filter(p => p.attempts && p.mastery < 65).map(p => p.topic.name),
  };
}
export async function teacherClassSummary(teacherId: string, classroomId: string) {
  const c: any = await Classroom.findOne({ _id: classroomId, teacher: teacherId }).populate('students', 'name avatar').lean();
  if (!c) return null;
  const ids = c.students.map((s: any) => s._id);
  const stats = await Attempt.aggregate([
    { $match: { student: { $in: ids } } },
    { $group: { _id: '$student', total: { $sum: 1 }, correct: { $sum: { $cond: ['$isCorrect', 1, 0] } } } },
  ]);
  const weak = await TopicProgress.aggregate([
    { $match: { student: { $in: ids }, attempts: { $gt: 0 } } },
    { $group: { _id: '$topic', avg: { $avg: '$mastery' } } }, { $sort: { avg: 1 } }, { $limit: 5 },
    { $lookup: { from: 'topics', localField: '_id', foreignField: '_id', as: 't' } }, { $unwind: '$t' },
    { $project: { _id: 0, topic: '$t.name', avgMastery: { $round: ['$avg', 0] } } },
  ]);
  const assignments = await Assignment.find({ classroom: classroomId }).lean();
  const students = c.students.map((s: any) => {
    const st = stats.find(x => String(x._id) === String(s._id));
    return { id: s._id, name: s.name, accuracy: st ? Math.round((st.correct / st.total) * 100) : 0 };
  });
  return {
    name: c.name, studentCount: ids.length, students, weakTopics: weak,
    averageAccuracy: students.length ? Math.round(students.reduce((a: number, s: any) => a + s.accuracy, 0) / students.length) : 0,
    assignments: assignments.map(a => ({ ...a, completionRate: ids.length ? Math.round(((a.completedBy?.length ?? 0) / ids.length) * 100) : 0 })),
  };
}
