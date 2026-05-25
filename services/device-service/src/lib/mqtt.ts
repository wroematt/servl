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
  // 1. Update device telemetry
  await db.query(
    `UPDATE devices
     SET hopper_pct = $1, last_seen_at = NOW(), status = 'online',
         firmware_version = COALESCE($2, firmware_version)
     WHERE id = $3`,
    [msg.hopper_pct, msg.firmware_version ?? null, deviceId],
  );

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
