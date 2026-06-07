import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { sendToToken } from '../lib/fcm';

export const internalRouter = Router();

// ── POST /internal/notify/hopper-low ──────────

internalRouter.post('/notify/hopper-low', async (req: Request, res: Response) => {
  const body = z.object({
    household_id: z.string().uuid(),
    device_name: z.string(),
    hopper_pct: z.number(),
  }).safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }

  const { household_id, device_name, hopper_pct } = body.data;
  const owners = await db.query(
    "SELECT fcm_token FROM users WHERE household_id = $1 AND role = 'owner' AND fcm_token IS NOT NULL",
    [household_id],
  );

  await Promise.all(
    owners.rows.map((u) =>
      sendToToken(
        u.fcm_token,
        'Hopper running low',
        `${device_name} is at ${hopper_pct}% — time to refill.`,
        'hopper_alerts',
      ),
    ),
  );
  return res.json({ sent: owners.rows.length });
});

// ── POST /internal/notify/feed-failed ─────────
// Fired by the schedule worker when a feed job permanently fails after all retries.

internalRouter.post('/notify/feed-failed', async (req: Request, res: Response) => {
  const body = z.object({
    household_id: z.string().uuid(),
    pet_name:     z.string(),
  }).safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }

  const { household_id, pet_name } = body.data;
  const owners = await db.query(
    "SELECT fcm_token FROM users WHERE household_id = $1 AND role = 'owner' AND fcm_token IS NOT NULL",
    [household_id],
  );

  await Promise.all(
    owners.rows.map((u) =>
      sendToToken(
        u.fcm_token,
        'Scheduled feed failed',
        `${pet_name}'s scheduled meal could not be delivered. Check that the feeder is online.`,
        'feed_failed',
      ),
    ),
  );
  return res.json({ sent: owners.rows.length });
});

// ── POST /internal/notify/overfeed ────────────
// Fired when a pet's confirmed daily intake first exceeds their daily target.

internalRouter.post('/notify/overfeed', async (req: Request, res: Response) => {
  const body = z.object({
    household_id:   z.string().uuid(),
    pet_name:       z.string(),
    total_today_g:  z.number(),
    daily_target_g: z.number(),
  }).safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }

  const { household_id, pet_name, total_today_g, daily_target_g } = body.data;
  const users = await db.query(
    'SELECT fcm_token FROM users WHERE household_id = $1 AND fcm_token IS NOT NULL',
    [household_id],
  );

  await Promise.all(
    users.rows.map((u) =>
      sendToToken(
        u.fcm_token,
        'Daily food limit exceeded',
        `${pet_name} has had ${total_today_g}g today — over their ${daily_target_g}g daily target.`,
        'overfeed_alerts',
      ),
    ),
  );
  return res.json({ sent: users.rows.length });
});
