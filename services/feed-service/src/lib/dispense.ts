import { db } from './db';
import { AppError } from './errors';
import { config } from '../config';

interface DispenseOptions {
  petId: string;
  deviceId: string;
  weightG: number;
  triggerType: 'manual' | 'schedule' | 'voice' | 'api';
  triggeredBy?: string | null;
  scheduleId?: string | null;
}

export async function createDispense(opts: DispenseOptions) {
  const { petId, deviceId, weightG, triggerType, triggeredBy, scheduleId } = opts;

  const result = await db.query(
    `INSERT INTO feed_events
       (pet_id, device_id, triggered_by, schedule_id, weight_requested_g, trigger_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [petId, deviceId, triggeredBy ?? null, scheduleId ?? null, weightG, triggerType],
  );
  const feedEvent = result.rows[0];

  const response = await fetch(`${config.DEVICE_SERVICE_URL}/internal/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, feed_event_id: feedEvent.id, weight_g: weightG }),
  });

  if (!response.ok) {
    await db.query("UPDATE feed_events SET status = 'failed' WHERE id = $1", [feedEvent.id]);
    throw new AppError('DEVICE_ERROR', 502, 'Device service unavailable');
  }

  return feedEvent;
}
