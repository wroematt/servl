import 'express-async-errors';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/error';

const app = express();

app.use(helmet());

// NOTE: Do NOT add express.json() here. The gateway only forwards requests —
// parsing the body would consume the readable stream before http-proxy-middleware
// can pipe it to the upstream service. Body parsing happens in each microservice.

// ── Rate limiters ─────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { code: 'RATE_LIMITED', message: 'Too many requests' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { code: 'RATE_LIMITED', message: 'Too many requests' },
});

// ── Service URLs ──────────────────────────────

const {
  USER_SERVICE_URL    = 'http://user-service:3001',
  PET_SERVICE_URL     = 'http://pet-service:3002',
  DEVICE_SERVICE_URL  = 'http://device-service:3003',
  FEED_SERVICE_URL    = 'http://feed-service:3005',
} = process.env;

// ── Path rewrite helper ───────────────────────
// Express strips the matched prefix from req.url before passing it to
// middleware. We must add the prefix back so upstream services receive the
// full path (e.g. /auth/register, not just /register).
function rewritePath(prefix: string) {
  return (path: string) => prefix + (path === '/' ? '' : path);
}

// ── Headers helper ────────────────────────────
function setUserHeaders(proxyReq: any, req: any) {
  proxyReq.setHeader('x-user-id',       req.user.sub);
  proxyReq.setHeader('x-household-id',  req.user.household_id);
  proxyReq.setHeader('x-user-role',     req.user.role);
}

// ── Public routes (no auth) ───────────────────

// Auth endpoints — stricter rate limit
app.use('/auth', authLimiter, createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/auth'),
}));

// Household join — no JWT needed (invite flow)
app.use('/users/household/join', createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/users/household/join'),
}));

// Google Home webhook — authenticated via HMAC, not JWT
app.use('/webhook/google-home', createProxyMiddleware({
  target: FEED_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/webhook/google-home'),
}));

// ── Authenticated routes ──────────────────────

app.use('/users', apiLimiter, requireAuth, createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/users'),
  on: { proxyReq: setUserHeaders },
}));

app.use('/pets', apiLimiter, requireAuth, createProxyMiddleware({
  target: PET_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/pets'),
  on: { proxyReq: setUserHeaders },
}));

app.use('/feed', apiLimiter, requireAuth, createProxyMiddleware({
  target: FEED_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/feed'),
  on: { proxyReq: setUserHeaders },
}));

app.use('/schedules', apiLimiter, requireAuth, createProxyMiddleware({
  target: PET_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/schedules'),
  on: { proxyReq: setUserHeaders },
}));

app.use('/devices', apiLimiter, requireAuth, createProxyMiddleware({
  target: DEVICE_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/devices'),
  on: { proxyReq: setUserHeaders },
}));

// ── Health check ──────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`api-gateway listening on :${PORT}`));
