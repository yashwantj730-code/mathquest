import path from 'path';
import express from 'express';
import mongoose from 'mongoose';
import { Chapter } from './models';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import routes from './routes';
import { notFound, errorHandler } from './middleware/error';

export const app = express();
app.set('trust proxy', 1); // Render runs behind a proxy (needed for rate limits)
// CSP is off because the single-page frontend uses inline scripts and Google Fonts.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                               // curl / server-to-server
    if (env.clientUrls.includes(origin)) return cb(null, true);
    if (origin === 'null' && env.allowNullOrigin) return cb(null, true); // sandboxed Page preview (uses Bearer token)
    if (/^https:\/\/([a-z0-9-]+\.)*hark\.site$/.test(origin)) return cb(null, true);
    cb(null, false);
  },
}));
// Chrome Private Network Access: let a public https page call this API on localhost
app.use((req, res, next) => { if (req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true'); next(); });
app.use('/api/v1/doubts/ocr', express.json({ limit: '8mb' })); // photo upload (base64)
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300 }));
const health = async (_req: express.Request, res: express.Response) => {
  const connected = mongoose.connection.readyState === 1;
  let chapters: number | null = null;
  if (connected) { try { chapters = await Chapter.countDocuments(); } catch { chapters = null; } }
  res.json({ success: true, data: { status: 'ok', db: connected ? 'connected' : 'disconnected', chapters } });
};
app.get('/health', health);
app.get('/api/v1/health', health);
app.use('/api/v1', routes);
// Frontend (single page) served from the same origin, so no CORS setup is needed in production.
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
app.use(notFound);
app.use(errorHandler);
