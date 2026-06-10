import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/error';

const app = express();

// Trust the first proxy (Cloudflare Tunnel) so express-rate-limit can
// correctly identify clients from the X-Forwarded-For header.
app.set('trust proxy', 1);

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
        // Pass `false` (not an Error) for disallowed origins. An Error here
        // makes the cors middleware call next(err), which aborts the WHOLE
        // request before it reaches the route handler — breaking non-fetch
        // requests (form POSTs, redirects, webviews) that carry an Origin
        // header the browser doesn't actually need a CORS response for.
        // `false` just omits Access-Control-Allow-Origin, so disallowed
        // browser fetch/XHR is still correctly blocked client-side, while
        // everything else (e.g. the OAuth login form, which Google's webview
        // submits with "Origin: null") proceeds normally.
        callback(null, false);
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

// OAuth 2.0 account-linking endpoints (Google Home).
// Public — auth handled inside user-service (login form / token endpoint).
// Uses the same auth rate limiter as /auth to cover the login form POST.
app.use('/oauth', authLimiter, createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/oauth'),
}));

// Google Home Smart Home API webhook — authenticated via OAuth JWT Bearer.
// Public (no gateway auth middleware) — feed-service verifies the JWT itself.
// No rate limiter: Google's Home Graph sends frequent SYNC/QUERY calls and
// spurious 429s would break device state updates.
app.use('/webhook/smarthome', createProxyMiddleware({
  target: FEED_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/webhook/smarthome'),
}));

// Legacy Google Home webhook — authenticated via HMAC or static Bearer token
app.use('/webhook/google-home', createProxyMiddleware({
  target: FEED_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/webhook/google-home'),
}));

// Firmware binary download — no JWT required; the firmware UUID in the URL
// acts as an unguessable token. Must be registered before the authenticated
// /devices block below so the ESP32 can reach it without a Bearer token.
app.use('/devices/firmware', createProxyMiddleware({
  target: DEVICE_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: rewritePath('/devices/firmware'),
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
