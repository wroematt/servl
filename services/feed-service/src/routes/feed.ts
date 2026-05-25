import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { createDispense } from '../lib/dispense';

export const feedRouter = Router();

function getHeaders(req: Request) {
  return {
    userId: req.headers['x-user-id'] as string,
    householdId: req.headers['x-household-id'] as string,
  };
}

async function getPetForDispense(petId: string, householdId: string) {
  const result = await db.query(
    'SELECT id, device_id, meal_weight_g, snack_weight_g FROM pets WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL',
    [petId, householdId],
  );
  return result.rows[0] ?? null;
}

// ── POST /feed/meal ────────────────────────────

feedRouter.post('/meal', async (req: Request, res: Response) => {
  const { userId, householdId } = getHeaders(req);
  const body = z.object({ petId: z.string().uuid() }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'petId is required' });
  }
  const pet = await getPetForDispense(body.data.petId, householdId);
  if (!pet) return res.status(404).json({ code: 'NOT_FOUND', message: 'Pet not found' });
  if (!pet.device_id) return res.status(422).json({ code: 'NO_DEVICE', message: 'Pet has no device assigned' });

  const feedEvent = await createDispense({
    petId: pet.id,
    deviceId: pet.device_id,
    weightG: pet.meal_weight_g,
    triggerType: 'manual',
    triggeredBy: userId,
  });
  return res.status(201).json(feedEvent);
});

// ── POST /feed/snack ───────────────────────────

feedRouter.post('/snack', async (req: Request, res: Response) => {
  const { userId, householdId } = getHeaders(req);
  const body = z.object({ petId: z.string().uuid() }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'petId is required' });
  }
  const pet = await getPetForDispense(body.data.petId, householdId);
  if (!pet) return res.status(404).json({ code: 'NOT_FOUND', message: 'Pet not found' });
  if (!pet.device_id) return res.status(422).json({ code: 'NO_DEVICE', message: 'Pet has no device assigned' });

  const feedEvent = await createDispense({
    petId: pet.id,
    deviceId: pet.device_id,
    weightG: pet.snack_weight_g,
    triggerType: 'manual',
    triggeredBy: userId,
  });
  return res.status(201).json(feedEvent);
});

// ── POST /feed/custom ──────────────────────────

feedRouter.post('/custom', async (req: Request, res: Response) => {
  const { userId, householdId } = getHeaders(req);
  const body = z.object({
    petId: z.string().uuid(),
    weightG: z.number().int().min(1).max(500),
  }).safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const pet = await getPetForDispense(body.data.petId, householdId);
  if (!pet) return res.status(404).json({ code: 'NOT_FOUND', message: 'Pet not found' });
  if (!pet.device_id) return res.status(422).json({ code: 'NO_DEVICE', message: 'Pet has no device assigned' });

  const feedEvent = await createDispense({
    petId: pet.id,
    deviceId: pet.device_id,
    weightG: body.data.weightG,
    triggerType: 'manual',
    triggeredBy: userId,
  });
  return res.status(201).json(feedEvent);
});

// ── POST /internal/dispense (called by worker) ─

const internalSchema = z.object({
  pet_id: z.string().uuid(),
  device_id: z.string().uuid(),
  weight_g: z.number().int().min(1).max(500),
  trigger_type: z.enum(['manual', 'schedule', 'voice', 'api']),
  schedule_id: z.string().uuid().nullable().optional(),
});

feedRouter.post('/internal/dispense', async (req: Request, res: Response) => {
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
