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
  // The private_key field from the downloaded service-account JSON contains
  // literal "\n" escapes; .env files don't interpret those, so they arrive
  // here as literal backslash-n. jwt.sign() needs a real PEM with actual
  // line breaks, so convert them.
  HOMEGRAPH_PRIVATE_KEY: z.string().optional().transform((v) => v?.replace(/\\n/g, '\n')),
});

export const config = schema.parse(process.env);
