import { z } from 'zod';
export const registerSchema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(['STUDENT', 'PARENT', 'TEACHER']).default('STUDENT'),
  classLevelId: z.string().optional(),
});
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const answerSchema = z.object({
  questionId: z.string().length(24),
  answer: z.string().max(3000),
  hintsUsed: z.number().int().min(0).max(5).default(0),
  mode: z.enum(['PRACTICE', 'QUIZ', 'CHALLENGE', 'SPEED', 'DAILY', 'REVISION']).default('PRACTICE'),
  timeTakenMs: z.number().int().min(0).optional(),
});
export const quizSubmitSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().length(24), answer: z.string().max(3000) })).min(1).max(50),
});
export const questionSchema = z.object({
  topic: z.string().length(24),
  type: z.enum(['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'NUMERIC', 'MATCHING', 'ORDERING', 'DRAG_DROP', 'EQUATION', 'WORD_PROBLEM', 'IMAGE', 'PUZZLE', 'TIMED', 'SUBJECTIVE']),
  keywords: z.array(z.string()).optional(), modelAnswer: z.string().optional(), maxMarks: z.number().min(0).default(1),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('EASY'),
  text: z.string().min(1), options: z.array(z.string()).optional(), correctAnswer: z.string().min(1),
  explanation: z.string().optional(), hints: z.array(z.string()).optional(), solutionSteps: z.array(z.string()).optional(),
  misconceptions: z.array(z.object({ wrongAnswer: z.string(), explanation: z.string() })).optional(),
  xpReward: z.number().int().min(0).default(10), tags: z.array(z.string()).optional(),
});
export const assignmentSchema = z.object({
  kind: z.enum(['LESSON', 'PRACTICE_SET', 'QUIZ', 'HOMEWORK', 'CHALLENGE']),
  title: z.string().min(2), topic: z.string().length(24).optional(), dueDate: z.coerce.date().optional(),
});

/* ---------- Step 1: Profile + Settings ---------- */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  avatar: z.enum(['aarya', 'owl', 'robot', 'star', 'rocket', 'cat']).optional(),
  bio: z.string().trim().max(200).optional(),
  classNo: z.number().int().min(1).max(12).optional(),
  timezone: z.string().min(3).max(50).optional(),
  dailyGoal: z.number().int().min(1).max(50).optional(),
}).strict();
export const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.enum(['en', 'hi']).optional(),
  soundOn: z.boolean().optional(),
  voiceExplain: z.boolean().optional(),
  quizTimer: z.boolean().optional(),
  leaderboardVisible: z.boolean().optional(),
  notifications: z.object({
    dailyReminder: z.boolean().optional(),
    reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, e.g. 18:30').optional(),
    badges: z.boolean().optional(),
    email: z.boolean().optional(),
  }).strict().optional(),
}).strict();
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100).regex(/[A-Za-z]/, 'Must have a letter').regex(/\d/, 'Must have a number'),
});
export const deleteAccountSchema = z.object({ password: z.string().min(1) });
