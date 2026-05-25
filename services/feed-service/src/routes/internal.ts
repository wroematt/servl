import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createDispense } from '../lib/dispense';

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
