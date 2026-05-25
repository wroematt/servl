import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { config } from '../config';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function issueAccessToken(
  userId: string,
  householdId: string | null,
  role: string,
): string {
  return jwt.sign(
    { sub: userId, household_id: householdId, role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN as any },
  );
}

function parseDurationMs(dur: string): number {
  const match = dur.match(/^(\d+)([smhd])$/);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return num * 1_000;
    case 'm': return num * 60_000;
    case 'h': return num * 3_600_000;
    case 'd': return num * 86_400_000;
    default:  return 30 * 24 * 60 * 60 * 1000;
  }
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + parseDurationMs(config.REFRESH_TOKEN_EXPIRES_IN));
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, expiresAt],
  );
  return token;
}
