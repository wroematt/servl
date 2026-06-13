import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3002').transform(Number),
  DATABASE_URL: z.string(),
  MEDIA_UPLOAD_PATH: z.string().default('/uploads'),
  // Used to notify Google Home (via feed-service's Home Graph requestSync)
  // when a pet is added or removed — see lib/homegraph.ts. Optional;
  // feed-service itself no-ops if Home Graph isn't configured.
  FEED_SERVICE_URL: z.string().optional(),
});

export const config = schema.parse(process.env);
