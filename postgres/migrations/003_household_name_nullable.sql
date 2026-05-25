-- Households no longer need a user-visible name.
-- They are identified only by their UUID.
ALTER TABLE households ALTER COLUMN name DROP NOT NULL;
ALTER TABLE households ALTER COLUMN name SET DEFAULT '';
