import { Schema, model, Types } from 'mongoose';
export const MASTERY_STATES = ['NOT_STARTED', 'LEARNING', 'DEVELOPING', 'PROFICIENT', 'MASTERED'] as const;
const topicProgressSchema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true },
  topic: { type: Types.ObjectId, ref: 'Topic', required: true },
  attempts: { type: Number, default: 0 },
  correct: { type: Number, default: 0 },
  recent: [{ type: Boolean }],            // last 10 results, for recency weighting
  currentDifficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD'], default: 'EASY' },
  mastery: { type: Number, default: 0 },  // 0-100
  state: { type: String, enum: MASTERY_STATES, default: 'NOT_STARTED' },
  lastStep: { type: Number, default: 0 }, // resume where they stopped
  stepsDone: { type: Boolean, default: false }, // finished the step-by-step explanation (LESSON_COMPLETE XP once)
}, { timestamps: true });
topicProgressSchema.index({ student: 1, topic: 1 }, { unique: true });
export const TopicProgress = model('TopicProgress', topicProgressSchema);

const attemptSchema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  question: { type: Types.ObjectId, ref: 'Question', required: true },
  topic: { type: Types.ObjectId, ref: 'Topic', index: true },
  answer: String, isCorrect: Boolean, hintsUsed: { type: Number, default: 0 },
  errorType: { type: String, enum: ['CONCEPT', 'FORMULA', 'CALCULATION', null], default: null }, // why it was wrong
  mode: { type: String, enum: ['PRACTICE', 'QUIZ', 'CHALLENGE', 'SPEED', 'DAILY', 'REVISION'], default: 'PRACTICE' },
  timeTakenMs: Number,
}, { timestamps: true });
export const Attempt = model('Attempt', attemptSchema);
