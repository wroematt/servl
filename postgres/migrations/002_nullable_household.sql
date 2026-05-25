-- Allow users to exist without a household.
-- Users register first, then create or join a household separately.
ALTER TABLE users ALTER COLUMN household_id DROP NOT NULL;
