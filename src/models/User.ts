import { Schema, model, Types } from 'mongoose';
export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] as const;
export type Role = typeof ROLES[number];
const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: 'STUDENT', index: true },
  avatar: { type: String, default: 'aarya' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  // student fields
  classLevel: { type: Types.ObjectId, ref: 'ClassLevel' },
  xp: { type: Number, default: 0 },
  dailyGoal: { type: Number, default: 5 },
  leaderboardVisible: { type: Boolean, default: true },
  // profile + settings (Step 1)
  bio: { type: String, default: '', maxlength: 200 },
  settings: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    language: { type: String, enum: ['en', 'hi'], default: 'en' },
    soundOn: { type: Boolean, default: true },
    voiceExplain: { type: Boolean, default: true },
    quizTimer: { type: Boolean, default: true },
    notifications: {
      dailyReminder: { type: Boolean, default: true },
      reminderTime: { type: String, default: '18:00' }, // HH:mm in user's timezone
      badges: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
    },
  },
  passwordChangedAt: { type: Date, default: null }, // old tokens stop working after a password change
  // relations
  parent: { type: Types.ObjectId, ref: 'User' },
  children: [{ type: Types.ObjectId, ref: 'User' }],
  emailVerified: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false }, // admin can block login
  deletedAt: { type: Date, default: null },
}, { timestamps: true });
export const User = model('User', userSchema);
