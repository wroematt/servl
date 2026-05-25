import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { sendToToken } from '../lib/fcm';

export const internalRouter = Router();

// ── POST /internal/notify/feed ─────────────────

internalRouter.post('/notify/feed', async (req: Request, res: Response) => {
  const body = z.object({
    household_id: z.string().uuid(),
    pet_name: z.string(),
    weight_g: z.number(),
  }).safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }

  const { household_id, pet_name, weight_g } = body.data;
  const users = await db.query(
    'SELECT fcm_token FROM users WHERE household_id = $1 AND fcm_token IS NOT NULL',
    [household_id],
  );

  await Promise.all(
    users.rows.map((u) =>
      sendToToken(u.fcm_token, 'Meal served!', `${pet_name} was fed ${weight_g}g.`),
    ),
  );
  return res.json({ sent: users.rows.length });
});

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
      ),
    ),
  );
  return res.json({ sent: owners.rows.length });
});
