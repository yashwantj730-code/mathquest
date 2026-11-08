import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/apiResponse';
import { User, type Role } from '../models/User';
export interface AuthUser { id: string; role: Role }
declare global { namespace Express { interface Request { user?: AuthUser } } }

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
  if (!token) return next(new AppError(401, 'UNAUTHORIZED', 'Please log in'));
  let p: AuthUser & { iat?: number };
  try { p = jwt.verify(token, env.jwtSecret) as AuthUser & { iat?: number }; }
  catch { return next(new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again')); }
  try {
    // Token is valid, but is the account still OK? (deleted, blocked, or password changed after this token)
    const u: any = await User.findById(p.id).select('role isBlocked deletedAt passwordChangedAt').lean();
    if (!u || u.deletedAt) return next(new AppError(401, 'UNAUTHORIZED', 'Account not found'));
    if (u.isBlocked) return next(new AppError(403, 'BLOCKED', 'This account is blocked. Contact the admin.'));
    if (u.passwordChangedAt && p.iat && p.iat * 1000 < new Date(u.passwordChangedAt).getTime() - 1000)
      return next(new AppError(401, 'UNAUTHORIZED', 'Password was changed, please log in again'));
    req.user = { id: p.id, role: u.role }; // role from DB, so a role change applies at once
    next();
  } catch (e) { next(e); }
}
// Backend role check on every protected route (never rely on frontend only)
export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new AppError(403, 'FORBIDDEN', 'You do not have access'));
  next();
};
