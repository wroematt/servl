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
  // Service account credentials for Home Graph "Report State" pushes — see
  // lib/homegraph.ts. Both optional; leave unset to disable Report State
  // (SYNC/QUERY/EXECUTE work without it).
  HOMEGRAPH_CLIENT_EMAIL: z.string().optional(),
  HOMEGRAPH_PRIVATE_KEY: z.string().optional(),
});

export const config = schema.parse(process.env);
