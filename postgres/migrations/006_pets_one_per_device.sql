-- Guarantee at most one (non-deleted) pet can be assigned to a given device
-- at a time.
--
-- POST /pets and PATCH /pets/:petId both accept a device_id with no check
-- that the device isn't already assigned elsewhere, which let the same
-- physical feeder be linked to multiple pets simultaneously — every dispense
-- for any of those pets then targets the one feeder, so feed history,
-- schedules and daily targets all become meaningless for that device.
--
-- The API now checks for an existing assignment before writing (see
-- services/pet-service/src/routes/pets.ts), but only a DB constraint can
-- close the race between two near-simultaneous assignment requests. The
-- service catches the resulting unique violation (Postgres error 23505) and
-- returns a friendly 409 DEVICE_ALREADY_ASSIGNED.
--
-- Mirrors the approach taken in 005_feed_events_one_pending_per_pet.sql.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pets_one_per_device
  ON pets (device_id)
  WHERE deleted_at IS NULL AND device_id IS NOT NULL;
