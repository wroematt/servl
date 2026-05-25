import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';

export const schedulesRouter = Router();

function getHeaders(req: Request) {
  return {
    householdId: req.headers['x-household-id'] as string,
  };
}

// ── GET /schedules ─────────────────────────────

schedulesRouter.get('/', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const petId = req.query.petId as string | undefined;

  const conditions = ['p.household_id = $1', 'p.deleted_at IS NULL'];
  const params: unknown[] = [householdId];
  if (petId) {
    conditions.push(`s.pet_id = $2`);
    params.push(petId);
  }

  const result = await db.query(
    `SELECT s.*, p.name AS pet_name
     FROM schedules s
     JOIN pets p ON p.id = s.pet_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.created_at`,
    params,
  );
  return res.json(result.rows);
});

// ── POST /schedules ────────────────────────────

const createScheduleSchema = z.object({
  pet_id: z.string().uuid(),
  label: z.string().max(100).nullable().optional(),
  feed_type: z.enum(['meal', 'snack', 'custom']),
  weight_g: z.number().int().min(1).max(500),
  cron_expression: z.string().regex(/^(\S+\s){4}\S+$/, 'Must be a 5-field cron expression'),
  enabled: z.boolean().default(true),
});

schedulesRouter.post('/', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const body = createScheduleSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const pet = await db.query(
    'SELECT id FROM pets WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL',
    [body.data.pet_id, householdId],
  );
  if (!pet.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Pet not found' });

  const { pet_id, label, feed_type, weight_g, cron_expression, enabled } = body.data;
  const result = await db.query(
    `INSERT INTO schedules (pet_id, label, feed_type, weight_g, cron_expression, enabled)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [pet_id, label ?? null, feed_type, weight_g, cron_expression, enabled],
  );
  return res.status(201).json(result.rows[0]);
});

// ── PATCH /schedules/:scheduleId ───────────────

const updateScheduleSchema = z.object({
  label: z.string().max(100).nullable().optional(),
  feed_type: z.enum(['meal', 'snack', 'custom']).optional(),
  weight_g: z.number().int().min(1).max(500).optional(),
  cron_expression: z.string().regex(/^(\S+\s){4}\S+$/).optional(),
  enabled: z.boolean().optional(),
});

schedulesRouter.patch('/:scheduleId', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const body = updateScheduleSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }

  // Verify schedule belongs to household
  const existing = await db.query(
    `SELECT s.id FROM schedules s
     JOIN pets p ON p.id = s.pet_id
     WHERE s.id = $1 AND p.household_id = $2`,
    [req.params.scheduleId, householdId],
  );
  if (!existing.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Schedule not found' });

  const fields = body.data as Record<string, unknown>;
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }
  if (setClauses.length === 0) {
    const s = await db.query('SELECT * FROM schedules WHERE id = $1', [req.params.scheduleId]);
    return res.json(s.rows[0]);
  }
  values.push(req.params.scheduleId);
  const result = await db.query(
    `UPDATE schedules SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return res.json(result.rows[0]);
});

// ── DELETE /schedules/:scheduleId ──────────────

schedulesRouter.delete('/:scheduleId', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const result = await db.query(
    `DELETE FROM schedules s
     USING pets p
     WHERE s.id = $1 AND s.pet_id = p.id AND p.household_id = $2
     RETURNING s.id`,
    [req.params.scheduleId, householdId],
  );
  if (!result.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Schedule not found' });
  return res.status(204).send();
});
