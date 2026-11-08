import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler as h } from '../utils/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as S from '../validators/schemas';
import * as C from '../controllers';

const r = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// Auth
r.post('/auth/register', authLimiter, validate(S.registerSchema), h(C.AuthController.register));
r.post('/auth/login', authLimiter, validate(S.loginSchema), h(C.AuthController.login));
r.post('/auth/logout', h(C.AuthController.logout));
r.get('/auth/me', requireAuth, h(C.AuthController.me));

// Profile + Settings (Step 1) – any logged-in user, always their own account
const pwLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
r.get('/me', requireAuth, h(C.ProfileController.get));
r.patch('/me', requireAuth, validate(S.updateProfileSchema), h(C.ProfileController.update));
r.get('/me/settings', requireAuth, h(C.ProfileController.settings));
r.patch('/me/settings', requireAuth, validate(S.updateSettingsSchema), h(C.ProfileController.updateSettings));
r.patch('/me/password', requireAuth, pwLimiter, validate(S.changePasswordSchema), h(C.ProfileController.password));
r.delete('/me', requireAuth, pwLimiter, validate(S.deleteAccountSchema), h(C.ProfileController.remove));

// Curriculum (DB-driven)
r.get('/classes', h(C.CurriculumController.classes));
r.get('/classes/:classId/subjects', h(C.CurriculumController.subjects));
r.get('/subjects/:subjectId/chapters', h(C.CurriculumController.chapters));
r.get('/subjects/:subjectId/journey', requireAuth, h(C.CurriculumController.journey));
r.get('/chapters/:chapterId/topics', requireAuth, h(C.CurriculumController.topics));
r.get('/topics/:topicId', requireAuth, h(C.CurriculumController.topic));
r.get('/curriculum', requireAuth, h(C.CurriculumController.curriculum));
r.post('/topics/:topicId/complete', requireAuth, requireRole('STUDENT'), h(C.CurriculumController.completeSteps));
r.get('/topics/:topicId/quiz', requireAuth, h(C.CurriculumController.topicQuiz));
r.put('/topics/:topicId/step', requireAuth, h(C.CurriculumController.saveStep));
r.get('/search', h(C.CurriculumController.search));

// Practice, hints, "Why am I wrong?"
r.get('/practice/:topicId/next', requireAuth, h(C.PracticeController.next));
r.post('/practice/answer', requireAuth, validate(S.answerSchema), h(C.PracticeController.answer));
r.get('/questions/:questionId/hint', requireAuth, h(C.PracticeController.hint));
r.get('/practice/revision', requireAuth, h(C.PracticeController.revision));

// Quizzes
r.get('/quizzes/:quizId', requireAuth, h(C.QuizController.get));
r.post('/quizzes/:quizId/submit', requireAuth, requireRole('STUDENT'), validate(S.quizSubmitSchema), h(C.QuizController.submit));

// Gamification
r.get('/gamification/levels', h(C.GamificationController.levels));
r.get('/gamification/badges', requireAuth, h(C.GamificationController.badges));
r.get('/leaderboard/weekly', requireAuth, h(C.GamificationController.leaderboard));
r.post('/gamification/daily-challenge/complete', requireAuth, requireRole('STUDENT'), h(C.GamificationController.dailyChallenge));

// Dashboards
r.get('/dashboard/student', requireAuth, requireRole('STUDENT'), h(C.DashboardController.home));
r.get('/dashboard/parent/:childId', requireAuth, requireRole('PARENT'), h(C.DashboardController.parent));
r.get('/dashboard/teacher/:classroomId', requireAuth, requireRole('TEACHER'), h(C.DashboardController.teacher));

// Teacher
r.get('/teacher/classes', requireAuth, requireRole('TEACHER'), h(C.TeacherController.myClasses));
r.post('/teacher/classes/:classroomId/assignments', requireAuth, requireRole('TEACHER'), validate(S.assignmentSchema), h(C.TeacherController.assign));

// Admin CMS
r.get('/admin/questions', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), h(C.AdminController.listQuestions));
r.post('/admin/questions', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), validate(S.questionSchema), h(C.AdminController.createQuestion));
r.patch('/admin/questions/:id', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), h(C.AdminController.updateQuestion));

// Admin panel (ADMIN / SUPER_ADMIN only, enforced on the server)
const A = requireRole('ADMIN', 'SUPER_ADMIN');
r.get('/admin/stats', requireAuth, A, h(C.AdminPanelController.stats));
r.get('/admin/users', requireAuth, A, h(C.AdminPanelController.users));
r.post('/admin/users', requireAuth, A, h(C.AdminPanelController.createUser));
r.patch('/admin/users/:id', requireAuth, A, h(C.AdminPanelController.updateUser));
r.delete('/admin/users/:id', requireAuth, A, h(C.AdminPanelController.deleteUser));
r.get('/admin/classes', requireAuth, A, h(C.AdminPanelController.classes));
r.patch('/admin/classes/:id', requireAuth, A, h(C.AdminPanelController.setClass));
r.get('/admin/settings/:key', requireAuth, A, h(C.AdminPanelController.getSetting));
r.put('/admin/settings/:key', requireAuth, A, h(C.AdminPanelController.putSetting));
r.delete('/admin/questions/:id', requireAuth, A, h(C.AdminPanelController.deleteQuestion));
r.put('/admin/questions/:id', requireAuth, A, h(C.AdminPanelController.editQuestion));
r.get('/admin/curriculum', requireAuth, A, h(C.AdminPanelController.curriculum));
r.post('/admin/chapters', requireAuth, A, h(C.AdminPanelController.createChapter));
r.delete('/admin/chapters/:id', requireAuth, A, h(C.AdminPanelController.deleteChapter));
r.post('/admin/topics', requireAuth, A, h(C.AdminPanelController.createTopic));
r.delete('/admin/topics/:id', requireAuth, A, h(C.AdminPanelController.deleteTopic));
r.get('/admin/topics/:id/questions', requireAuth, A, h(C.AdminPanelController.topicQuestions));
r.post('/admin/topics/:id/questions', requireAuth, A, h(C.AdminPanelController.addQuestion));

// Doubts (OCR + AI teacher) and analysis
const doubtLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
r.post('/doubts/ocr', requireAuth, doubtLimiter, h(C.DoubtController.ocr));
r.post('/doubts/explain', requireAuth, doubtLimiter, h(C.DoubtController.explain));
r.get('/analysis/me', requireAuth, requireRole('STUDENT'), h(C.AnalysisController.me));
r.get('/analysis/students/:studentId', requireAuth, requireRole('TEACHER', 'PARENT', 'ADMIN', 'SUPER_ADMIN'), h(C.AnalysisController.student));

// Notifications
r.get('/notifications', requireAuth, h(C.NotificationController.list));
r.patch('/notifications/:id/read', requireAuth, h(C.NotificationController.read));

export default r;
