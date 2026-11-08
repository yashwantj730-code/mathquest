import { Schema, model, Types } from 'mongoose';
const levelSchema = new Schema({ level: { type: Number, unique: true }, title: String, minXp: Number });
export const Level = model('Level', levelSchema);

const badgeSchema = new Schema({
  code: { type: String, unique: true }, name: String, icon: String, description: String,
  rule: { type: { type: String, enum: ['FIRST_QUIZ', 'STREAK', 'TOPIC_MASTERED', 'PERFECT_QUIZ', 'SPEED_SCORE', 'LESSONS', 'PUZZLES'] }, value: Number, topicSlug: String },
});
export const Badge = model('Badge', badgeSchema);

const studentBadgeSchema = new Schema({ student: { type: Types.ObjectId, ref: 'User' }, badge: { type: Types.ObjectId, ref: 'Badge' } }, { timestamps: true });
studentBadgeSchema.index({ student: 1, badge: 1 }, { unique: true });
export const StudentBadge = model('StudentBadge', studentBadgeSchema);

const xpTxSchema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', index: true }, amount: Number,
  reason: { type: String, enum: ['CORRECT_ANSWER', 'LESSON_COMPLETE', 'QUIZ_COMPLETE', 'DAILY_CHALLENGE', 'PERFECT_QUIZ', 'ADMIN'] },
}, { timestamps: true });
xpTxSchema.index({ createdAt: -1 });
export const XpTransaction = model('XpTransaction', xpTxSchema);

const streakSchema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', unique: true },
  current: { type: Number, default: 0 }, longest: { type: Number, default: 0 }, lastDay: String,
});
export const Streak = model('Streak', streakSchema);

// Admin-configurable XP rules (key/value)
const settingSchema = new Schema({ key: { type: String, unique: true }, value: Schema.Types.Mixed });
export const SystemSetting = model('SystemSetting', settingSchema);
