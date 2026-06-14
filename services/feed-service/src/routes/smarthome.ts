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
import { buildDeviceState } from '../lib/devicestate';
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
// The Dispense trait exposes a single item, "biscuits", in grams — this lets
// users ask for a custom amount ("give Felix 30 grams of biscuits"). The
// meal/snack portions configured in the app are exposed as dispense presets,
// so "give Felix a meal" / "give Felix a snack" map to pets.meal_weight_g /
// pets.snack_weight_g without the user specifying an amount.
//
// willReportState is true — see lib/homegraph.ts and /internal/report-state,
// which push state changes (hopper level, online/offline) outside of QUERY.
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
  const biscuitSynonyms =
    pet.type === 'cat' ? ['biscuits', 'food', 'cat food', 'kibble', 'dry food'] :
    pet.type === 'dog' ? ['biscuits', 'food', 'dog food', 'kibble', 'dry food'] :
                         ['biscuits', 'food', 'pet food', 'kibble', 'dry food'];

  return {
    id: pet.id,
    type: 'action.devices.types.PETFEEDER',
    traits: ['action.devices.traits.Dispense'],
    name: {
      defaultNames: ['Servl Feeder'],
      name: pet.name,
      nicknames: [pet.name, `${pet.name}'s feeder`, `${pet.name} feeder`],
    },
    willReportState: true,
    deviceInfo: {
      manufacturer: 'Servl',
      model: 'Smart Pet Feeder',
      swVersion: '1.0',
    },
    attributes: {
      supportedDispenseItems: [
        {
          item_name: 'biscuits',
          item_name_synonyms: [{ lang: 'en', synonyms: biscuitSynonyms }],
          supported_units: ['GRAMS'],
          default_portion: { amount: pet.meal_weight_g, unit: 'GRAMS' },
        },
      ],
      supportedDispensePresets: [
        {
          preset_name: 'meal',
          preset_name_synonyms: [{ lang: 'en', synonyms: ['meal', 'meals'] }],
        },
        {
          preset_name: 'snack',
          preset_name_synonyms: [
            { lang: 'en', synonyms: ['snack', 'treat', 'snacks', 'treats'] },
          ],
        },
      ],
    },
  };
}

// ── Scene devices (Feed Meal / Feed Snack buttons) ──────────────────────────
// Alongside each pet's PETFEEDER device, expose two SCENE devices so the
// Google Home app shows tappable "Feed Meal" / "Feed Snack" buttons (Scene
// devices render as a single-tap button; PETFEEDER alone gives no UI
// control). sceneReversible: false marks these as one-shot triggers with no
// on/off state — ActivateScene just dispatches the same createDispense() path
// as the voice presets, using the pet's configured meal/snack weight.
//
// Device IDs are derived from the pet's UUID with a suffix
// (`${petId}-meal-scene` / `${petId}-snack-scene`) so EXECUTE/QUERY can route
// back to the pet without a separate lookup table.
const SCENE_SUFFIXES = { meal: '-meal-scene', snack: '-snack-scene' } as const;
type ScenePreset = keyof typeof SCENE_SUFFIXES;

function parseSceneDeviceId(id: string): { petId: string; preset: ScenePreset } | null {
  for (const preset of Object.keys(SCENE_SUFFIXES) as ScenePreset[]) {
    const suffix = SCENE_SUFFIXES[preset];
    if (id.endsWith(suffix)) {
      return { petId: id.slice(0, -suffix.length), preset };
    }
  }
  return null;
}

function buildSceneDevice(pet: PetRow, preset: ScenePreset) {
  const label = preset === 'meal' ? 'Meal' : 'Snack';
  return {
    id: `${pet.id}${SCENE_SUFFIXES[preset]}`,
    type: 'action.devices.types.SCENE',
    traits: ['action.devices.traits.Scene'],
    name: {
      defaultNames: [`Feed ${pet.name} a ${preset}`],
      name: `${pet.name} ${label}`,
      nicknames: [`Feed ${pet.name} a ${preset}`, `${pet.name} ${label}`],
    },
    // Google's official SCENE example sets this to true even for
    // non-reversible scenes — the Cloud-to-cloud Test Suite's OnlineOffline
    // check relies on it (willReportState: false causes that check to time
    // out waiting for a state push that will never come).
    willReportState: true,
    // Scenes have no room-assignment UI in the Google Home app — per Google's
    // docs, a scene only becomes part of the household if the providing
    // service assigns its room via roomHint in SYNC. Without this, the scene
    // stays unassigned ("unknown" in the app) and Home Graph doesn't treat it
    // as fully set up, which also breaks the OnlineOffline check.
    roomHint: 'Kitchen',
    deviceInfo: {
      manufacturer: 'Servl',
      model: 'Smart Pet Feeder',
      swVersion: '1.0',
    },
    attributes: {
      sceneReversible: false,
    },
  };
}

