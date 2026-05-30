import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import path from 'path';
import { db } from '../lib/db';
import { upload } from '../lib/upload';

export const petsRouter = Router();

function getHeaders(req: Request) {
  return {
    userId: req.headers['x-user-id'] as string,
    householdId: req.headers['x-household-id'] as string,
  };
}

// ── GET /pets ──────────────────────────────────

petsRouter.get('/', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const result = await db.query(
    `SELECT p.*,
       COALESCE(
         SUM(fe.weight_dispensed_g)
           FILTER (WHERE fe.dispensed_at >= CURRENT_DATE AND fe.status = 'confirmed'),
         0
       ) AS today_intake_g
     FROM pets p
     LEFT JOIN feed_events fe ON fe.pet_id = p.id
     WHERE p.household_id = $1 AND p.deleted_at IS NULL
     GROUP BY p.id
     ORDER BY p.name`,
    [householdId],
  );
  return res.json(result.rows);
});

// ── POST /pets ─────────────────────────────────

const createPetSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['cat', 'dog', 'other']),
  meal_weight_g: z.coerce.number().int().min(1).max(500).default(80),
  snack_weight_g: z.coerce.number().int().min(1).max(500).default(20),
  daily_target_g: z.coerce.number().int().min(1).max(2000).default(200),
  device_id: z.string().uuid().nullable().optional(),
});

petsRouter.post('/', upload.single('photo'), async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const body = createPetSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const { name, type, meal_weight_g, snack_weight_g, daily_target_g, device_id } = body.data;
  const photoUrl = req.file ? `/uploads/${path.basename(req.file.path)}` : null;

  const result = await db.query(
    `INSERT INTO pets (household_id, device_id, name, type, photo_url, meal_weight_g, snack_weight_g, daily_target_g)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [householdId, device_id ?? null, name, type, photoUrl, meal_weight_g, snack_weight_g, daily_target_g],
  );
  return res.status(201).json(result.rows[0]);
});

// ── GET /pets/:petId ───────────────────────────

petsRouter.get('/:petId', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const result = await db.query(
    'SELECT * FROM pets WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL',
    [req.params.petId, householdId],
  );
  if (!result.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Pet not found' });
  return res.json(result.rows[0]);
});

// ── PATCH /pets/:petId ─────────────────────────

// z.coerce.number() handles both JSON numbers and FormData strings
const updatePetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['cat', 'dog', 'other']).optional(),
  meal_weight_g:  z.coerce.number().int().min(1).max(500).optional(),
  snack_weight_g: z.coerce.number().int().min(1).max(500).optional(),
  daily_target_g: z.coerce.number().int().min(1).max(2000).optional(),
  device_id: z.string().uuid().nullable().optional(),
});

// upload.single('photo') is a no-op for JSON requests; it only activates for
// multipart/form-data submissions that include a file field named "photo".
petsRouter.patch('/:petId', upload.single('photo'), async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const body = updatePetSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() });
  }
  const pet = await db.query(
    'SELECT id FROM pets WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL',
    [req.params.petId, householdId],
  );
  if (!pet.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Pet not found' });

  const fields: Record<string, unknown> = { ...body.data };
  // If a new photo was uploaded, override photo_url
  if (req.file) {
    fields.photo_url = `/uploads/${path.basename(req.file.path)}`;
  }
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
    const updated = await db.query('SELECT * FROM pets WHERE id = $1', [req.params.petId]);
    return res.json(updated.rows[0]);
  }
  values.push(req.params.petId);
  const result = await db.query(
    `UPDATE pets SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );

  // Cascade weight changes to meal / snack schedules for this pet so that
  // schedules always reflect the pet's current portion sizes.
  const { meal_weight_g, snack_weight_g } = body.data;
  if (meal_weight_g !== undefined) {
    await db.query(
      `UPDATE schedules SET weight_g = $1 WHERE pet_id = $2 AND feed_type = 'meal'`,
      [meal_weight_g, req.params.petId],
    );
  }
  if (snack_weight_g !== undefined) {
    await db.query(
      `UPDATE schedules SET weight_g = $1 WHERE pet_id = $2 AND feed_type = 'snack'`,
      [snack_weight_g, req.params.petId],
    );
  }

  return res.json(result.rows[0]);
});

// ── DELETE /pets/:petId ────────────────────────

petsRouter.delete('/:petId', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const result = await db.query(
    'UPDATE pets SET deleted_at = NOW() WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL RETURNING id',
    [req.params.petId, householdId],
  );
  if (!result.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Pet not found' });
  return res.status(204).send();
});

// ── GET /pets/:petId/feeds ─────────────────────

const feedsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().refine(v => !isNaN(Date.parse(v)), 'Invalid date').optional(),
  to: z.string().refine(v => !isNaN(Date.parse(v)), 'Invalid date').optional(),
  trigger_type: z.enum(['manual', 'schedule', 'voice', 'api']).optional(),
});

petsRouter.get('/:petId/feeds', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const q = feedsQuerySchema.safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid query params' });
  }

  const pet = await db.query(
    'SELECT id FROM pets WHERE id = $1 AND household_id = $2',
    [req.params.petId, householdId],
  );
  if (!pet.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Pet not found' });

  const { page, page_size, from, to, trigger_type } = q.data;
  const offset = (page - 1) * page_size;
  const conditions: string[] = ['pet_id = $1'];
  const params: unknown[] = [req.params.petId];
  let p = 2;

  if (from)          { conditions.push(`dispensed_at >= $${p++}`); params.push(from); }
  if (to)            { conditions.push(`dispensed_at <= $${p++}`); params.push(to); }
  if (trigger_type)  { conditions.push(`trigger_type = $${p++}`); params.push(trigger_type); }

  const where = conditions.join(' AND ');
  const countResult = await db.query(`SELECT COUNT(*) FROM feed_events WHERE ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(page_size, offset);
  const result = await db.query(
    `SELECT * FROM feed_events WHERE ${where} ORDER BY dispensed_at DESC LIMIT $${p} OFFSET $${p + 1}`,
    params,
  );

  return res.json({ data: result.rows, total, page, page_size });
});

// ── GET /pets/:petId/stats ─────────────────────

const statsQuerySchema = z.object({
  from: z.string().refine(v => !isNaN(Date.parse(v)), 'Invalid date for from'),
  to: z.string().refine(v => !isNaN(Date.parse(v)), 'Invalid date for to'),
});

petsRouter.get('/:petId/stats', async (req: Request, res: Response) => {
  const { householdId } = getHeaders(req);
  const q = statsQuerySchema.safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'from and to are required' });
  }
  const pet = await db.query(
    'SELECT id FROM pets WHERE id = $1 AND household_id = $2',
    [req.params.petId, householdId],
  );
  if (!pet.rows[0]) return res.status(404).json({ code: 'NOT_FOUND', message: 'Pet not found' });

  const result = await db.query(
    `SELECT
       DATE(dispensed_at) AS date,
       COALESCE(SUM(weight_dispensed_g), 0) AS total_g,
       COUNT(*) AS feed_count
     FROM feed_events
     WHERE pet_id = $1 AND status = 'confirmed'
       AND dispensed_at >= $2 AND dispensed_at <= $3
     GROUP BY DATE(dispensed_at)
     ORDER BY date`,
    [req.params.petId, q.data.from, q.data.to],
  );
  return res.json(result.rows);
});
