import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3003').transform(Number),
  DATABASE_URL: z.string(),
  MQTT_BROKER_URL: z.string(),
  MQTT_INTERNAL_USER: z.string(),
  MQTT_INTERNAL_PASS: z.string(),
  NOTIFICATION_SERVICE_URL: z.string().optional(),
});

export const config = schema.parse(process.env);