// ── Webhook handler ───────────────────────────────────────────────────────────
smarthomeRouter.post('/', async (req: Request, res: Response) => {
  const auth = verifyToken(req);
  if (!auth) {
    console.warn('[smarthome] rejected request: missing or invalid Bearer token');
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
  console.log(`[smarthome] ${intent} requestId=${requestId} household=${auth.householdId}`);

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

    const devices = rows.flatMap((pet) => [
      buildDevice(pet),
      buildSceneDevice(pet, 'meal'),
      buildSceneDevice(pet, 'snack'),
    ]);

    return res.json({
      requestId,
      payload: {
        agentUserId: auth.userId,
        devices,
      },
    });
  }

  // ── QUERY ───────────────────────────────────────────────────────────────────
  // Google asks "is this device online?" before executing a command.
  // A pet is online only if it has a feeder assigned AND that feeder's last
  // MQTT status/LWT marked it 'online' — mirrors what the app shows for the device.
  if (intent === 'action.devices.QUERY') {
    const qPayload = payload as { devices: Array<{ id: string }> };
    const allIds = (qPayload?.devices ?? []).map((d) => d.id);

    // Scene devices (Feed Meal / Feed Snack buttons) aren't PETFEEDER rows
    // themselves, but their online status mirrors the feeder they dispatch
    // to — if the feeder is offline, tapping "Feed Meal" can't do anything
    // either. Resolve each scene device back to its underlying pet so the
    // single query below covers both.
    const sceneIds: string[] = [];
    const petIds: string[] = [];
    const scenePetIds = new Set<string>();
    for (const id of allIds) {
      const scene = parseSceneDeviceId(id);
      if (scene) {
        sceneIds.push(id);
        scenePetIds.add(scene.petId);
      } else {
        petIds.push(id);
      }
    }

    const lookupIds = Array.from(new Set([...petIds, ...scenePetIds]));

    const { rows } = await db.query<{
      id: string;
      device_status: string | null;
      hopper_pct: number | null;
      last_dispensed_g: number | null;
    }>(
      `SELECT p.id, d.status AS device_status, d.hopper_pct,
              -- NULLIF(..., 0): the hopper load cell isn't wired yet (TaskList #11), so
              -- firmware reports dispensed_g=0 on every confirmed feed. Treat that as
              -- "unmeasured" and fall back to the requested weight, same as NULL.
              (SELECT COALESCE(NULLIF(fe.weight_dispensed_g, 0), fe.weight_requested_g)
               FROM   feed_events fe
               WHERE  fe.pet_id = p.id
               ORDER BY fe.dispensed_at DESC
               LIMIT 1) AS last_dispensed_g
       FROM   pets p
       LEFT JOIN devices d ON d.id = p.device_id
       WHERE  p.id = ANY($1::uuid[])
         AND  p.household_id = $2
         AND  p.deleted_at IS NULL`,
      [lookupIds, auth.householdId],
    );

    const states: Record<string, unknown> = {};
    for (const petId of petIds) {
      const pet = rows.find((r) => r.id === petId);
      states[petId] = {
        status: 'SUCCESS',
        ...buildDeviceState(
          pet?.device_status === 'online',
          pet?.hopper_pct ?? null,
          pet?.last_dispensed_g ?? undefined,
        ),
      };
    }
    for (const sceneId of sceneIds) {
      const scene = parseSceneDeviceId(sceneId)!;
      const pet = rows.find((r) => r.id === scene.petId);
      states[sceneId] = { status: 'SUCCESS', online: pet?.device_status === 'online' };
    }

    console.log(`[smarthome] QUERY requestId=${requestId} ids=${JSON.stringify(allIds)} states=${JSON.stringify(states)}`);
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
          params:  { item?: string; amount?: number; unit?: string; presetName?: string };
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

      // ── ActivateScene (Feed Meal / Feed Snack buttons) ──────────────────
      if (exec.command === 'action.devices.commands.ActivateScene') {
        for (const id of petIds) {
          const scene = parseSceneDeviceId(id);
          if (!scene) {
            results.push({ ids: [id], status: 'ERROR', errorCode: 'deviceNotFound' });
            continue;
          }

          const { rows } = await db.query<PetRow>(
            `SELECT id, name, type, device_id, meal_weight_g, snack_weight_g
             FROM   pets
             WHERE  id = $1
               AND  household_id = $2
               AND  deleted_at IS NULL`,
            [scene.petId, auth.householdId],
          );
          const pet = rows[0];

          if (!pet) {
            results.push({ ids: [id], status: 'ERROR', errorCode: 'deviceNotFound' });
            continue;
          }
          if (!pet.device_id) {
            results.push({ ids: [id], status: 'ERROR', errorCode: 'deviceOffline' });
            continue;
          }

          const weightG = scene.preset === 'snack' ? pet.snack_weight_g : pet.meal_weight_g;
          if (!weightG || weightG <= 0) {
            // 'notConfigured' isn't a code Google recognizes — it falls back to a
            // generic "unable to interact with your physical appliances" message.
            // actionNotAvailable maps to "Sorry, I can't seem to do that right now."
            results.push({ ids: [id], status: 'ERROR', errorCode: 'actionNotAvailable' });
            continue;
          }

          try {
            await createDispense({
              petId:       pet.id,
              deviceId:    pet.device_id,
              weightG,
              triggerType: 'voice',
            });
            results.push({ ids: [id], status: 'SUCCESS', states: { online: true } });
          } catch (err: unknown) {
            const code = (err as { code?: string })?.code;
            results.push({
              ids:       [id],
              status:    'ERROR',
              errorCode: code === 'FEED_IN_PROGRESS' ? 'alreadyInUse' : 'transientError',
            });
          }
        }
        continue;
      }

      if (exec.command !== 'action.devices.commands.Dispense') {
        results.push({ ids: petIds, status: 'ERROR', errorCode: 'notSupported' });
        continue;
      }

      // Either a preset ("give Felix a meal/snack" → supportedDispensePresets)
      // or a custom amount in grams of the "biscuits" item
      // ("give Felix 30 grams of biscuits" → supportedDispenseItems). No params
      // at all ("feed Felix") defaults to the meal preset.
      const { presetName, item, amount, unit } = exec.params;
      let presetType: 'meal' | 'snack' | null = null;
      let customWeightG: number | null = null;

      if (presetName) {
        const preset = presetName.toLowerCase();
        if (preset !== 'meal' && preset !== 'snack') {
          results.push({ ids: petIds, status: 'ERROR', errorCode: 'notSupported' });
          continue;
        }
        presetType = preset;
      } else if (item != null || amount != null) {
        if (
          (item ?? 'biscuits').toLowerCase() !== 'biscuits' ||
          unit !== 'GRAMS' ||
          !Number.isFinite(amount) ||
          (amount as number) < 1 ||
          (amount as number) > 500
        ) {
          results.push({ ids: petIds, status: 'ERROR', errorCode: 'notSupported' });
          continue;
        }
        customWeightG = Math.round(amount as number);
      } else {
        presetType = 'meal';
      }

      for (const petId of petIds) {
        // Look up the pet — enforce household scoping so one user cannot trigger
        // another household's feeder by guessing a pet UUID.
        const { rows } = await db.query<PetRow & { device_status: string | null; hopper_pct: number | null }>(
          `SELECT p.id, p.name, p.device_id, p.meal_weight_g, p.snack_weight_g, p.type,
                  d.status AS device_status, d.hopper_pct
           FROM   pets p
           LEFT JOIN devices d ON d.id = p.device_id
           WHERE  p.id = $1
             AND  p.household_id = $2
             AND  p.deleted_at IS NULL`,
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

        const weightG = customWeightG ?? (presetType === 'snack' ? pet.snack_weight_g : pet.meal_weight_g);
        if (!weightG || weightG <= 0) {
          // Feed weights haven't been configured in the app yet. 'notConfigured'
          // isn't a code Google recognizes — it falls back to a generic "unable
          // to interact with your physical appliances" message. actionNotAvailable
          // maps to "Sorry, I can't seem to do that right now."
          results.push({ ids: [petId], status: 'ERROR', errorCode: 'actionNotAvailable' });
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
            states: buildDeviceState(true, pet.hopper_pct, weightG),
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

    console.log(`[smarthome] EXECUTE results requestId=${requestId}`, JSON.stringify(results));
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
