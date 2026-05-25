import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { publishCommand } from '../lib/mqtt';
import { AppError } from '../lib/errors';

export const internalRouter = Router();

const commandSchema = z.object({
  device_id: z.string().uuid(),
  feed_event_id: z.string().uuid(),
  weight_g: z.number().int().min(1).max(500),
});

internalRouter.post('/command', async (req: Request, res: Response) => {
  const body = commandSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const { device_id, feed_event_id, weight_g } = body.data;

  const device = await db.query('SELECT id, mqtt_client_id, status FROM devices WHERE id = $1', [device_id]);
  if (!device.rows[0]) {
    throw new AppError('NOT_FOUND', 404, 'Device not found');
  }

  const { mqtt_client_id } = device.rows[0];
  const deviceId = mqtt_client_id.replace('device_', '');

  publishCommand(deviceId, {
    command_id: feed_event_id,
    action: 'dispense',
    weight_g,
  });

  return res.json({ published: true });
});
