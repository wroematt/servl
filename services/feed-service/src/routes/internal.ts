import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { createDispense } from '../lib/dispense';
import { AppError } from '../lib/errors';

export const internalRouter = Router();

// ── POST /internal/dispense (called by the schedule worker) ──

const internalSchema = z.object({
  pet_id: z.string().uuid(),
  device_id: z.string().uuid(),
  weight_g: z.number().int().min(1).max(500),
  trigger_type: z.enum(['manual', 'schedule', 'voice', 'api']),
  schedule_id: z.string().uuid().nullable().optional(),
});

internalRouter.post('/dispense', async (req: Request, res: Response) => {
  const body = internalSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const { pet_id, device_id, weight_g, trigger_type, schedule_id } = body.data;
  const feedEvent = await createDispense({
    petId: pet_id,
    deviceId: device_id,
    weightG: weight_g,
    triggerType: trigger_type,
    scheduleId: schedule_id,
  });
  return res.status(201).json(feedEvent);
});

// ── POST /internal/button-press (called by device-service on a physical
//    Meal/Snack double-click — see TaskList #10 / feeder/{id}/button) ──
//
// The device only knows its own ID — not which pet it feeds or how much that
// pet's meal/snack portions are — so this resolves both from the DB (the
// idx_pets_one_per_device partial unique index from migration 006 guarantees
// at most one active pet per device, so the lookup is unambiguous) and then
// runs through the exact same createDispense() path /feed/meal and /feed/snack
// use. That gives button-triggered feeds identical validation, the
// one-pending-feed-per-pet concurrency guard, and MQTT confirmation — the
// device-originated trigger is recorded distinctly via trigger_type='button'
// (see migration 007) but otherwise behaves exactly like any other feed.

const buttonPressSchema = z.object({
  device_id: z.string().uuid(),
  feed_type: z.enum(['meal', 'snack']),
});

internalRouter.post('/button-press', async (req: Request, res: Response) => {
  const body = buttonPressSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const { device_id, feed_type } = body.data;

  const pet = await db.query(
    `SELECT id, meal_weight_g, snack_weight_g FROM pets
     WHERE device_id = $1 AND deleted_at IS NULL`,
    [device_id],
  );
  if (!pet.rows[0]) {
    // The device has no way to know whether it's assigned to a pet — this is
    // a normal "nothing to do" outcome (e.g. unassigned/newly-provisioned
    // unit), not an error worth surfacing back through MQTT/device logs.
    return res.status(200).json({ dispensed: false, reason: 'NO_PET_ASSIGNED' });
  }

  const weightG = feed_type === 'meal' ? pet.rows[0].meal_weight_g : pet.rows[0].snack_weight_g;

  try {
    const feedEvent = await createDispense({
      petId: pet.rows[0].id,
      deviceId: device_id,
      weightG,
      triggerType: 'button',
    });
    return res.status(201).json({ dispensed: true, feedEvent });
  } catch (err: unknown) {
    // A double-click during an in-flight feed is entirely plausible (a pet
    // pawing at the button, or a feed already running from a schedule/app) —
    // treat it as a graceful no-op rather than an error the device needs to
    // do anything about.
    if (err instanceof AppError && err.code === 'FEED_IN_PROGRESS') {
      return res.status(200).json({ dispensed: false, reason: 'FEED_IN_PROGRESS' });
    }
    throw err;
  }
});
