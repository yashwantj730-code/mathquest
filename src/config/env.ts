import dotenv from 'dotenv';
dotenv.config();
const required = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (!v) throw new Error(`Missing env var ${k}`);
  return v;
};
export const env = {
  port: Number(process.env.PORT || 5000),
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/mathquest'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrls: [process.env.CLIENT_URL || 'http://localhost:3000', process.env.RENDER_EXTERNAL_URL || ''].join(',').split(',').map(s => s.trim()).filter(Boolean),
  // The Hark Page preview runs in a sandboxed iframe whose Origin is "null"; allow it only in development.
  // Admin account. When ADMIN_EMAIL and ADMIN_PASSWORD are both set, the server makes sure that admin
  // exists with this password on every start (see seed/ensureAdmin.ts). There is no default password.
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@mathquest.dev').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminFromEnv: !!(process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL.trim() && process.env.ADMIN_PASSWORD),
  adminName: process.env.ADMIN_NAME || 'MathQuest Admin',
  autoSeed: (process.env.AUTO_SEED ?? 'true') === 'true',
  allowNullOrigin: (process.env.ALLOW_NULL_ORIGIN ?? 'true') === 'true',
};
