import { Schema, model, Types } from 'mongoose';
export const QTYPES = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'NUMERIC', 'MATCHING', 'ORDERING', 'DRAG_DROP', 'EQUATION', 'WORD_PROBLEM', 'IMAGE', 'PUZZLE', 'TIMED', 'SUBJECTIVE'] as const;
const misconceptionSchema = new Schema({
  wrongAnswer: String,           // e.g. "6"
  explanation: String,           // "You may have confused the multiplication fact. 6 x 8 = 48"
}, { _id: false });
const questionSchema = new Schema({
  topic: { type: Types.ObjectId, ref: 'Topic', required: true, index: true },
  type: { type: String, enum: QTYPES, required: true },
  difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD'], default: 'EASY', index: true },
  text: { type: String, required: true },
  options: [String],
  correctAnswer: { type: String, required: true, select: false }, // never sent to client by default
  explanation: String,
  hints: [String],               // progressive hints, revealed one at a time
  solutionSteps: [String],
  misconceptions: [misconceptionSchema], // powers "Why am I wrong?"
  // SUBJECTIVE (written-answer) questions: graded by keyword match, model answer revealed after submit
  keywords: { type: [String], select: false },
  modelAnswer: { type: String, select: false },
  maxMarks: { type: Number, default: 1 },
  xpReward: { type: Number, default: 10 },
  timeLimitSec: Number,
  tags: [String],
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'PUBLISHED' },
  createdBy: { type: Types.ObjectId, ref: 'User' },
  updatedBy: { type: Types.ObjectId, ref: 'User' },
}, { timestamps: true });
export const Question = model('Question', questionSchema);
