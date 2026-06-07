-- Guarantee at most one 'pending' feed_event per pet at a time.
--
-- The API checks for an existing pending feed before creating a new one, but
-- only a DB constraint can close the race between two near-simultaneous
-- dispense requests (e.g. a user double-tapping Meal, or a manual feed and a
-- scheduled feed firing together). feed-service catches the resulting unique
-- violation (Postgres error 23505) and returns a friendly 409 FEED_IN_PROGRESS.
--
-- This also backstops the website/app's "disable Meal/Snack while a feed is
-- pending" UI — even if a stale client slips a request through, the database
-- itself refuses to create a second concurrent dispense for the same pet.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_events_one_pending_per_pet
  ON feed_events (pet_id)
  WHERE status = 'pending';
