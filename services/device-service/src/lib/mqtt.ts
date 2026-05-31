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
  });

  client.on('message', async (topic, payload) => {
    try {
      const msg = JSON.parse(payload.toString()) as MqttStatusPayload;
      const deviceId = topic.split('/')[1];
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
    return;
  }

  // Fetch previous status so we can detect an offline→online transition.
  const prev = await db.query('SELECT status FROM devices WHERE id = $1', [deviceId]);
  const wasOffline = !prev.rows[0] || prev.rows[0].status !== 'online';

  await db.query(
    `UPDATE devices
     SET hopper_pct = $1, last_seen_at = NOW(), status = 'online',
         firmware_version = COALESCE($2, firmware_version)
     WHERE id = $3`,
    [msg.hopper_pct, msg.firmware_version ?? null, deviceId],
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
    await db.query(
      `UPDATE feed_events
       SET status = 'confirmed', weight_dispensed_g = $1
       WHERE id = $2 AND status = 'pending'`,
      [msg.dispensed_g ?? 0, msg.command_id],
    );
  }

  // 3. Log and notify on low hopper
  if (msg.status === 'low_hopper' || msg.hopper_pct < 20) {
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
            device_name: device.rows[0].name,
            hopper_pct: msg.hopper_pct,
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
