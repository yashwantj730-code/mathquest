import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/apiResponse';
export function notFound(_req: Request, _res: Response, next: NextFunction) { next(new AppError(404, 'NOT_FOUND', 'Route not found')); }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
  if (err?.code === 11000) return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Already exists' } });
  if (err?.name === 'CastError') return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid id' } });
  console.error(err); // log details server-side only
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
}
