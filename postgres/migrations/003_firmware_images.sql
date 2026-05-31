-- Migration 003: firmware image store
-- Stores the binary .bin files uploaded for OTA device updates.
-- Only one version is "latest" at any time — determined by MAX(uploaded_at).

CREATE TABLE IF NOT EXISTS firmware_images (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    version     TEXT        NOT NULL UNIQUE,
    filename    TEXT        NOT NULL,
    size_bytes  INTEGER     NOT NULL,
    sha256      TEXT        NOT NULL,
    data        BYTEA       NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by UUID        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS firmware_images_uploaded_at_idx ON firmware_images (uploaded_at DESC);
