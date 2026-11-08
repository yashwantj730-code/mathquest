import bcrypt from 'bcryptjs';
import { User, ClassLevel, StudentBadge, TopicProgress } from '../models';
import { AppError } from '../utils/apiResponse';
import { levelFor } from './gamification.service';

// Only these avatars exist in the app (mascot / student art)
export const AVATARS = ['aarya', 'owl', 'robot', 'star', 'rocket', 'cat'] as const;

// What we send back: never passwordHash, never internal flags
function shape(u: any, extra: Record<string, unknown> = {}) {
  return {
    id: u._id, name: u.name, email: u.email, role: u.role, avatar: u.avatar, bio: u.bio ?? '',
    timezone: u.timezone, classLevel: u.classLevel ? { id: u.classLevel._id ?? u.classLevel, name: u.classLevel.name, order: u.classLevel.order } : null,
    xp: u.xp, dailyGoal: u.dailyGoal, leaderboardVisible: u.leaderboardVisible,
    memberSince: u.createdAt, ...extra,
  };
}

/** GET /me  → profile card: basic info + level + small stats */
export async function getProfile(userId: string) {
  const u: any = await User.findOne({ _id: userId, deletedAt: null }).populate('classLevel', 'name order').lean();
  if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
  const [level, badges, mastered] = await Promise.all([
    levelFor(u.xp ?? 0),
    StudentBadge.countDocuments({ student: u._id }),
    TopicProgress.countDocuments({ student: u._id, mastery: { $gte: 80 } }),
  ]);
  return shape(u, { level, stats: { badges, topicsMastered: mastered } });
}

/** PATCH /me  → change name, avatar, bio, class, timezone, daily goal */
export async function updateProfile(userId: string, d: { name?: string; avatar?: string; bio?: string; classNo?: number; timezone?: string; dailyGoal?: number }) {
  const u: any = await User.findOne({ _id: userId, deletedAt: null });
  if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (d.name !== undefined) u.name = d.name;
  if (d.avatar !== undefined) u.avatar = d.avatar;
  if (d.bio !== undefined) u.bio = d.bio;
  if (d.timezone !== undefined) u.timezone = d.timezone;
  if (d.dailyGoal !== undefined) u.dailyGoal = d.dailyGoal;
  if (d.classNo !== undefined) {
    if (u.role !== 'STUDENT') throw new AppError(400, 'VALIDATION', 'Only students choose a class');
    const cls = await ClassLevel.findOne({ order: d.classNo, isActive: true });
    if (!cls) throw new AppError(400, 'CLASS_NOT_AVAILABLE', `Class ${d.classNo} is not available yet`);
    u.classLevel = cls._id;
  }
  await u.save();
  return getProfile(userId);
}

/** GET /me/settings */
export async function getSettings(userId: string) {
  const u: any = await User.findById(userId).select('settings leaderboardVisible').lean();
  if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
  return { ...(u.settings ?? {}), leaderboardVisible: u.leaderboardVisible };
}

/** PATCH /me/settings  → only the keys sent are changed (partial update) */
export async function updateSettings(userId: string, d: any) {
  const set: Record<string, unknown> = {};
  for (const k of ['theme', 'language', 'soundOn', 'voiceExplain', 'quizTimer'] as const) if (d[k] !== undefined) set[`settings.${k}`] = d[k];
  if (d.notifications) for (const [k, v] of Object.entries(d.notifications)) if (v !== undefined) set[`settings.notifications.${k}`] = v;
  if (d.leaderboardVisible !== undefined) set.leaderboardVisible = d.leaderboardVisible;
  if (!Object.keys(set).length) throw new AppError(400, 'VALIDATION', 'Nothing to update');
  await User.updateOne({ _id: userId }, { $set: set }, { runValidators: true });
  return getSettings(userId);
}

/** PATCH /me/password  → needs current password; logs out old sessions */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const u: any = await User.findById(userId).select('+passwordHash');
  if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (!(await bcrypt.compare(currentPassword, u.passwordHash))) throw new AppError(400, 'WRONG_PASSWORD', 'Current password is wrong');
  if (await bcrypt.compare(newPassword, u.passwordHash)) throw new AppError(400, 'SAME_PASSWORD', 'New password must be different');
  u.passwordHash = await bcrypt.hash(newPassword, 12);
  u.passwordChangedAt = new Date();
  await u.save();
  return { changed: true };
}

/** DELETE /me  → soft delete (data kept for reports, login stops) */
export async function deleteAccount(userId: string, password: string) {
  const u: any = await User.findById(userId).select('+passwordHash');
  if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (u.role === 'SUPER_ADMIN') throw new AppError(400, 'NOT_ALLOWED', 'Super admin account cannot be deleted');
  if (!(await bcrypt.compare(password, u.passwordHash))) throw new AppError(400, 'WRONG_PASSWORD', 'Password is wrong');
  u.deletedAt = new Date(); u.email = `deleted+${u._id}@mathquest.local`; // frees the email for re-signup
  await u.save();
  return { deleted: true };
}
