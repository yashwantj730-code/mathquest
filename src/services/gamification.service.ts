import { User, Level, XpTransaction, Streak, Badge, StudentBadge, SystemSetting } from '../models';
import { dayKey, daysBetween } from '../utils/dates';

const DEFAULT_XP = { CORRECT_ANSWER: 10, LESSON_COMPLETE: 25, QUIZ_COMPLETE: 50, DAILY_CHALLENGE: 30, PERFECT_QUIZ: 100 };
export async function xpRule(reason: keyof typeof DEFAULT_XP) {
  const s: any = await SystemSetting.findOne({ key: 'xpRules' }).lean(); // admin-configurable
  return s?.value?.[reason] ?? DEFAULT_XP[reason];
}
export async function awardXp(studentId: string, reason: keyof typeof DEFAULT_XP, amount?: number) {
  const xp = amount ?? (await xpRule(reason));
  await XpTransaction.create({ student: studentId, amount: xp, reason });
  const u = await User.findByIdAndUpdate(studentId, { $inc: { xp } }, { new: true });
  return { gained: xp, totalXp: u?.xp ?? 0 };
}
export async function levelFor(xp: number) {
  const levels = await Level.find().sort({ minXp: 1 }).lean();
  let current: any = levels[0], next: any = null;
  for (let i = 0; i < levels.length; i++) if (xp >= levels[i].minXp!) { current = levels[i]; next = levels[i + 1] ?? null; }
  return { level: current?.level, title: current?.title, xp, nextLevel: next ? { level: next.level, title: next.title, minXp: next.minXp } : null };
}
// Timezone-correct daily streak
export async function touchStreak(studentId: string, tz = 'Asia/Kolkata') {
  const today = dayKey(new Date(), tz);
  const s: any = (await Streak.findOne({ student: studentId })) ?? new Streak({ student: studentId });
  if (s.lastDay === today) return s;
  s.current = s.lastDay && daysBetween(s.lastDay, today) === 1 ? s.current + 1 : 1;
  s.longest = Math.max(s.longest, s.current);
  s.lastDay = today;
  await s.save();
  await checkBadges(studentId, { streak: s.current });
  return s;
}
export async function checkBadges(studentId: string, ctx: { streak?: number; perfectQuiz?: boolean; firstQuiz?: boolean; masteredTopicSlug?: string }) {
  const badges = await Badge.find().lean();
  const earned: string[] = [];
  for (const b of badges as any[]) {
    const r = b.rule || {};
    const hit = (r.type === 'STREAK' && (ctx.streak ?? 0) >= r.value) || (r.type === 'PERFECT_QUIZ' && ctx.perfectQuiz)
      || (r.type === 'FIRST_QUIZ' && ctx.firstQuiz) || (r.type === 'TOPIC_MASTERED' && ctx.masteredTopicSlug === r.topicSlug);
    if (!hit) continue;
    const res = await StudentBadge.updateOne({ student: studentId, badge: b._id }, { $setOnInsert: { student: studentId, badge: b._id } }, { upsert: true });
    if (res.upsertedCount) earned.push(b.name);
  }
  return earned;
}
