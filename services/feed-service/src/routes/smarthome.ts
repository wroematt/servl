// Google Home Smart Home API fulfillment webhook.
//
// Google sends a POST here on every voice command, device sync, and account
// unlink. The request is authenticated with the OAuth JWT access token that
// user-service issued during account linking — Google sends it as
// "Authorization: Bearer <jwt>" on every call.
//
// Intents handled:
//   SYNC      — user links account or says "sync my devices"; returns all pets
//               as PETFEEDER devices so Google knows what to control
//   QUERY     — Google asks for current device state (online / offline)
//   EXECUTE   — actual feed command ("Hey Google, feed Felix a meal")
//   DISCONNECT — user unlinks; revoke their OAuth refresh tokens
//
// Voice commands this enables (once set up in Google Home Developer Console):
//   "Hey Google, feed Felix"
//   "Hey Google, give Felix a meal"
//   "Hey Google, give Felix a snack"
//   "Hey Google, feed Felix a treat"

import 'express-async-errors';
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../lib/db';
import { createDispense } from '../lib/dispense';
import { config } from '../config';

export const smarthomeRouter = Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
// Verify the OAuth JWT Bearer token that Google sends on every request.
// The token was issued by user-service /oauth/token and is signed with the
// same JWT_SECRET — feed-service verifies it locally without a round-trip.
function verifyToken(req: Request): { userId: string; householdId: string } | null {
  const auth = req.headers['authorization'] as string | undefined;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(auth.slice(7), config.JWT_SECRET) as {
      sub: string;
      household_id: string;
    };
    if (!payload.sub || !payload.household_id) return null;
    return { userId: payload.sub, householdId: payload.household_id };
  } catch {
    return null;
  }
}

// ── Device builder ────────────────────────────────────────────────────────────
// Each pet becomes a PETFEEDER device. The pet's UUID is the device ID — this
// makes EXECUTE routing trivial (device ID → pet ID → look up weights).
//
// Two dispense items are registered per pet:
//   "meal"  → maps to pets.meal_weight_g on EXECUTE
//   "snack" → maps to pets.snack_weight_g on EXECUTE
//
// Synonyms are what Google uses for voice matching. Pet-type-aware food words
// ("cat food", "dog food") improve recognition without needing a backend change.
type PetRow = {
  id: string;
  name: string;
  type: string;
  device_id: string | null;
  meal_weight_g: number;
  snack_weight_g: number;
};

function buildDevice(pet: PetRow) {
  const mealSynonyms =
    pet.type === 'cat' ? ['meal', 'food', 'cat food', 'kibble'] :
    pet.type === 'dog' ? ['meal', 'food', 'dog food', 'kibble'] :
                         ['meal', 'food', 'pet food'];

  return {
    id: pet.id,
    type: 'action.devices.types.PETFEEDER',
    traits: ['action.devices.traits.Dispense'],
    name: {
      defaultNames: ['Servl Feeder'],
      name: pet.name,
      nicknames: [pet.name, `${pet.name}'s feeder`, `${pet.name} feeder`],
    },
    willReportState: false,
    deviceInfo: {
      manufacturer: 'Servl',
      model: 'Smart Pet Feeder',
      swVersion: '1.0',
    },
    attributes: {
      supportedDispenseItems: [
        {
          item_name: 'meal',
          item_name_synonyms: [{ lang: 'en', synonyms: mealSynonyms }],
          supported_units: ['NO_UNITS'],
          default_portion: { amount: 1, unit: 'NO_UNITS' },
        },
        {
          item_name: 'snack',
          item_name_synonyms: [
            { lang: 'en', synonyms: ['snack', 'treat', 'snacks', 'treats'] },
          ],
          supported_units: ['NO_UNITS'],
          default_portion: { amount: 1, unit: 'NO_UNITS' },
        },
      ],
    },
  };
}

