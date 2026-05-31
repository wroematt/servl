import 'express-async-errors';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { db } from '../lib/db';
import { redis } from '../lib/redis';
import { config } from '../config';
import { hashToken, issueAccessToken, issueRefreshToken } from '../lib/tokens';
import { userPhotoUpload } from '../lib/upload';

export const usersRouter = Router();

// ── Helpers ────────────────────────────────────

function getHeaders(req: Request) {
  return {
    userId:      req.headers['x-user-id']      as string,
    householdId: req.headers['x-household-id'] as string | undefined,
    role:        req.headers['x-user-role']    as string,
  };
}

async function lastOwnerGuard(householdId: string, res: Response): Promise<boolean> {
  const result = await db.query(
    "SELECT COUNT(*) FROM users WHERE household_id = $1 AND role = 'owner'",
    [householdId],
  );
  if (parseInt(result.rows[0].count, 10) <= 1) {
    res.status(409).json({ code: 'LAST_OWNER', message: 'Cannot modify the last owner' });
    return false;
  }
  return true;
}

// ── GET /users/me ──────────────────────────────

usersRouter.get('/me', async (req: Request, res: Response) => {
  const { userId } = getHeaders(req);
  const result = await db.query(
    'SELECT id, email, name, photo_url, role, fcm_token, household_id, created_at FROM users WHERE id = $1',
    [userId],
  );
  if (!result.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
  return res.json(result.rows[0]);
});

// ── PATCH /users/me ────────────────────────────

const patchMeSchema = z.object({
  name:             z.string().min(1).max(100).optional(),
  photo_url:        z.string().url().nullable().optional(),
  fcm_token:        z.string().nullable().optional(),
  current_password: z.string().optional(),
  new_password:     z.string().min(8).optional(),
}).refine(d => !(d.new_password && !d.current_password), {
  message: 'current_password required when setting new_password',
});

usersRouter.patch('/me', async (req: Request, res: Response) => {
  const { userId } = getHeaders(req);
  const body = patchMeSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const { name, photo_url, fcm_token, current_password, new_password } = body.data;

  if (new_password && current_password) {
    const pwResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const valid = await bcrypt.compare(current_password, pwResult.rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Current password is incorrect' });
    }
    const newHash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
  }

  const setClauses: string[] = [];
  const values: unknown[]    = [];
  let idx = 1;
  if (name      !== undefined) { setClauses.push(`name = $${idx++}`);      values.push(name); }
  if (photo_url !== undefined) { setClauses.push(`photo_url = $${idx++}`); values.push(photo_url); }
  if (fcm_token !== undefined) { setClauses.push(`fcm_token = $${idx++}`); values.push(fcm_token); }

  if (setClauses.length > 0) {
    values.push(userId);
    await db.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
  }

  const updated = await db.query(
    'SELECT id, email, name, photo_url, role, fcm_token, household_id FROM users WHERE id = $1',
    [userId],
  );
  return res.json(updated.rows[0]);
});

// ── POST /users/me/photo ───────────────────────

usersRouter.post(
  '/me/photo',
  userPhotoUpload.single('photo'),
  async (req: Request, res: Response) => {
    const { userId } = getHeaders(req);
    if (!req.file) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No photo file provided' });
    }
    const photoUrl = `/user-uploads/${req.file.filename}`;
    await db.query('UPDATE users SET photo_url = $1 WHERE id = $2', [photoUrl, userId]);
    return res.json({ photo_url: photoUrl });
  },
);

// ── GET /users/household ───────────────────────

usersRouter.get('/household', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  if (!householdId) {
    return res.status(400).json({ code: 'NO_HOUSEHOLD', message: 'User has no household' });
  }
  const result = await db.query(
    'SELECT id, email, name, photo_url, role, created_at FROM users WHERE household_id = $1 ORDER BY created_at',
    [householdId],
  );
  return res.json(result.rows);
});

// ── POST /users/household/invite ───────────────
// Generates an invite link for the current user's household (owner only).

usersRouter.post('/household/invite', async (req: Request, res: Response) => {
  const { householdId, role } = getHeaders(req);
  if (!householdId) {
    return res.status(400).json({ code: 'NO_HOUSEHOLD', message: 'User has no household' });
  }
  if (role !== 'owner') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Owner role required' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const hash  = hashToken(token);
  await redis.setex(`invite:${hash}`, config.INVITE_TOKEN_TTL, householdId);
  return res.json({ inviteUrl: `https://${config.DOMAIN}/join?token=${token}` });
});

