import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../lib/db';
import { redis } from '../lib/redis';
import { sendPasswordReset } from '../lib/email';
import { config } from '../config';

export const authRouter = Router();

// ── Schemas ────────────────────────────────────

const registerSchema = z.object({
  householdName: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

// ── Helpers ────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueAccessToken(userId: string, householdId: string, role: string): string {
  return jwt.sign(
    { sub: userId, household_id: householdId, role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN as any },
  );
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + parseDurationMs(config.REFRESH_TOKEN_EXPIRES_IN));
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, expiresAt],
  );
  return token;
}

function parseDurationMs(dur: string): number {
  const match = dur.match(/^(\d+)([smhd])$/);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 3600 * 1000;
    case 'd': return num * 86400 * 1000;
    default:  return 30 * 24 * 60 * 60 * 1000;
  }
}

// ── POST /auth/register ────────────────────────

authRouter.post('/register', async (req: Request, res: Response) => {
  const body = registerSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const { householdName, name, email, password } = body.data;

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ code: 'CONFLICT', message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const client = await db.connect();
  let userId: string;
  let householdId: string;
  let role: string;
  try {
    await client.query('BEGIN');
    const hhResult = await client.query(
      'INSERT INTO households (name) VALUES ($1) RETURNING id',
      [householdName],
    );
    householdId = hhResult.rows[0].id;
    const userResult = await client.query(
      `INSERT INTO users (household_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'owner') RETURNING id, role`,
      [householdId, email, passwordHash, name],
    );
    await client.query('COMMIT');
    userId = userResult.rows[0].id;
    role = userResult.rows[0].role;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const accessToken = issueAccessToken(userId, householdId, role);
  const refreshToken = await issueRefreshToken(userId);
  return res.status(201).json({ accessToken, refreshToken });
});

// ── POST /auth/login ───────────────────────────

authRouter.post('/login', async (req: Request, res: Response) => {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }
  const { email, password } = body.data;

  const result = await db.query(
    'SELECT id, household_id, password_hash, role FROM users WHERE email = $1',
    [email],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
  }

  const accessToken = issueAccessToken(user.id, user.household_id, user.role);
  const refreshToken = await issueRefreshToken(user.id);
  return res.json({ accessToken, refreshToken });
});

// ── POST /auth/refresh ─────────────────────────

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const body = refreshSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }
  const hash = hashToken(body.data.refreshToken);
  const result = await db.query(
    `SELECT rt.id, rt.user_id, rt.expires_at, u.household_id, u.role
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [hash],
  );
  const row = result.rows[0];
  if (!row) {
    return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid refresh token' });
  }
  if (new Date(row.expires_at) < new Date()) {
    await db.query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
    return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Refresh token expired' });
  }
  const accessToken = issueAccessToken(row.user_id, row.household_id, row.role);
  return res.json({ accessToken });
});

// ── POST /auth/logout ──────────────────────────

authRouter.post('/logout', async (req: Request, res: Response) => {
  const body = refreshSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }
  const hash = hashToken(body.data.refreshToken);
  await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hash]);
  return res.status(204).send();
});

// ── POST /auth/forgot-password ─────────────────

authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const body = forgotSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }
  const result = await db.query('SELECT id, email FROM users WHERE email = $1', [body.data.email]);
  // Always 200 — prevents email enumeration
  if (result.rows.length > 0) {
    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const hash = hashToken(token);
    await redis.setex(`reset:${hash}`, config.RESET_TOKEN_TTL, user.id);
    const resetUrl = `https://${config.DOMAIN}/reset-password?token=${token}`;
    await sendPasswordReset(user.email, resetUrl);
  }
  return res.json({ message: 'If that email is registered, a reset link has been sent.' });
});

// ── POST /auth/reset-password ──────────────────

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const body = resetSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const hash = hashToken(body.data.token);
  const userId = await redis.get(`reset:${hash}`);
  if (!userId) {
    return res.status(400).json({ code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' });
  }
  const passwordHash = await bcrypt.hash(body.data.password, 12);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  await redis.del(`reset:${hash}`);
  return res.json({ message: 'Password reset successfully' });
});
