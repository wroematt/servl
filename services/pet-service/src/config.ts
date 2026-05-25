import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3002').transform(Number),
  DATABASE_URL: z.string(),
  MEDIA_UPLOAD_PATH: z.string().default('/uploads'),
});

export const config = schema.parse(process.env);
