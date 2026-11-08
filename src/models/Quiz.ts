import { Schema, model, Types } from 'mongoose';
const quizSchema = new Schema({
  title: String, topic: { type: Types.ObjectId, ref: 'Topic' },
  questions: [{ type: Types.ObjectId, ref: 'Question' }],
  createdBy: { type: Types.ObjectId, ref: 'User' },
}, { timestamps: true });
export const Quiz = model('Quiz', quizSchema);
const quizAttemptSchema = new Schema({
  quiz: { type: Types.ObjectId, ref: 'Quiz' }, student: { type: Types.ObjectId, ref: 'User', index: true },
  answers: [{ question: { type: Types.ObjectId, ref: 'Question' }, answer: String, isCorrect: Boolean, marks: Number, maxMarks: Number }],
  score: Number, total: Number, percent: Number, xpEarned: Number,
}, { timestamps: true });
export const QuizAttempt = model('QuizAttempt', quizAttemptSchema);
