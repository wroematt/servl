import mqtt from 'mqtt';
import type { MqttStatusPayload, MqttCommandPayload } from '@servl/shared';
import { config } from '../config';
import { db } from './db';

let client: mqtt.MqttClient;

export function connectMqtt() {
  client = mqtt.connect(config.MQTT_BROKER_URL, {
    username: config.MQTT_INTERNAL_USER,
    password: config.MQTT_INTERNAL_PASS,
    clientId: `device-service-${Date.now()}`,
    reconnectPeriod: 5000,
  });

  client.on('connect', () => {
    console.log('MQTT connected');
    client.subscribe('feeder/+/status', { qos: 1 }, (err) => {
      if (err) console.error('MQTT subscribe error:', err);
    });
    // Physical Meal/Snack button presses (double-click — see TaskList #10).
    // Published by the device itself, not the broker's status pipeline, since
    // it's a request *to* the server rather than telemetry *from* the device.
    client.subscribe('feeder/+/button', { qos: 1 }, (err) => {
      if (err) console.error('MQTT subscribe error (button):', err);
    });
  });

  client.on('message', async (topic, payload) => {
    try {
      const [, deviceId, topicType] = topic.split('/');
      if (topicType === 'button') {
        await handleButtonPress(deviceId, JSON.parse(payload.toString()));
        return;
      }
      const msg = JSON.parse(payload.toString()) as MqttStatusPayload;
      await handleStatusMessage(deviceId, msg);
    } catch (err) {
      console.error('MQTT message handling error:', err);
    }
  });

  client.on('error', (err) => console.error('MQTT client error:', err));
  client.on('offline', () => console.warn('MQTT client offline'));
}

export function publishCommand(deviceId: string, payload: MqttCommandPayload) {
  if (!client?.connected) {
    throw new Error('MQTT client not connected');
  }
  client.publish(`feeder/${deviceId}/cmd`, JSON.stringify(payload), { qos: 1 });
}

