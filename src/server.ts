import { app } from './app';
import { env } from './config/env';
import { connectDB } from './config/db';
import { seedDatabase } from './seed/seed';
import { ensureAdmin } from './seed/ensureAdmin';

// Open the port first (Render health checks), then connect to MongoDB with retries.
app.listen(env.port, () => console.log(`MathQuest on port ${env.port} (API at /api/v1)`));

async function startDB(attempt = 1): Promise<void> {
  try {
    await connectDB();
    if (env.autoSeed) await seedDatabase({ drop: false }); // only fills an empty database
    await ensureAdmin(); // applies ADMIN_EMAIL / ADMIN_PASSWORD from env (one user only)
  } catch (err: any) {
    console.error(`MongoDB connect/seed failed (attempt ${attempt}):`, err?.message || err);
    const wait = Math.min(30000, 2000 * attempt);
    setTimeout(() => { startDB(attempt + 1); }, wait);
  }
}
startDB();
