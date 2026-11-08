import { Schema, model, Types } from 'mongoose';
// Class -> Subject -> Chapter -> Topic -> Concept/Lesson (fully DB-driven, nothing hard-coded in frontend)
const classSchema = new Schema({
  name: { type: String, required: true },           // "Class 9"
  order: { type: Number, required: true, unique: true },
  isActive: { type: Boolean, default: true },        // Class 6-12 can be added inactive ("coming soon")
}, { timestamps: true });
export const ClassLevel = model('ClassLevel', classSchema);

const subjectSchema = new Schema({
  classLevel: { type: Types.ObjectId, ref: 'ClassLevel', required: true, index: true },
  name: { type: String, required: true }, icon: String, color: String, order: Number,
}, { timestamps: true });
export const Subject = model('Subject', subjectSchema);

const chapterSchema = new Schema({
  subject: { type: Types.ObjectId, ref: 'Subject', required: true, index: true },
  name: { type: String, required: true }, slug: { type: String, index: true },
  chapterNo: Number, icon: String, color: String, order: Number,
  unlockAfter: { type: Types.ObjectId, ref: 'Chapter', default: null }, // learning-journey lock
}, { timestamps: true });
export const Chapter = model('Chapter', chapterSchema);

const lessonStep = new Schema({
  kind: { type: String, enum: ['concept', 'intro', 'visual', 'example', 'stepByStep', 'guided', 'independent', 'miniQuiz', 'challenge', 'mastery'] },
  title: String, content: String, example: String, animation: String, // e.g. "pizza-fraction:2/4"
}, { _id: false });
const topicSchema = new Schema({
  chapter: { type: Types.ObjectId, ref: 'Chapter', required: true, index: true },
  name: { type: String, required: true }, slug: { type: String, index: true },
  icon: String, summary: String, order: Number, steps: [lessonStep],
  quiz: { type: Types.ObjectId, ref: 'Quiz' }, // 5-question topic quiz (3 objective + 2 subjective)
}, { timestamps: true });
topicSchema.index({ name: 'text' });
export const Topic = model('Topic', topicSchema);
