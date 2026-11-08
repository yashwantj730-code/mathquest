import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../utils/apiResponse';
export const validate = (schema: ZodSchema, where: 'body' | 'query' | 'params' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req[where]);
    if (!r.success) return next(new AppError(400, 'VALIDATION_ERROR', r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')));
    (req as any)[where] = r.data;
    next();
  };
