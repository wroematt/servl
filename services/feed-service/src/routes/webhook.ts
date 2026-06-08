import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../lib/db';
import { createDispense } from '../lib/dispense';
import { config } from '../config';

export const webhookRouter = Router();

// ── Authentication ────────────────────────────────────────────────────────────
// Two modes, both keyed to GOOGLE_HOME_HMAC_SECRET:
//
//   1. X-Hub-Signature-256: sha256=<HMAC-SHA256(secret, body)>
//      Standard Google Actions fulfillment format — Google's servers sign the
//      raw request body before forwarding it to the fulfilment URL.
//
//   2. Authorization: Bearer <secret>
//      Simple token for Google Home Routines and other HTTP callers (e.g.
//      Home Assistant, IFTTT) that cannot compute a body HMAC client-side.
//      Both sides are hashed through SHA-256 before timingSafeEqual so the
//      comparison is constant-time regardless of token length.
function isAuthorised(secret: string, rawBody: Buffer, req: Request): boolean {
  const sig = req.headers['x-hub-signature-256'] as string | undefined;
  if (sig) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return false;
    }
  }

  const auth = req.headers['authorization'] as string | undefined;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    // Hash both values so timingSafeEqual always receives equal-length buffers,
    // avoiding both exceptions and length-based timing leaks.
    const secretHash = crypto.createHash('sha256').update(secret).digest();
    const tokenHash  = crypto.createHash('sha256').update(token).digest();
    return crypto.timingSafeEqual(secretHash, tokenHash);
  }

  return false;
}

// Returns a JSON body understood by both Google Actions fulfillment
// (fulfillmentText) and simple HTTP callers that just want a readable result.
function voice(text: string) {
  return { fulfillmentText: text, message: text };
}

// ── Request schema ────────────────────────────────────────────────────────────
// Exactly one of pet_name / pet_type must be present:
//
//   pet_name  — "Hey Google, feed Felix a meal"
//   pet_type  — "Hey Google, feed the cat" (only works if exactly one cat/dog
//               exists in the household; returns a helpful error if there are
//               multiple, directing the caller to use the pet's name instead)
//
// household_id scopes ALL pet lookups so one server can host multiple families
// without data leaking between them. Callers embed their household UUID in the
// request body — find yours in your Servl account settings.
const bodySchema = z.object({
  household_id: z.string().uuid(),
  pet_name:     z.string().min(1).optional(),
  pet_type:     z.enum(['cat', 'dog']).optional(),  // 'other' pets need a name
  feed_type:    z.enum(['meal', 'snack']).default('meal'),
}).refine(
  (d) => Boolean(d.pet_name) !== Boolean(d.pet_type),
  { message: 'Provide exactly one of pet_name or pet_type.' },
);

type PetRow = {
  id:             string;
  device_id:      string | null;
  name:           string;
  meal_weight_g:  number;
  snack_weight_g: number;
};

// ── Handler ───────────────────────────────────────────────────────────────────
// Registered with express.raw() in index.ts — req.body is a Buffer so the
// raw bytes are available for HMAC verification before JSON parsing.
webhookRouter.post('/', async (req: Request, res: Response) => {
  const rawBody = req.body as Buffer;

  if (!isAuthorised(config.GOOGLE_HOME_HMAC_SECRET, rawBody, req)) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid JSON' });
  }

  const result = bodySchema.safeParse(parsed);
  if (!result.success) {
    return res.status(400).json({
      code:    'VALIDATION_ERROR',
      message: result.error.issues[0]?.message ?? 'Invalid request body',
    });
  }

  const { household_id, pet_name, pet_type, feed_type } = result.data;

  // ── Pet lookup ──────────────────────────────────────────────────────────────
  let pet: PetRow | null = null;

  if (pet_name) {
    // Name-based lookup — case-insensitive, scoped to caller's household.
    const { rows } = await db.query<PetRow>(
      `SELECT id, device_id, name, meal_weight_g, snack_weight_g
       FROM   pets
       WHERE  LOWER(name) = LOWER($1)
         AND  household_id = $2
         AND  deleted_at IS NULL
       LIMIT  1`,
      [pet_name, household_id],
    );
    if (!rows[0]) {
      return res.json(voice(`I couldn't find a pet named ${pet_name} in your household.`));
    }
    pet = rows[0];
  } else if (pet_type) {
    // Type-based lookup — "feed the cat" / "feed the dog".
    // Only resolves unambiguously when exactly one pet of that type exists.
    const { rows } = await db.query<PetRow>(
      `SELECT id, device_id, name, meal_weight_g, snack_weight_g
       FROM   pets
       WHERE  type         = $1
         AND  household_id = $2
         AND  deleted_at IS NULL`,
      [pet_type, household_id],
    );
    if (rows.length === 0) {
      return res.json(voice(`I couldn't find any ${pet_type}s in your household.`));
    }
    if (rows.length > 1) {
      const names = rows.map((r) => r.name).join(' and ');
      return res.json(voice(
        `You have more than one ${pet_type} — ${names}. ` +
        `Please say the pet's name instead.`,
      ));
    }
    pet = rows[0];
  }

  if (!pet) {
    return res.json(voice("I couldn't find that pet."));
  }

  // ── Pre-flight checks ───────────────────────────────────────────────────────
  if (!pet.device_id) {
    return res.json(voice(`${pet.name} isn't assigned to a feeder yet.`));
  }

  const weightG = feed_type === 'snack' ? pet.snack_weight_g : pet.meal_weight_g;
  if (!weightG || weightG <= 0) {
    return res.json(voice(`${pet.name}'s ${feed_type} weight hasn't been configured yet.`));
  }

  // ── Dispatch ────────────────────────────────────────────────────────────────
  try {
    await createDispense({
      petId:       pet.id,
      deviceId:    pet.device_id,
      weightG,
      triggerType: 'voice',
    });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'FEED_IN_PROGRESS') {
      return res.json(voice(
        `${pet.name} is already being fed. Please wait a moment before trying again.`,
      ));
    }
    return res.json(voice(`Something went wrong while trying to feed ${pet.name}. Please try again.`));
  }

  const feedDesc = feed_type === 'snack' ? 'a snack' : 'a meal';
  return res.json(voice(`Feeding ${pet.name} ${feedDesc} now.`));
});
