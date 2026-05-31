-- ── 002_add_timezone ────────────────────────────────────────────────────────
-- Add IANA timezone to households so the schedule worker can evaluate cron
-- expressions in the correct local time rather than UTC.
--
-- Default is 'UTC' so existing households keep their current (UTC) behaviour
-- until a new device is provisioned and the Android app sends its timezone.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE households ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
