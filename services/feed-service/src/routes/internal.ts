import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { createDispense } from '../lib/dispense';
import { AppError } from '../lib/errors';
import { buildDeviceState } from '../lib/devicestate';
import { reportState, requestSync } from '../lib/homegraph';

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

// ── POST /internal/report-state (called by device-service on MQTT status
//    changes) ──
//
// Pushes the device's current Dispense state to Google Home via Home Graph
// "Report State" so the Google Home app and voice queries reflect hopper
// level / online status without waiting for Google to poll QUERY. Builds the
// same state shape as the smarthome QUERY handler (see lib/devicestate.ts)
// and pushes it once per Google account linked to the device's household —
// the idx_pets_one_per_device index guarantees at most one active pet per
// device, so the lookup is unambiguous.

const reportStateSchema = z.object({
  device_id: z.string().uuid(),
});

internalRouter.post('/report-state', async (req: Request, res: Response) => {
  const body = reportStateSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const { device_id } = body.data;

  const { rows } = await db.query<{
    pet_id: string;
    household_id: string;
    device_status: string | null;
    hopper_pct: number | null;
    last_dispensed_g: number | null;
  }>(
    `SELECT p.id AS pet_id, p.household_id, d.status AS device_status, d.hopper_pct,
            (SELECT COALESCE(fe.weight_dispensed_g, fe.weight_requested_g)
             FROM   feed_events fe
             WHERE  fe.pet_id = p.id
             ORDER BY fe.dispensed_at DESC
             LIMIT 1) AS last_dispensed_g
     FROM   pets p
     JOIN   devices d ON d.id = p.device_id
     WHERE  p.device_id = $1
       AND  p.deleted_at IS NULL`,
    [device_id],
  );
  const pet = rows[0];
  if (!pet) {
    return res.status(200).json({ reported: false, reason: 'NO_PET_ASSIGNED' });
  }

  const state = buildDeviceState(pet.device_status === 'online', pet.hopper_pct, pet.last_dispensed_g ?? undefined);

  const users = await db.query<{ id: string }>(
    `SELECT u.id
     FROM   users u
     JOIN   oauth_refresh_tokens ort ON ort.user_id = u.id
     WHERE  u.household_id = $1
     GROUP BY u.id`,
    [pet.household_id],
  );

  for (const user of users.rows) {
    await reportState(user.id, pet.pet_id, state);
  }

  return res.status(200).json({ reported: true, recipients: users.rows.length });
});

// ── POST /internal/request-sync (called by pet-service when a pet is added
//    or removed) ──
//
// Each pet is a SYNC-level PETFEEDER device (see smarthome.ts buildDevice()),
// so adding/removing a pet changes the device list Google's SYNC response
// returns. Calls Home Graph requestSync for every Google account linked to
// the household so HomeGraph picks up the change immediately rather than
// waiting for the next manual "Sync devices".

const requestSyncSchema = z.object({
  household_id: z.string().uuid(),
});

internalRouter.post('/request-sync', async (req: Request, res: Response) => {
  const body = requestSyncSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const { household_id } = body.data;

  const users = await db.query<{ id: string }>(
    `SELECT u.id
     FROM   users u
     JOIN   oauth_refresh_tokens ort ON ort.user_id = u.id
     WHERE  u.household_id = $1
     GROUP BY u.id`,
    [household_id],
  );

  for (const user of users.rows) {
    await requestSync(user.id);
  }

  return res.status(200).json({ requested: true, recipients: users.rows.length });
});
