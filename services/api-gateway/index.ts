// ─────────────────────────────────────────────
//  API Gateway — main entry
//  Validates JWTs, enforces roles, proxies to
//  the correct downstream service.
// ─────────────────────────────────────────────

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth, requireOwner } from './middleware/auth';
import { errorHandler } from './middleware/error';

const app = express();

app.use(helmet());
app.use(express.json());

// ── Rate limiters ─────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 20,
  message: { code: 'RATE_LIMITED', message: 'Too many requests' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 120,
  message: { code: 'RATE_LIMITED', message: 'Too many requests' },
});

// ── Service URLs ──────────────────────────────

const {
  USER_SERVICE_URL,
  PET_SERVICE_URL,
  DEVICE_SERVICE_URL,
  NOTIFICATION_SERVICE_URL,
  FEED_SERVICE_URL,
} = process.env;

// ── Public routes (no auth) ───────────────────

app.use('/auth', authLimiter, createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
}));

// Household invite join (user has JWT but may not have household yet)
app.use('/users/household/join', requireAuth, createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
}));

// ── Authenticated routes ──────────────────────

app.use('/users', apiLimiter, requireAuth, createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  // Role check for owner-only actions happens inside user-service
  // Gateway passes x-user-role header; service enforces it.
  on: {
    proxyReq: (proxyReq, req: any) => {
      proxyReq.setHeader('x-user-id', req.user.sub);
      proxyReq.setHeader('x-household-id', req.user.household_id);
      proxyReq.setHeader('x-user-role', req.user.role);
    },
  },
}));

app.use('/pets', apiLimiter, requireAuth, createProxyMiddleware({
  target: PET_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req: any) => {
      proxyReq.setHeader('x-user-id', req.user.sub);
      proxyReq.setHeader('x-household-id', req.user.household_id);
      proxyReq.setHeader('x-user-role', req.user.role);
    },
  },
}));

app.use('/feed', apiLimiter, requireAuth, createProxyMiddleware({
  target: FEED_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req: any) => {
      proxyReq.setHeader('x-user-id', req.user.sub);
      proxyReq.setHeader('x-household-id', req.user.household_id);
      proxyReq.setHeader('x-user-role', req.user.role);
    },
  },
}));

app.use('/schedules', apiLimiter, requireAuth, createProxyMiddleware({
  target: PET_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req: any) => {
      proxyReq.setHeader('x-user-id', req.user.sub);
      proxyReq.setHeader('x-household-id', req.user.household_id);
      proxyReq.setHeader('x-user-role', req.user.role);
    },
  },
}));

app.use('/devices', apiLimiter, requireAuth, createProxyMiddleware({
  target: DEVICE_SERVICE_URL,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req: any) => {
      proxyReq.setHeader('x-user-id', req.user.sub);
      proxyReq.setHeader('x-household-id', req.user.household_id);
      proxyReq.setHeader('x-user-role', req.user.role);
    },
  },
}));

// Google Home webhook — authenticated via HMAC, not JWT
app.use('/webhook/google-home', createProxyMiddleware({
  target: FEED_SERVICE_URL,
  changeOrigin: true,
}));

// ── Health check ──────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`API gateway listening on :${PORT}`));
