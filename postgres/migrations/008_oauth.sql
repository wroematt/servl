-- OAuth 2.0 account-linking tables for the Google Home integration.
-- Users link their Servl account to Google Home once via the authorize flow;
-- after that, voice commands work automatically with no per-pet setup required.

-- Short-lived, single-use authorization codes. Google exchanges these for
-- access + refresh tokens within seconds of receiving them, so a 10-minute
-- window is generous. The code itself is stored as a SHA-256 hash (same
-- pattern as refresh_tokens) so a DB breach doesn't expose live codes.
CREATE TABLE oauth_codes (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_hash    TEXT        NOT NULL UNIQUE,
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ             -- NULL = unused; set atomically when consumed
);

CREATE INDEX idx_oauth_codes_user ON oauth_codes(user_id);

-- Long-lived OAuth refresh tokens issued to Google Home. Stored separately
-- from the session refresh_tokens table (30-day session tokens) because these
-- are held by Google indefinitely and rotated on every access-token refresh —
-- a different lifetime and usage pattern. Rotated on every use (same as session
-- tokens) so a stolen token can only be replayed once before being invalidated.
CREATE TABLE oauth_refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '180 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oauth_refresh_tokens_user ON oauth_refresh_tokens(user_id);
