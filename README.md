# MathQuest 🦉 – Learn. Play. Solve. Master.

A gamified maths-learning web app for **CBSE Class 9 & 10** (NCERT rationalised syllabus): step-by-step lessons, topic quizzes, XP, levels, badges, streaks, a weekly leaderboard, and dashboards for students, parents, teachers and admins.

**Live demo:** https://mathquest-ry5z.onrender.com

> Hosted on Render's free plan: the first visit after a quiet spell can take ~30–60 s while the server wakes up.

## Demo logins
The demo accounts use the password **`Password@123`**.

| Role | Email |
|---|---|
| Student | aarya@mathquest.dev (also kabir@, meera@, rohan@, zoya@) |
| Parent | parent@mathquest.dev |
| Teacher | teacher@mathquest.dev |

The admin account is private: its password is set with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables and applied each time the server starts.

If the server can't be reached, the app falls back to **demo mode** (everything runs in the browser, nothing is saved).

## Features
- 26 chapters, 89 topics and 445 questions (Class 9 & 10 Maths), all stored in MongoDB
- Each topic: step-by-step lesson + 5-question quiz (3 MCQ + 2 subjective, keyword-graded)
- Learning journey: chapters unlock as mastery grows; adaptive difficulty and mastery score per topic
- XP, levels, badges, timezone-safe streaks, weekly leaderboard
- Progressive hints and "Why am I wrong?" explanations
- "Ask a Doubt": typed or photo question (server-side OCR with tesseract.js) with a voice explanation
- Student, parent, teacher and admin dashboards; admin panel for users and content
- Security: bcrypt, JWT, helmet, rate limits, role checks on every protected route

## Tech stack
- **Frontend:** single-page HTML/CSS/JS (in `public/`), Chart.js
- **Backend:** Node.js, Express, TypeScript, Mongoose
- **Database:** MongoDB Atlas
- **Hosting:** Render (one web service serves both the frontend at `/` and the API at `/api/v1`)

## Run locally
1. Node.js 18+ and MongoDB (local or a free Atlas cluster).
2. `cp .env.example .env` and set `MONGODB_URI`, `JWT_SECRET` and your own `ADMIN_PASSWORD`.
3. `npm install`
4. `npm run dev` → http://localhost:5000 (the app) and http://localhost:5000/api/v1 (the API)

On start the server seeds the curriculum, levels, badges and demo users **only if the database is empty** (`AUTO_SEED=true`); it never wipes data. To rebuild everything from scratch: `npm run build && npm run seed -- --fresh`.

Health check: `GET /api/v1/health` → `{ status, db, chapters }`.

## Deploy on Render
- New **Web Service** from this repo, branch `main`, runtime Node
- Build command: `npm install && npm run build` · Start command: `npm start`
- Environment: `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `CLIENT_URL` (see `.env.example`)
- In MongoDB Atlas, allow network access from Render (0.0.0.0/0 on the free plan)

## Structure
```
src/
  app.ts        Express app: API at /api/v1 + serves public/ (frontend)
  config/       env + MongoDB connection
  models/       Mongoose schemas (User, ClassLevel, Subject, Chapter, Topic, Question, TopicProgress,
                Attempt, Quiz, QuizAttempt, Level, Badge, StudentBadge, Streak, XpTransaction,
                Classroom, Assignment, Notification, SystemSetting)
  services/     business logic (auth, learning/adaptive engine, gamification, dashboards)
  controllers/  request handlers
  routes/       versioned REST routes (/api/v1)
  middleware/   JWT auth, role checks, Zod validation, error handler
  validators/   Zod schemas
  seed/         seed.ts + data/cbse_9_10.json (same content as the UI)
public/         the MathQuest frontend (index.html, mq-auth.js, images)
```

## Key features
- Fully DB-driven curriculum: Class -> Subject -> Chapter -> Topic -> lesson steps (Class 6-12 added as "coming soon")
- Question engine (12 types); correct answers are never sent to the client
- Progressive hints: hint 1 -> 2 -> 3 -> step-by-step -> answer
- "Why am I wrong?": misconception-based explanation on wrong answers (e.g. 48 ÷ 6 = 6)
- Adaptive difficulty (3 right in a row -> harder, 2 wrong -> easier) and mastery score + state per topic
- XP (admin-configurable rules), levels, badges, timezone-safe streaks, weekly leaderboard with privacy toggle
- `GET /dashboard/student` returns data in the same order as the Home screen:
  greeting -> todaysPlan -> dailyChallenge -> progress -> recommended -> achievements -> leaderboard
- Parent and teacher dashboards, assignments + notifications
- Security: bcrypt, JWT (httpOnly cookie or Bearer), helmet, CORS, rate limits, 100kb body limit, backend role checks on every protected route

## API
All responses: `{ success: true, data, message }` or `{ success: false, error: { code, message } }`

| Area | Endpoints |
|---|---|
| Auth | POST /auth/register, POST /auth/login, POST /auth/logout, GET /auth/me |
| Curriculum | GET /classes, /classes/:classId/subjects, /subjects/:subjectId/chapters, /subjects/:subjectId/journey, /chapters/:chapterId/topics, /topics/:topicId, PUT /topics/:topicId/step, GET /search?q=fractions |
| Practice | GET /practice/:topicId/next, POST /practice/answer, GET /questions/:id/hint?index=0, GET /practice/revision |
| Quiz | GET /quizzes/:quizId, POST /quizzes/:quizId/submit |
| Gamification | GET /gamification/levels, /gamification/badges, /leaderboard/weekly, POST /gamification/daily-challenge/complete |
| Dashboards | GET /dashboard/student, /dashboard/parent/:childId, /dashboard/teacher/:classroomId |
| Teacher | GET /teacher/classes, POST /teacher/classes/:classroomId/assignments |
| Admin | GET/POST /admin/questions, PATCH /admin/questions/:id |
| Notifications | GET /notifications, PATCH /notifications/:id/read |


## CBSE Class 9-10 content (v2)
- Every topic has step-by-step lesson steps (`kind: concept`, `title`, `content`, `example`) and a linked 5-question quiz.
- Quiz = 3 MCQ (1 mark each) + 2 SUBJECTIVE (2 marks each). Subjective answers are graded by keyword match; the response returns `subjective: { marks, maxMarks, found, missing, modelAnswer }`.
- `GET /api/v1/topics/:topicId/quiz` returns the topic quiz (answers hidden).
- `POST /api/v1/quizzes/:quizId/submit` with `{ answers: [{ questionId, answer }] }` returns `score`, `total` (7), `percent`, XP and badges; the topic's mastery is set to the best quiz percent.
- Journey: a chapter unlocks when the previous chapter reaches 50% average mastery.
- Voice explanation runs in the browser (Web Speech API), so no backend is needed for it.


## Author
Built by **Yashwant Jaiswal** (BCA, Integral University, Lucknow) · GitHub [@yashwantj730-code](https://github.com/yashwantj730-code)
