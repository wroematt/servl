import 'express-async-errors';
import { Router, Request, Response } from 'express';
import { verifyGoogleHmac } from '../lib/hmac';
import { db } from '../lib/db';
import { createDispense } from '../lib/dispense';
import { config } from '../config';

export const webhookRouter = Router();

// Registered with express.raw() in index.ts — req.body is a Buffer
webhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const rawBody = req.body as Buffer;

  if (!verifyGoogleHmac(config.GOOGLE_HOME_HMAC_SECRET, rawBody, signature)) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid signature' });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid JSON' });
  }

  // Extract pet name from Google Actions fulfillment request
  const petName =
    payload?.inputs?.[0]?.arguments?.find((a: any) => a.name === 'pet_name')?.rawText ||
    payload?.queryResult?.parameters?.pet_name ||
    payload?.pet_name;

  if (!petName) {
    return res.json({ fulfillmentText: "I couldn't identify which pet to feed. Please say the pet's name." });
  }

  const result = await db.query(
    `SELECT id, device_id, meal_weight_g
     FROM pets
     WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL AND device_id IS NOT NULL
     LIMIT 1`,
    [petName],
  );

  if (!result.rows[0]) {
    return res.json({ fulfillmentText: `I couldn't find a pet named ${petName}.` });
  }

  const pet = result.rows[0];
  try {
    await createDispense({
      petId: pet.id,
      deviceId: pet.device_id,
      weightG: pet.meal_weight_g,
      triggerType: 'voice',
    });
  } catch {
    return res.json({ fulfillmentText: `Failed to feed ${petName}. Please try again.` });
  }

  return res.json({ fulfillmentText: `Feeding ${petName} now.` });
});
