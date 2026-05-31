import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../lib/db';
import { config } from '../config';
import { publishCommand } from '../lib/mqtt';

export const devicesRouter = Router();

function getHeaders(req: Request) {
  return {
    householdId: req.headers['x-household-id'] as string,
    role: req.headers['x-user-role'] as string,
  };
}

// ── GET /devices ───────────────────────────────

devicesRouter.get('/', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const result = await db.query(
    `SELECT d.*,
       (SELECT json_agg(de ORDER BY de.created_at DESC)
        FROM (SELECT * FROM device_events WHERE device_id = d.id ORDER BY created_at DESC LIMIT 5) de
       ) AS recent_events
     FROM devices d
     WHERE d.household_id = $1
     ORDER BY d.name`,
    [householdId],
  );
  return res.json(result.rows);
});

// ── POST /devices ──────────────────────────────

const createDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  serial_number: z.string().min(1).max(100),
  // IANA timezone string supplied by the Android app (e.g. "Europe/London").
  // Used to set the household timezone so the schedule worker fires at the
  // correct local time rather than UTC.
  timezone: z.string().max(64).optional(),
});

devicesRouter.post('/', async (req: Request, res: Response) => {
  const { householdId, role } = getHeaders(req);
  if (role !== 'owner') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Owner role required' });
  }
  const body = createDeviceSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }

  // Check if this serial number already exists (e.g. a previous failed provisioning attempt).
  const existing = await db.query(
    'SELECT id, household_id FROM devices WHERE serial_number = $1',
    [body.data.serial_number],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].household_id !== householdId) {
      // Serial belongs to a different household — refuse.
      return res.status(409).json({ code: 'CONFLICT', message: 'Device already registered to another household' });
    }
    // Same household — stale record from a previous failed provisioning attempt. Remove it so
    // we can re-provision with a fresh UUID and MQTT client ID.
    await db.query('DELETE FROM devices WHERE id = $1', [existing.rows[0].id]);
  }

  const deviceUuid = crypto.randomUUID();
  const mqttClientId = `device_${deviceUuid}`;
  // cert_fingerprint is a placeholder — real cert is issued out-of-band during physical provisioning
  const certFingerprint = crypto.createHash('sha256').update(mqttClientId).digest('hex');

  const result = await db.query(
    `INSERT INTO devices (id, household_id, name, serial_number, mqtt_client_id, cert_fingerprint)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [deviceUuid, householdId, body.data.name, body.data.serial_number, mqttClientId, certFingerprint],
  );

  // Persist the household timezone if the app supplied one.
  // This is used by the schedule worker so feeds fire at the correct local time.
  // We only update when a timezone is provided — the default is already 'UTC'.
  if (body.data.timezone) {
    try {
      // Validate that the string is a real IANA zone before storing it.
      Intl.DateTimeFormat(undefined, { timeZone: body.data.timezone });
      await db.query('UPDATE households SET timezone = $1 WHERE id = $2', [body.data.timezone, householdId]);
    } catch {
      // Invalid timezone string — ignore silently, household keeps its current value.
    }
  }

  // Return MQTT credentials alongside the device record so the Android app
  // can provision the ESP32 over BLE without any user input.
  // mqtt_pass is never stored — it lives only in .env and in this one-time response.
  return res.status(201).json({
    ...result.rows[0],
    mqtt_user: config.MQTT_INTERNAL_USER,
    mqtt_pass: config.MQTT_INTERNAL_PASS,
  });
});

// ── GET /devices/:deviceId ─────────────────────

devicesRouter.get('/:deviceId', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const device = await db.query(
    'SELECT * FROM devices WHERE id = $1 AND household_id = $2',
    [req.params.deviceId, householdId],
  );
  if (!device.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Device not found' });

  const events = await db.query(
    'SELECT * FROM device_events WHERE device_id = $1 ORDER BY created_at DESC LIMIT 20',
    [req.params.deviceId],
  );
  return res.json({ ...device.rows[0], recent_events: events.rows });
});

// ── PATCH /devices/:deviceId ───────────────────

const updateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

devicesRouter.patch('/:deviceId', async (req: Request, res: Response) => {
  const { householdId, role } = getHeaders(req);
  if (role !== 'owner') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Owner role required' });
  }
  const body = updateDeviceSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  }
  const existing = await db.query(
    'SELECT id FROM devices WHERE id = $1 AND household_id = $2',
    [req.params.deviceId, householdId],
  );
  if (!existing.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Device not found' });

  if (body.data.name) {
    await db.query('UPDATE devices SET name = $1 WHERE id = $2', [body.data.name, req.params.deviceId]);
  }
  const result = await db.query('SELECT * FROM devices WHERE id = $1', [req.params.deviceId]);
  return res.json(result.rows[0]);
});

// ── DELETE /devices/:deviceId ──────────────────

devicesRouter.delete('/:deviceId', async (req: Request, res: Response) => {
  const { householdId, role } = getHeaders(req);
  if (role !== 'owner') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Owner role required' });
  }

  // Fetch before deleting so we can check status and derive the device UUID.
  const device = await db.query(
    'SELECT id, status, mqtt_client_id FROM devices WHERE id = $1 AND household_id = $2',
    [req.params.deviceId, householdId],
  );
  if (!device.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Device not found' });

  // If the device is currently online, send a factory_reset command so it wipes its
  // NVS credentials and re-enters BLE provisioning mode immediately.
  // The device UUID is the part after "device_" in the mqtt_client_id.
  if (device.rows[0].status === 'online') {
    const mqttClientId: string = device.rows[0].mqtt_client_id;
    const deviceUuid = mqttClientId.startsWith('device_') ? mqttClientId.slice(7) : mqttClientId;
    try {
      publishCommand(deviceUuid, { command_id: 'factory_reset', action: 'factory_reset', weight_g: 0 });
    } catch (err) {
      // Non-fatal — the record is still deleted. The device will stay provisioned
      // until manually reset, but the backend will no longer accept its telemetry.
      console.warn('Could not send factory_reset command:', err);
    }
  }

  await db.query('DELETE FROM devices WHERE id = $1', [req.params.deviceId]);
  return res.status(204).send();
});

// ── GET /devices/:deviceId/events ──────────────

const eventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

devicesRouter.get('/:deviceId/events', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const q = eventsQuerySchema.safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid query params' });
  }
  const device = await db.query(
    'SELECT id FROM devices WHERE id = $1 AND household_id = $2',
    [req.params.deviceId, householdId],
  );
  if (!device.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Device not found' });

  const { page, page_size } = q.data;
  const offset = (page - 1) * page_size;
  const countResult = await db.query(
    'SELECT COUNT(*) FROM device_events WHERE device_id = $1',
    [req.params.deviceId],
  );
  const total = parseInt(countResult.rows[0].count, 10);
  const result = await db.query(
    'SELECT * FROM device_events WHERE device_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [req.params.deviceId, page_size, offset],
  );
  return res.json({ data: result.rows, total, page, page_size });
});
