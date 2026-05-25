import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3005').transform(Number),
  DATABASE_URL: z.string(),
  DEVICE_SERVICE_URL: z.string(),
  GOOGLE_HOME_HMAC_SECRET: z.string(),
});

export const config = schema.parse(process.env);
