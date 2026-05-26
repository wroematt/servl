import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/error';

const app = express();

app.use(helmet({
  // The gateway is intentionally cross-origin: the website (port 3006) loads
  // images and data from the API (port 3000). Helmet's default 'same-origin'
  // policy would cause the browser to block cross-origin <img> loads silently.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS ──────────────────────────────────────
// Allow the website origin (and any additional origins from CORS_ORIGIN env var).
// In production, set CORS_ORIGIN to the actual domain (e.g. https://app.servl.io).
const allowedOrigins = new Set([
  'http://localhost:3006',
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : []),
]);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  }),
);

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
  max: 300,   // 5 req/s average — a full dashboard load is ~8 requests
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
  proxyReq.setHeader('x-user-id',   req.user.sub);
  proxyReq.setHeader('x-user-role', req.user.role);
  // household_id is null for users who haven't joined a household yet
  if (req.user.household_id) {
    proxyReq.setHeader('x-household-id', req.user.household_id);
  }
}

// ── Public routes (no auth) ───────────────────

// Pet photo uploads — served by pet-service, no auth required
app.use('/uploads', createProxyMiddleware({
  target: PET_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/uploads'),
}));

// User profile photo uploads — served by user-service, no auth required
app.use('/user-uploads', createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/user-uploads'),
}));

// Auth endpoints — stricter rate limit
app.use('/auth', authLimiter, createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/auth'),
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
