import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3001').transform(Number),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  DOMAIN: z.string().default('localhost'),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.string().transform(Number),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  EMAIL_FROM: z.string(),
  INVITE_TOKEN_TTL: z.string().default('86400').transform(Number),
  RESET_TOKEN_TTL: z.string().default('3600').transform(Number),
  USER_MEDIA_UPLOAD_PATH: z.string().default('/user-uploads'),
  GOOGLE_CLIENT_ID: z.string(),
  // OAuth 2.0 credentials for the Google Home account-linking integration.
  // These are values YOU generate and provide to the Google Actions Console —
  // they are NOT from Google. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  GOOGLE_HOME_OAUTH_CLIENT_ID:     z.string().optional(),
  GOOGLE_HOME_OAUTH_CLIENT_SECRET: z.string().optional(),
});

export const config = schema.parse(process.env);
