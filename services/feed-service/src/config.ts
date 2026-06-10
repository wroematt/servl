import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3005').transform(Number),
  DATABASE_URL: z.string(),
  DEVICE_SERVICE_URL: z.string(),
  GOOGLE_HOME_HMAC_SECRET: z.string(),
  // JWT_SECRET is used to verify OAuth access tokens that Google sends on
  // every voice command. Same secret as user-service — the feed-service webhook
  // verifies these locally without calling user-service.
  JWT_SECRET: z.string().min(32),
});

export const config = schema.parse(process.env);
