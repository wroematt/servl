// OAuth 2.0 endpoints for Google Home account linking.
//
// Flow:
//   1. Google redirects the user to GET /oauth/authorize with ?response_type=code
//      &client_id=...&redirect_uri=...&state=...
//   2. We serve a branded login form.
//   3. User submits their Servl email + password via POST /oauth/authorize.
//   4. We validate credentials, generate a short-lived auth code, and redirect
//      back to Google's redirect_uri with ?code=...&state=...
//   5. Google POSTs to /oauth/token to exchange the code for access + refresh tokens.
//   6. Google calls /oauth/token again periodically with grant_type=refresh_token
//      to issue a new access token when the old one expires.
//
// The access token is a standard Servl JWT (same format the API gateway issues),
// so the feed-service webhook can verify it without calling user-service.

import 'express-async-errors';
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db } from '../lib/db';
import { hashToken } from '../lib/tokens';
import { config } from '../config';

export const oauthRouter = Router();

// Google's OAuth redirect domains — we only redirect to these to prevent
// open-redirect attacks. The path after the prefix is Google's project ID,
// which changes per Actions project, so we match on prefix rather than exact URL.
const GOOGLE_REDIRECT_PREFIXES = [
  'https://oauth-redirect.googleusercontent.com/',
  'https://oauth-redirect-sandbox.googleusercontent.com/',
];

