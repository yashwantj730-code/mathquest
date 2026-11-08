import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { User } from '../models';

/**
 * Runs on every server start. When ADMIN_EMAIL and ADMIN_PASSWORD are set, makes sure that account
 * exists, is an admin, is active, and has that password. Touches only this one user; never wipes data.
 */
export async function ensureAdmin(): Promise<void> {
  if (!env.adminFromEnv) return;
  const email = env.adminEmail;
  const u: any = await User.findOne({ email }).select('+passwordHash');
  if (!u) {
    await User.create({ name: env.adminName, email, passwordHash: await bcrypt.hash(env.adminPassword, 12), role: 'SUPER_ADMIN', emailVerified: true });
    console.log(`Admin account created for ${email}`);
    return;
  }
  const changes: string[] = [];
  const same = u.passwordHash ? await bcrypt.compare(env.adminPassword, u.passwordHash) : false;
  if (!same) { u.passwordHash = await bcrypt.hash(env.adminPassword, 12); u.passwordChangedAt = new Date(); changes.push('password'); }
  if (u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN') { u.role = 'SUPER_ADMIN'; changes.push('role'); }
  if (u.isBlocked) { u.isBlocked = false; changes.push('unblocked'); }
  if (u.deletedAt) { u.deletedAt = null; changes.push('restored'); }
  if (changes.length) { await u.save(); console.log(`Admin account ${email} updated: ${changes.join(', ')}`); }
  else console.log(`Admin account ${email} is up to date`);
}