// ── POST /users/household/join ─────────────────
// Authenticated: existing user joins a household via invite token.
// Returns fresh tokens with the updated household_id.

usersRouter.post('/household/join', async (req: Request, res: Response) => {
  const { userId } = getHeaders(req);

  const body = z.object({ token: z.string() }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }

  const hash        = hashToken(body.data.token);
  const householdId = await redis.get(`invite:${hash}`);
  if (!householdId) {
    return res.status(400).json({ code: 'INVALID_TOKEN', message: 'Invalid or expired invite link' });
  }

  await db.query(
    "UPDATE users SET household_id = $1, role = 'member' WHERE id = $2",
    [householdId, userId],
  );
  await redis.del(`invite:${hash}`);

  const accessToken  = issueAccessToken(userId, householdId, 'member');
  const refreshToken = await issueRefreshToken(userId);
  return res.json({ accessToken, refreshToken });
});

// ── GET /users/household/settings ─────────────
// Returns household-level settings (timezone) visible to all members.

usersRouter.get('/household/settings', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  if (!householdId) {
    return res.status(400).json({ code: 'NO_HOUSEHOLD', message: 'User has no household' });
  }
  const result = await db.query(
    'SELECT timezone FROM households WHERE id = $1',
    [householdId],
  );
  if (!result.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Household not found' });
  return res.json({ timezone: result.rows[0].timezone });
});

// ── PATCH /users/household/settings ───────────
// Updates household-level settings. Owner only.

const updateHouseholdSettingsSchema = z.object({
  timezone: z.string().max(64),
});

usersRouter.patch('/household/settings', async (req: Request, res: Response) => {
  const { householdId, role } = getHeaders(req);
  if (!householdId) {
    return res.status(400).json({ code: 'NO_HOUSEHOLD', message: 'User has no household' });
  }
  if (role !== 'owner') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Owner role required' });
  }
  const body = updateHouseholdSettingsSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  // Validate the string is a real IANA timezone before persisting.
  try {
    Intl.DateTimeFormat(undefined, { timeZone: body.data.timezone });
  } catch {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid timezone — use an IANA timezone string (e.g. Europe/London)' });
  }
  await db.query('UPDATE households SET timezone = $1 WHERE id = $2', [body.data.timezone, householdId]);
  return res.json({ timezone: body.data.timezone });
});

// ── PATCH /users/:userId/role ──────────────────

usersRouter.patch('/:userId/role', async (req: Request, res: Response) => {
  const { householdId, role } = getHeaders(req);
  if (!householdId) {
    return res.status(400).json({ code: 'NO_HOUSEHOLD', message: 'User has no household' });
  }
  if (role !== 'owner') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Owner role required' });
  }
  const roleSchema = z.object({ role: z.enum(['owner', 'member']) });
  const body = roleSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }
  const target = await db.query(
    'SELECT id, role FROM users WHERE id = $1 AND household_id = $2',
    [req.params.userId, householdId],
  );
  if (!target.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });

  if (target.rows[0].role === 'owner' && body.data.role === 'member') {
    if (!(await lastOwnerGuard(householdId, res))) return;
  }

  await db.query('UPDATE users SET role = $1 WHERE id = $2', [body.data.role, req.params.userId]);
  return res.json({ message: 'Role updated' });
});

// ── DELETE /users/:userId ──────────────────────

usersRouter.delete('/:userId', async (req: Request, res: Response) => {
  const { userId: requesterId, householdId, role } = getHeaders(req);
  if (!householdId) {
    return res.status(400).json({ code: 'NO_HOUSEHOLD', message: 'User has no household' });
  }
  if (role !== 'owner') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Owner role required' });
  }
  if (req.params.userId === requesterId) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Cannot remove yourself' });
  }
  const target = await db.query(
    'SELECT id, role FROM users WHERE id = $1 AND household_id = $2',
    [req.params.userId, householdId],
  );
  if (!target.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });

  if (target.rows[0].role === 'owner') {
    if (!(await lastOwnerGuard(householdId, res))) return;
  }

  await db.query('DELETE FROM users WHERE id = $1', [req.params.userId]);
  return res.status(204).send();
});