function isGoogleRedirectUri(uri: string): boolean {
  return GOOGLE_REDIRECT_PREFIXES.some((p) => uri.startsWith(p));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Branded Servl login page served during the account-linking flow.
// Self-contained HTML — no external dependencies, no build step required.
// Brand colours: olive #909C75, tan background #f5f4f0.
function renderLoginPage(params: {
  state:       string;
  redirectUri: string;
  clientId:    string;
  error?:      string;
}): string {
  const { state, redirectUri, clientId, error } = params;
  const errorHtml = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Link your Servl account</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f4f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
    .card{background:#fff;border-radius:12px;padding:40px;width:100%;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .logo{display:flex;align-items:center;gap:10px;margin-bottom:24px}
    .mark{width:36px;height:36px;background:#909C75;border-radius:8px;flex-shrink:0}
    .brand{font-size:22px;font-weight:700;color:#2a2a2a;letter-spacing:-.5px}
    h1{font-size:18px;font-weight:600;color:#2a2a2a;margin-bottom:6px}
    .sub{font-size:14px;color:#666;margin-bottom:28px;line-height:1.5}
    .error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:20px}
    .field{margin-bottom:16px}
    label{display:block;font-size:13px;font-weight:500;color:#444;margin-bottom:6px}
    input[type=email],input[type=password]{width:100%;padding:10px 14px;border:1.5px solid #e0dfd8;border-radius:8px;font-size:15px;outline:none;background:#fafaf8;transition:border-color .15s}
    input:focus{border-color:#909C75;background:#fff}
    button{width:100%;padding:12px;background:#909C75;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:8px;transition:background .15s}
    button:hover{background:#7a8762}
    .footer{font-size:12px;color:#999;text-align:center;margin-top:24px;line-height:1.5}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo"><div class="mark"></div><span class="brand">servl</span></div>
    <h1>Link to Google Home</h1>
    <p class="sub">Sign in with your Servl account to enable voice&#8209;controlled feeding through Google Home.</p>
    ${errorHtml}
    <form method="POST">
      <input type="hidden" name="state"        value="${escapeHtml(state)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      <input type="hidden" name="client_id"    value="${escapeHtml(clientId)}">
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autocomplete="email" placeholder="you@example.com">
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Your Servl password">
      </div>
      <button type="submit">Link Account</button>
    </form>
    <p class="footer">Linking allows Google Home to trigger feeder commands on your behalf.</p>
  </div>
</body>
</html>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// OAuth access tokens last 1 hour — longer than the 15-minute session JWTs
// because Google caches them and refreshes proactively, not on every command.
// Same payload format so the feed-service webhook can verify them without
// calling user-service.
function issueOauthAccessToken(userId: string, householdId: string, role: string): string {
  return jwt.sign(
    { sub: userId, household_id: householdId, role },
    config.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

async function issueOauthRefreshToken(userId: string): Promise<string> {
  const token    = crypto.randomBytes(32).toString('hex');
  const hash     = hashToken(token);
  await db.query(
    `INSERT INTO oauth_refresh_tokens (user_id, token_hash)
     VALUES ($1, $2)`,
    [userId, hash],
  );
  return token;
}

function notConfigured(res: Response) {
  return res.status(503).json({
    error: 'temporarily_unavailable',
    error_description: 'Google Home integration is not configured on this server',
  });
}

// ── GET /oauth/authorize ──────────────────────────────────────────────────────
// Google redirects the user here to start the account-linking flow.
oauthRouter.get('/authorize', (req: Request, res: Response) => {
  if (!config.GOOGLE_HOME_OAUTH_CLIENT_ID) return notConfigured(res);

  const { response_type, client_id, redirect_uri, state } = req.query as Record<string, string>;

  if (response_type !== 'code') {
    return res.status(400).send('Unsupported response_type — expected: code');
  }
  if (client_id !== config.GOOGLE_HOME_OAUTH_CLIENT_ID) {
    return res.status(400).send('Unknown client_id');
  }
  if (!redirect_uri || !isGoogleRedirectUri(redirect_uri)) {
    return res.status(400).send('Invalid redirect_uri');
  }

  return res.type('html').send(renderLoginPage({
    state:       state ?? '',
    redirectUri: redirect_uri,
    clientId:    client_id,
  }));
});

// ── POST /oauth/authorize ─────────────────────────────────────────────────────
// Handles the login form submission. Validates Servl credentials, generates a
// one-time auth code, and redirects to Google with ?code=...&state=...
oauthRouter.post('/authorize', async (req: Request, res: Response) => {
  if (!config.GOOGLE_HOME_OAUTH_CLIENT_ID) return notConfigured(res);

  const { email, password, state, redirect_uri, client_id } = req.body as Record<string, string>;

  // Re-validate the OAuth params that came from the hidden form fields —
  // a tampered form could supply a different redirect_uri.
  if (
    client_id !== config.GOOGLE_HOME_OAUTH_CLIENT_ID ||
    !redirect_uri ||
    !isGoogleRedirectUri(redirect_uri)
  ) {
    return res.status(400).send('Invalid OAuth parameters');
  }

  const rerender = (error: string) =>
    res.type('html').send(renderLoginPage({
      state:       state ?? '',
      redirectUri: redirect_uri,
      clientId:    client_id,
      error,
    }));

  if (!email || !password) return rerender('Email and password are required.');

  const result = await db.query(
    `SELECT id, household_id, role, password_hash
     FROM   users
     WHERE  email = $1`,
    [email.toLowerCase().trim()],
  );
  const user = result.rows[0];

  // Intentionally vague message — don't reveal whether the email exists.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return rerender('Incorrect email or password.');
  }

  // Single-use auth code — store the hash, hand out the plaintext.
  const code     = crypto.randomBytes(32).toString('hex');
  const codeHash = hashToken(code);
  await db.query(
    `INSERT INTO oauth_codes (code_hash, user_id, redirect_uri, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
    [codeHash, user.id, redirect_uri],
  );

  const dest = new URL(redirect_uri);
  dest.searchParams.set('code', code);
  if (state) dest.searchParams.set('state', state);
  return res.redirect(302, dest.toString());
});

// ── POST /oauth/token ─────────────────────────────────────────────────────────
// Token endpoint — handles both grant types Google uses.
// Request body is application/x-www-form-urlencoded (Google requirement).
oauthRouter.post('/token', async (req: Request, res: Response) => {
  if (!config.GOOGLE_HOME_OAUTH_CLIENT_ID) return notConfigured(res);

  const { grant_type, code, refresh_token, client_id, client_secret, redirect_uri } =
    req.body as Record<string, string>;

  // Authenticate the OAuth client (Google sends credentials in the POST body).
  if (
    client_id     !== config.GOOGLE_HOME_OAUTH_CLIENT_ID ||
    client_secret !== config.GOOGLE_HOME_OAUTH_CLIENT_SECRET
  ) {
    return res.status(401).json({ error: 'invalid_client' });
  }

  // ── grant_type: authorization_code ─────────────────────────────────────────
  if (grant_type === 'authorization_code') {
    if (!code) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing code' });
    }

    const codeHash = hashToken(code);
    const codeResult = await db.query(
      `SELECT id, user_id, redirect_uri, expires_at, used_at
       FROM   oauth_codes
       WHERE  code_hash = $1`,
      [codeHash],
    );
    const row = codeResult.rows[0];

    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Code is invalid, expired, or already used',
      });
    }
    if (redirect_uri && row.redirect_uri !== redirect_uri) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'redirect_uri mismatch',
      });
    }

    // Mark used immediately — prevents replay even under concurrent requests.
    await db.query('UPDATE oauth_codes SET used_at = NOW() WHERE id = $1', [row.id]);

    const userResult = await db.query(
      'SELECT id, household_id, role FROM users WHERE id = $1',
      [row.user_id],
    );
    const user = userResult.rows[0];
    if (!user) return res.status(400).json({ error: 'invalid_grant' });

    const accessToken  = issueOauthAccessToken(user.id, user.household_id, user.role);
    const refreshToken = await issueOauthRefreshToken(user.id);

    return res.json({
      access_token:  accessToken,
      token_type:    'Bearer',
      expires_in:    3600,
      refresh_token: refreshToken,
    });
  }

  // ── grant_type: refresh_token ───────────────────────────────────────────────
  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing refresh_token' });
    }

    const tokenHash   = hashToken(refresh_token);
    const tokenResult = await db.query(
      `SELECT ort.id, ort.user_id, ort.expires_at, u.household_id, u.role
       FROM   oauth_refresh_tokens ort
       JOIN   users u ON u.id = ort.user_id
       WHERE  ort.token_hash = $1`,
      [tokenHash],
    );
    const row = tokenResult.rows[0];

    if (!row || new Date(row.expires_at) < new Date()) {
      if (row) await db.query('DELETE FROM oauth_refresh_tokens WHERE id = $1', [row.id]);
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Refresh token is invalid or expired',
      });
    }

    // Rotate — delete the used token and issue a new pair.
    await db.query('DELETE FROM oauth_refresh_tokens WHERE id = $1', [row.id]);
    const newAccess  = issueOauthAccessToken(row.user_id, row.household_id, row.role);
    const newRefresh = await issueOauthRefreshToken(row.user_id);

    return res.json({
      access_token:  newAccess,
      token_type:    'Bearer',
      expires_in:    3600,
      refresh_token: newRefresh,
    });
  }

  return res.status(400).json({ error: 'unsupported_grant_type' });
});
