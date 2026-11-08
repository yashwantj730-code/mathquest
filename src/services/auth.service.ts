import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User } from '../models';
import { AppError } from '../utils/apiResponse';
const sign = (u: any) => jwt.sign({ id: String(u._id), role: u.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
const publicUser = (u: any) => ({ id: u._id, name: u.name, email: u.email, role: u.role, avatar: u.avatar, xp: u.xp });

export async function register(input: { name: string; email: string; password: string; role: string; classLevelId?: string }) {
  if (await User.exists({ email: input.email })) throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
  const passwordHash = await bcrypt.hash(input.password, 12);
  const u = await User.create({ name: input.name, email: input.email, passwordHash, role: input.role, classLevel: input.classLevelId });
  return { token: sign(u), user: publicUser(u) };
}
export async function login(email: string, password: string) {
  email = String(email).toLowerCase().trim();
  const u: any = await User.findOne({ email, deletedAt: null }).select('+passwordHash');
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  if (u.isBlocked) throw new AppError(403, 'BLOCKED', 'This account is blocked. Contact the admin.');
  return { token: sign(u), user: publicUser(u) };
}
