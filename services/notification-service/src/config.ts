import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3004').transform(Number),
  DATABASE_URL: z.string(),
  FCM_PROJECT_ID: z.string(),
  FCM_CLIENT_EMAIL: z.string(),
  FCM_PRIVATE_KEY: z.string(),
});

export const config = schema.parse(process.env);
