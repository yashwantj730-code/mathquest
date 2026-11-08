import { Schema, model, Types } from 'mongoose';
const classroomSchema = new Schema({
  name: String, teacher: { type: Types.ObjectId, ref: 'User', index: true },
  classLevel: { type: Types.ObjectId, ref: 'ClassLevel' },
  students: [{ type: Types.ObjectId, ref: 'User' }],
}, { timestamps: true });
export const Classroom = model('Classroom', classroomSchema);
const assignmentSchema = new Schema({
  classroom: { type: Types.ObjectId, ref: 'Classroom', index: true },
  kind: { type: String, enum: ['LESSON', 'PRACTICE_SET', 'QUIZ', 'HOMEWORK', 'CHALLENGE'] },
  title: String, topic: { type: Types.ObjectId, ref: 'Topic' }, quiz: { type: Types.ObjectId, ref: 'Quiz' },
  dueDate: Date, completedBy: [{ type: Types.ObjectId, ref: 'User' }],
}, { timestamps: true });
export const Assignment = model('Assignment', assignmentSchema);
const notificationSchema = new Schema({
  user: { type: Types.ObjectId, ref: 'User', index: true }, title: String, body: String, read: { type: Boolean, default: false },
}, { timestamps: true });
export const Notification = model('Notification', notificationSchema);
