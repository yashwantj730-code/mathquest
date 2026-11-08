import { Response } from 'express';
export const ok = (res: Response, data: unknown = {}, message = 'Operation successful', status = 200) =>
  res.status(status).json({ success: true, data, message });
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
