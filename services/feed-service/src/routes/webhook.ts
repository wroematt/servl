import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../lib/db';
import { createDispense } from '../lib/dispense';
import { config } from '../config';

export const webhookRouter = Router();

// ── Authentication ─────────────────────────────────────────────────────────────
// Three modes, checked in priority order:
//
//   1. X-Hub-Signature-256: sha256=<HMAC-SHA256(GOOGLE_HOME_HMAC_SECRET, body)>
//      Google Actions legacy fulfillment — raw body HMAC.
//
//   2. Authorization: Bearer <JWT>
//      OAuth account-linking mode. Google sends the OAuth access token issued
//      by /oauth/token as a Bearer JWT. We verify it with JWT_SECRET and extract
//      the household_id from the claim — no household_id needed in the body.
//      JWTs always start with "eyJ" (base64url of `{"alg":...}`), so we can
//      distinguish them from static-secret Bearer tokens.
//
//   3. Authorization: Bearer <static-secret>
//      Simple token mode for HTTP callers (Home Assistant, IFTTT, etc.) that
//      cannot compute a body HMAC. Compared via constant-time hash comparison.

type AuthResult =
  | { ok: true;  mode: 'hmac' | 'static' }
  | { ok: true;  mode: 'jwt'; userId: string; householdId: string; role: string }
  | { ok: false };

function authenticate(rawBody: Buffer, req: Request): AuthResult {
  const sig = req.headers['x-hub-signature-256'] as string | undefined;
  if (sig) {
    const expected = 'sha256=' + crypto.createHmac('sha256', config.GOOGLE_HOME_HMAC_SECRET)
      .update(rawBody).digest('hex');
    try {
      if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
        return { ok: true, mode: 'hmac' };
      }
    } catch { /* length mismatch → fall through */ }
    return { ok: false };
  }

  const auth = req.headers['authorization'] as string | undefined;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);

    // JWTs start with "eyJ" — verify as OAuth access token.
    if (token.startsWith('eyJ')) {
      try {
        const payload = jwt.verify(token, config.JWT_SECRET) as {
          sub: string; household_id: string; role: string;
        };
        return { ok: true, mode: 'jwt', userId: payload.sub,
                 householdId: payload.household_id, role: payload.role };
      } catch {
        return { ok: false };
      }
    }

    // Static-secret comparison — hash both sides for constant-time equal length.
    const secretHash = crypto.createHash('sha256').update(config.GOOGLE_HOME_HMAC_SECRET).digest();
    const tokenHash  = crypto.createHash('sha256').update(token).digest();
    try {
      if (crypto.timingSafeEqual(secretHash, tokenHash)) return { ok: true, mode: 'static' };
    } catch { /* ignore */ }
  }

  return { ok: false };
}

// Returns a JSON body understood by both Google Actions fulfillment
// (fulfillmentText) and simple HTTP callers that just want a readable result.
function voice(text: string) {
  return { fulfillmentText: text, message: text };
}

// ── Request schemas ──────────────────────────────────────────────────────────
// Two formats are accepted:
//
//   Flat format (HMAC / static-secret callers, Home Assistant, IFTTT):
//     { household_id, pet_name|pet_type, feed_type }
//
//   Actions Builder format (OAuth JWT callers — Google Actions webhook):
//     { handler: { name: "feed_pet" }, intent: { params: { pet: { resolved }, feed_type: { resolved } } } }
//     household_id comes from the verified JWT claim, not the body.

// Flat request body — household_id required because the caller has no JWT context.
const flatBodySchema = z.object({
  household_id: z.string().uuid(),
  pet_name:     z.string().min(1).optional(),
  pet_type:     z.enum(['cat', 'dog']).optional(),
  feed_type:    z.enum(['meal', 'snack']).default('meal'),
}).refine(
  (d) => Boolean(d.pet_name) !== Boolean(d.pet_type),
  { message: 'Provide exactly one of pet_name or pet_type.' },
);

// Actions Builder format. Google sends intent params as:
//   intent.params.<entity>.resolved  (for slot-filled entities)
// Handler name must be "feed_pet". Pet slot ("pet") resolves to the pet's name
// or type; feed_type slot resolves to "meal" or "snack".
const actionsBodySchema = z.object({
  handler: z.object({ name: z.string() }),
  intent:  z.object({
    params: z.object({
      pet:       z.object({ resolved: z.string() }).optional(),
      feed_type: z.object({ resolved: z.enum(['meal', 'snack']) }).optional(),
    }).optional(),
  }).optional(),
});

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

  const auth = authenticate(rawBody, req);
  if (!auth.ok) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid JSON' });
  }

  // ── Normalise the request into a flat shape ──────────────────────────────
  // Both paths converge to { household_id, pet_name?, pet_type?, feed_type }.
  let household_id: string;
  let pet_name: string | undefined;
  let pet_type: 'cat' | 'dog' | undefined;
  let feed_type: 'meal' | 'snack' = 'meal';

  if (auth.mode === 'jwt') {
    // OAuth path — household_id from JWT; body is Actions Builder format.
    const actionsResult = actionsBodySchema.safeParse(parsed);
    if (!actionsResult.success || actionsResult.data.handler.name !== 'feed_pet') {
      return res.json(voice("Sorry, I didn't understand that feeding request."));
    }
    household_id = auth.householdId;
    const params = actionsResult.data.intent?.params;
    const petSlot = params?.pet?.resolved ?? '';
    feed_type = params?.feed_type?.resolved ?? 'meal';

    // The pet slot is filled with whatever the user says — could be a name
    // ("Felix") or a type ("cat", "dog"). Treat single-word type matches as
    // type lookups; everything else is a name search.
    const PET_TYPES = ['cat', 'dog'] as const;
    const typeMatch = PET_TYPES.find((t) => petSlot.toLowerCase() === t);
    if (typeMatch) {
      pet_type = typeMatch;
    } else {
      pet_name = petSlot || undefined;
    }

    if (!pet_name && !pet_type) {
      return res.json(voice("I didn't catch which pet to feed. Please try again."));
    }
  } else {
    // HMAC / static-secret path — flat body with explicit household_id.
    const result = flatBodySchema.safeParse(parsed);
    if (!result.success) {
      return res.status(400).json({
        code:    'VALIDATION_ERROR',
        message: result.error.issues[0]?.message ?? 'Invalid request body',
      });
    }
    ({ household_id, pet_name, pet_type, feed_type } = result.data);
  }

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
