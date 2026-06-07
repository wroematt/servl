import { db } from './db';
import { AppError } from './errors';
import { config } from '../config';

interface DispenseOptions {
  petId: string;
  deviceId: string;
  weightG: number;
  triggerType: 'manual' | 'schedule' | 'voice' | 'api' | 'button';
  triggeredBy?: string | null;
  scheduleId?: string | null;
}

export async function createDispense(opts: DispenseOptions) {
  const { petId, deviceId, weightG, triggerType, triggeredBy, scheduleId } = opts;

  let feedEvent: Record<string, unknown>;
  try {
    const result = await db.query(
      `INSERT INTO feed_events
         (pet_id, device_id, triggered_by, schedule_id, weight_requested_g, trigger_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [petId, deviceId, triggeredBy ?? null, scheduleId ?? null, weightG, triggerType],
    );
    feedEvent = result.rows[0];
  } catch (err: unknown) {
    // A partial unique index (idx_feed_events_one_pending_per_pet, see
    // postgres/migrations/005_feed_events_one_pending_per_pet.sql) guarantees at
    // most one 'pending' feed_event per pet — this is what actually prevents two
    // concurrent dispenses from racing past an application-level check (the UI
    // disabling Meal/Snack while a feed is in flight is the first line of
    // defence, not the only one). Translate the resulting unique-violation into
    // a friendly, actionable error.
    if ((err as { code?: string } | null)?.code === '23505') {
      throw new AppError(
        'FEED_IN_PROGRESS',
        409,
        'A feed is already in progress for this pet — wait for it to finish or time out (up to 30s) before trying again.',
      );
    }
    throw err;
  }

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