// ── Webhook handler ───────────────────────────────────────────────────────────
smarthomeRouter.post('/', async (req: Request, res: Response) => {
  const auth = verifyToken(req);
  if (!auth) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  const body = req.body as {
    requestId: string;
    inputs: Array<{ intent: string; payload?: unknown }>;
  };

  const { requestId, inputs } = body;
  const input = inputs?.[0];
  if (!requestId || !input) {
    return res.status(400).json({ error: 'malformed_request' });
  }

  const { intent, payload } = input;

  // TEMPORARY DIAGNOSTIC: log every Smart Home intent received, to confirm
  // whether Google Home test/retest requests reach feed-service. Remove once resolved.
  console.log(`[smarthome] intent=${intent} requestId=${requestId}`);

  // ── SYNC ────────────────────────────────────────────────────────────────────
  // Return all pets as PETFEEDER devices. Called when the user first links
  // their account and when Google refreshes ("Hey Google, sync my devices").
  if (intent === 'action.devices.SYNC') {
    const { rows } = await db.query<PetRow>(
      `SELECT id, name, type, device_id, meal_weight_g, snack_weight_g
       FROM   pets
       WHERE  household_id = $1
         AND  deleted_at IS NULL
       ORDER BY name`,
      [auth.householdId],
    );

    return res.json({
      requestId,
      payload: {
        agentUserId: auth.userId,
        devices: rows.map(buildDevice),
      },
    });
  }

  // ── QUERY ───────────────────────────────────────────────────────────────────
  // Google asks "is this device online?" before executing a command.
  // A pet is considered online if it has a feeder device assigned.
  if (intent === 'action.devices.QUERY') {
    const qPayload = payload as { devices: Array<{ id: string }> };
    const petIds = (qPayload?.devices ?? []).map((d) => d.id);

    const { rows } = await db.query<{ id: string; device_id: string | null }>(
      `SELECT id, device_id
       FROM   pets
       WHERE  id = ANY($1::uuid[])
         AND  household_id = $2
         AND  deleted_at IS NULL`,
      [petIds, auth.householdId],
    );

    const states: Record<string, unknown> = {};
    for (const petId of petIds) {
      const pet = rows.find((r) => r.id === petId);
      states[petId] = {
        status: 'SUCCESS',
        online: Boolean(pet?.device_id),
        currentDispenseItems: [],
      };
    }

    // TEMPORARY DIAGNOSTIC: log the online state returned for each pet, to
    // confirm what Google's OnlineOffline test sees. Remove once resolved.
    console.log(`[smarthome] QUERY petIds=${JSON.stringify(petIds)} states=${JSON.stringify(states)}`);

    return res.json({ requestId, payload: { devices: states } });
  }

  // ── EXECUTE ─────────────────────────────────────────────────────────────────
  // The actual feed command. Google sends one command block per voice utterance,
  // potentially targeting multiple devices in a single request (e.g. "feed all
  // my pets"). We handle each device independently and report per-device results.
  if (intent === 'action.devices.EXECUTE') {
    const ePayload = payload as {
      commands: Array<{
        devices:   Array<{ id: string }>;
        execution: Array<{
          command: string;
          params:  { item?: string; amount?: number; unit?: string };
        }>;
      }>;
    };

    type CommandResult = {
      ids: string[];
      status: string;
      states?: Record<string, unknown>;
      errorCode?: string;
    };
    const results: CommandResult[] = [];

    for (const cmd of ePayload.commands ?? []) {
      const petIds  = cmd.devices.map((d) => d.id);
      const exec    = cmd.execution[0];

      if (exec.command !== 'action.devices.commands.Dispense') {
        results.push({ ids: petIds, status: 'ERROR', errorCode: 'notSupported' });
        continue;
      }

      // item will be "meal" or "snack" as configured in supportedDispenseItems.
      // Anything unrecognised defaults to meal.
      const item = (exec.params.item ?? 'meal').toLowerCase();
      const feedType: 'meal' | 'snack' = item === 'snack' ? 'snack' : 'meal';

      for (const petId of petIds) {
        // Look up the pet — enforce household scoping so one user cannot trigger
        // another household's feeder by guessing a pet UUID.
        const { rows } = await db.query<PetRow>(
          `SELECT id, name, device_id, meal_weight_g, snack_weight_g, type
           FROM   pets
           WHERE  id = $1
             AND  household_id = $2
             AND  deleted_at IS NULL`,
          [petId, auth.householdId],
        );
        const pet = rows[0];

        if (!pet) {
          results.push({ ids: [petId], status: 'ERROR', errorCode: 'deviceNotFound' });
          continue;
        }
        if (!pet.device_id) {
          // Pet exists but no feeder assigned — report as offline so Google
          // tells the user "Felix's feeder is offline" rather than a generic error.
          results.push({ ids: [petId], status: 'ERROR', errorCode: 'deviceOffline' });
          continue;
        }

        const weightG = feedType === 'snack' ? pet.snack_weight_g : pet.meal_weight_g;
        if (!weightG || weightG <= 0) {
          // Feed weights haven't been configured in the app yet.
          results.push({ ids: [petId], status: 'ERROR', errorCode: 'notConfigured' });
          continue;
        }

        try {
          await createDispense({
            petId:       pet.id,
            deviceId:    pet.device_id,
            weightG,
            triggerType: 'voice',
          });
          results.push({
            ids:    [petId],
            status: 'SUCCESS',
            states: { online: true, currentDispenseItems: [] },
          });
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code;
          results.push({
            ids:       [petId],
            status:    'ERROR',
            errorCode: code === 'FEED_IN_PROGRESS' ? 'alreadyInUse' : 'transientError',
          });
        }
      }
    }

    return res.json({ requestId, payload: { commands: results } });
  }

  // ── DISCONNECT ──────────────────────────────────────────────────────────────
  // User unlinked Servl from Google Home. Revoke all their OAuth refresh tokens
  // so the access tokens stop being renewable. The JWT access tokens already
  // issued will expire on their own (1h) — we don't need to track them.
  if (intent === 'action.devices.DISCONNECT') {
    await db.query(
      'DELETE FROM oauth_refresh_tokens WHERE user_id = $1',
      [auth.userId],
    );
    return res.json({});
  }

  return res.status(400).json({ error: 'unknown_intent' });
});
