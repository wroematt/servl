-- ─────────────────────────────────────────────
--  Migration 002 — Google Sign-In support
--  Adds google_id column and makes password_hash
--  nullable so Google-only accounts are supported.
-- ─────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
