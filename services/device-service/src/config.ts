import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3003').transform(Number),
  DATABASE_URL: z.string(),
  MQTT_BROKER_URL: z.string(),
  MQTT_INTERNAL_USER: z.string(),
  MQTT_INTERNAL_PASS: z.string(),
  NOTIFICATION_SERVICE_URL: z.string().optional(),
  // Base URL that ESP32 devices (on the user's home LAN) can reach to download
  // firmware binaries. The backend now runs on an Oracle Cloud server — not on
  // the same LAN as the devices — so in production this must be a publicly
  // reachable URL (e.g. the domain behind Cloudflare Tunnel / nginx), not a
  // LAN IP. Example: https://api.servl.uk
  OTA_BASE_URL: z.string().default('http://localhost:3000'),
  // Secret used to sign short-lived OTA download tokens (HMAC-SHA256).
  // Defaults to MQTT_INTERNAL_PASS so no new secret is needed for existing installs.
  OTA_SECRET: z.string().optional(),
});

export const config = schema.parse(process.env);