// ── Physical Meal/Snack button presses ────────────────────────────────────
// Published by the firmware to feeder/{deviceId}/button on a double-click
// (see TaskList #10): { "feed_type": "meal" | "snack" }. The device only
// knows its own ID — not which pet it feeds, the portion size, or whether a
// feed is already in flight — so we hand off to feed-service's internal
// /internal/button-press route, which resolves the pet and runs the request
// through the exact same createDispense() path /feed/meal and /feed/snack
// use (same validation, same one-pending-feed-per-pet guard, same MQTT
// confirmation loop). This keeps "device service is the only service that
// publishes commands" intact — feed-service still never touches MQTT
// directly; it calls back into device-service's /internal/command exactly as
// it does for app-triggered feeds.
async function handleButtonPress(deviceId: string, msg: { feed_type?: string }) {
  if (msg.feed_type !== 'meal' && msg.feed_type !== 'snack') {
    console.warn(`[mqtt] Ignoring malformed button press from device ${deviceId}:`, msg);
    return;
  }

  console.log(`[mqtt] Button press: device=${deviceId} feed_type=${msg.feed_type}`);

  if (!config.FEED_SERVICE_URL) {
    console.error('[mqtt] Cannot handle button press — FEED_SERVICE_URL not configured');
    return;
  }

  try {
    const response = await fetch(`${config.FEED_SERVICE_URL}/internal/button-press`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, feed_type: msg.feed_type }),
    });
    if (!response.ok) {
      console.error(`[mqtt] Button-press dispense request failed for device ${deviceId}: HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`[mqtt] Button-press dispense request error for device ${deviceId}:`, err);
  }
}

// ── Google Home Report State ──────────────────────────────────────────────
// Notifies feed-service that this device's state changed so it can push a
// Report State update to Home Graph (see feed-service
// /internal/report-state and lib/homegraph.ts). Best-effort and silent —
// Report State is an enhancement on top of SYNC/QUERY/EXECUTE, never
// required for them, and feed-service itself no-ops if Home Graph isn't
// configured.
async function reportStateToGoogleHome(deviceId: string) {
  if (!config.FEED_SERVICE_URL) return;

  try {
    const response = await fetch(`${config.FEED_SERVICE_URL}/internal/report-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId }),
    });
    if (!response.ok) {
      console.error(`[mqtt] report-state request failed for device ${deviceId}: HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`[mqtt] report-state request error for device ${deviceId}:`, err);
  }
}

async function handleStatusMessage(deviceId: string, msg: MqttStatusPayload) {
  // 1. Update device telemetry.
  // LWT messages (broker-generated on unexpected disconnect) have status='offline'.
  // In that case update the status column but do not update last_seen_at or telemetry
  // so the last-known values remain visible in the UI.
  if (msg.status === 'offline') {
    await db.query(
      `UPDATE devices SET status = 'offline' WHERE id = $1`,
      [deviceId],
    );
    reportStateToGoogleHome(deviceId);
    return;
  }

  // Read-modify-write the device row INSIDE a transaction with a row lock
  // (SELECT ... FOR UPDATE). This makes the "read previous state, then write
  // new state" sequence atomic per device, so two status messages for the same
  // device that arrive close together (QoS redelivery, broker bursts, etc.)
  // can never both observe the pre-update state as "ok" — which is exactly
  // the kind of race that would make a one-shot threshold alert re-fire on
  // every message instead of only once per episode.
  let wasOffline: boolean;
  let prevHopperPct: number;
  let prevStatus: string | undefined;
  const txClient = await db.connect();
  try {
    await txClient.query('BEGIN');
    const prev = await txClient.query(
      'SELECT status, hopper_pct FROM devices WHERE id = $1 FOR UPDATE',
      [deviceId],
    );
    prevStatus    = prev.rows[0]?.status;
    wasOffline    = !prev.rows[0] || prev.rows[0].status !== 'online';
    prevHopperPct = prev.rows[0]?.hopper_pct ?? 100;

    await txClient.query(
      `UPDATE devices
       SET hopper_pct = $1, last_seen_at = NOW(), status = 'online',
           firmware_version = COALESCE($2, firmware_version)
       WHERE id = $3`,
      [msg.hopper_pct, msg.firmware_version ?? null, deviceId],
    );
    await txClient.query('COMMIT');
  } catch (err) {
    await txClient.query('ROLLBACK').catch(() => {});
    console.error(
      `[mqtt] hopper read/update transaction failed for device ${deviceId} ` +
      `(msg.hopper_pct=${JSON.stringify(msg.hopper_pct)}):`,
      err,
    );
    throw err;
  } finally {
    txClient.release();
  }

  // Push a Report State update to Google Home only when something a voice
  // query would care about actually changed (came back online, or the
  // hopper level moved) — avoids a Home Graph call on every 30s heartbeat.
  if (wasOffline || prevHopperPct !== msg.hopper_pct) {
    reportStateToGoogleHome(deviceId);
  }

  // TEMP DIAGNOSTIC — remove once the repeat-notification issue is root-caused.
  console.log(
    `[mqtt][diag] device=${deviceId} prevStatus=${prevStatus} ` +
    `prevHopperPct=${prevHopperPct} msg.hopper_pct=${msg.hopper_pct} msg.status=${msg.status} ` +
    `wasOkBefore=${prevHopperPct >= 20} isNowLow=${msg.hopper_pct < 20 || msg.status === 'low_hopper'} ` +
    `willNotify=${(msg.hopper_pct < 20 || msg.status === 'low_hopper') && prevHopperPct >= 20}`,
  );

  // 1b. If the device just came back online, republish any feed commands that
  // arrived while it was offline (created within the last 2 hours to avoid
  // replaying very stale commands that may no longer be relevant).
  if (wasOffline) {
    replayPendingCommands(deviceId).catch((err) =>
      console.error(`Failed to replay pending commands for device ${deviceId}:`, err),
    );
  }

  // 2. Confirm feed event if this is a dispense acknowledgement
  if (msg.command_id) {
    const updated = await db.query(
      `UPDATE feed_events
       SET status = 'confirmed', weight_dispensed_g = $1
       WHERE id = $2 AND status = 'pending'
       RETURNING pet_id, weight_dispensed_g`,
      [msg.dispensed_g ?? 0, msg.command_id],
    );

    // Check for overfeed. (Note: we deliberately do NOT send a "meal served"
    // confirmation notification here — with several scheduled meals a day,
    // a push per dispense was reported as too frequent and annoying.)
    if (updated.rows.length > 0 && config.NOTIFICATION_SERVICE_URL) {
      const { pet_id, weight_dispensed_g } = updated.rows[0];
      const [deviceRow, petRow, todayRow] = await Promise.all([
        db.query('SELECT household_id FROM devices WHERE id = $1', [deviceId]),
        db.query('SELECT name FROM pets WHERE id = $1', [pet_id]),
        // Sum today's confirmed feeds for this pet and get daily target
        db.query(
          `SELECT COALESCE(SUM(fe.weight_dispensed_g), 0) AS total_today_g,
                  p.daily_target_g
           FROM   feed_events fe
           JOIN   pets p ON p.id = fe.pet_id
           WHERE  fe.pet_id = $1
             AND  fe.status = 'confirmed'
             AND  fe.dispensed_at >= CURRENT_DATE
           GROUP BY p.daily_target_g`,
          [pet_id],
        ),
      ]);

      if (deviceRow.rows[0] && petRow.rows[0]) {
        const notifBase = {
          household_id: deviceRow.rows[0].household_id,
          pet_name:     petRow.rows[0].name,
        };

        // Overfeed notification — fires exactly once when the daily total first
        // crosses the target (previous total was within budget, now over it).
        if (todayRow.rows.length > 0) {
          const { total_today_g, daily_target_g } = todayRow.rows[0];
          const prevTotal = Number(total_today_g) - weight_dispensed_g;
          if (prevTotal <= daily_target_g && Number(total_today_g) > daily_target_g) {
            fetch(`${config.NOTIFICATION_SERVICE_URL}/internal/notify/overfeed`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...notifBase,
                total_today_g:  Number(total_today_g),
                daily_target_g: daily_target_g,
              }),
            }).catch((err) => console.error('Overfeed notification error:', err));
          }
        }
      }
    }
  }

  // 3. Log and notify when the hopper crosses below 20% — fires exactly once per
  // episode (the moment it drops below the threshold). No alert if it was already
  // low on the previous heartbeat. Refilling above 20% resets the episode so the
  // next drop will alert again.
  const isNowLow  = msg.hopper_pct < 20 || msg.status === 'low_hopper';
  const wasOkBefore = prevHopperPct >= 20;
  if (isNowLow && wasOkBefore) {
    await db.query(
      `INSERT INTO device_events (device_id, event_type, payload)
       VALUES ($1, 'hopper_low', $2)`,
      [deviceId, JSON.stringify({ hopper_pct: msg.hopper_pct })],
    );
    if (config.NOTIFICATION_SERVICE_URL) {
      const device = await db.query('SELECT household_id, name FROM devices WHERE id = $1', [deviceId]);
      if (device.rows[0]) {
        fetch(`${config.NOTIFICATION_SERVICE_URL}/internal/notify/hopper-low`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            household_id: device.rows[0].household_id,
            device_name:  device.rows[0].name,
            hopper_pct:   msg.hopper_pct,
          }),
        }).catch((err) => console.error('Notification service error:', err));
      }
    }
  }

  // 4. Log device errors
  if (msg.status === 'error') {
    await db.query(
      `INSERT INTO device_events (device_id, event_type, payload)
       VALUES ($1, 'error', $2)`,
      [deviceId, JSON.stringify({ error_message: msg.error_message })],
    );
  }
}

/**
 * Replay any pending feed_events for a device that were created while it was
 * offline (within the last 2 hours). Called automatically when the device
 * transitions from offline → online.
 */
async function replayPendingCommands(deviceId: string) {
  const pending = await db.query(
    `SELECT id, weight_requested_g
     FROM feed_events
     WHERE device_id = $1
       AND status    = 'pending'
       AND dispensed_at > NOW() - INTERVAL '2 hours'`,
    [deviceId],
  );

  if (pending.rows.length === 0) return;
  console.log(`[mqtt] Replaying ${pending.rows.length} pending command(s) for device ${deviceId}`);

  for (const event of pending.rows) {
    try {
      publishCommand(deviceId, {
        command_id: event.id,
        action: 'dispense',
        weight_g: event.weight_requested_g,
      });
    } catch (err) {
      console.error(`[mqtt] Failed to replay command ${event.id}:`, err);
    }
  }
}
