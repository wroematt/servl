-- ─────────────────────────────────────────────
--  PetFeeder — initial schema migration
--  Run automatically by Postgres on first start
--  via docker-entrypoint-initdb.d
-- ─────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── households ──────────────────────────────
CREATE TABLE households (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── users ────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id  UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  photo_url     TEXT,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  fcm_token     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_household  ON users(household_id);
CREATE INDEX idx_users_email      ON users(email);

-- ── refresh_tokens ────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ── devices ──────────────────────────────────
CREATE TABLE devices (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id     UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  serial_number    TEXT NOT NULL UNIQUE,
  mqtt_client_id   TEXT NOT NULL UNIQUE,
  cert_fingerprint TEXT NOT NULL,
  hopper_pct       INT NOT NULL DEFAULT 100 CHECK (hopper_pct BETWEEN 0 AND 100),
  firmware_version TEXT,
  status           TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
  last_seen_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_household ON devices(household_id);
CREATE INDEX idx_devices_status    ON devices(household_id, status);

-- ── pets ─────────────────────────────────────
CREATE TABLE pets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id    UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  device_id       UUID REFERENCES devices(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('cat', 'dog')),
  photo_url       TEXT,
  meal_weight_g   INT NOT NULL DEFAULT 80  CHECK (meal_weight_g  BETWEEN 1 AND 500),
  snack_weight_g  INT NOT NULL DEFAULT 20  CHECK (snack_weight_g BETWEEN 1 AND 500),
  daily_target_g  INT NOT NULL DEFAULT 200 CHECK (daily_target_g BETWEEN 1 AND 2000),
  deleted_at      TIMESTAMPTZ,             -- soft delete
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pets_household ON pets(household_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pets_device    ON pets(device_id)    WHERE deleted_at IS NULL;

-- ── schedules ─────────────────────────────────
CREATE TABLE schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  label           TEXT,
  feed_type       TEXT NOT NULL CHECK (feed_type IN ('meal', 'snack', 'custom')),
  weight_g        INT  NOT NULL CHECK (weight_g BETWEEN 1 AND 500),
  cron_expression TEXT NOT NULL,           -- e.g. "0 7 * * *"
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_pet     ON schedules(pet_id);
CREATE INDEX idx_schedules_enabled ON schedules(enabled) WHERE enabled = TRUE;

-- ── feed_events ───────────────────────────────
CREATE TABLE feed_events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id              UUID REFERENCES pets(id) ON DELETE SET NULL,
  device_id           UUID REFERENCES devices(id) ON DELETE SET NULL,
  triggered_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  schedule_id         UUID REFERENCES schedules(id) ON DELETE SET NULL,
  weight_requested_g  INT NOT NULL,
  weight_dispensed_g  INT,                 -- filled in by device confirmation
  trigger_type        TEXT NOT NULL CHECK (trigger_type IN ('manual', 'schedule', 'voice', 'api')),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'failed', 'timeout')),
  dispensed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feed_events_pet      ON feed_events(pet_id, dispensed_at DESC);
CREATE INDEX idx_feed_events_device   ON feed_events(device_id, dispensed_at DESC);
CREATE INDEX idx_feed_events_date     ON feed_events(dispensed_at DESC);
CREATE INDEX idx_feed_events_status   ON feed_events(status) WHERE status = 'pending';

-- ── device_events (append-only log) ──────────
CREATE TABLE device_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id    UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,              -- 'error' | 'hopper_low' | 'hopper_refilled' | 'firmware_update' | 'reconnect'
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_events_device ON device_events(device_id, created_at DESC);

-- ── updated_at trigger (reusable) ─────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pets_updated_at
  BEFORE UPDATE ON pets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
