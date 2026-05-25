import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../lib/db';

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

  const deviceUuid = crypto.randomUUID();
  const mqttClientId = `device_${deviceUuid}`;
  // cert_fingerprint is a placeholder — real cert is issued out-of-band during physical provisioning
  const certFingerprint = crypto.createHash('sha256').update(mqttClientId).digest('hex');

  const result = await db.query(
    `INSERT INTO devices (id, household_id, name, serial_number, mqtt_client_id, cert_fingerprint)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [deviceUuid, householdId, body.data.name, body.data.serial_number, mqttClientId, certFingerprint],
  );
  return res.status(201).json(result.rows[0]);
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
  const result = await db.query(
    'DELETE FROM devices WHERE id = $1 AND household_id = $2 RETURNING id',
    [req.params.deviceId, householdId],
  );
  if (!result.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Device not found' });
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
