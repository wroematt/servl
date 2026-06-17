-- Expand the pet type check constraint to include more animal types.
ALTER TABLE pets DROP CONSTRAINT IF EXISTS pets_type_check;
ALTER TABLE pets ADD CONSTRAINT pets_type_check
  CHECK (type IN ('cat', 'dog', 'rabbit', 'guinea_pig', 'hamster', 'bird', 'tortoise', 'horse', 'ferret', 'other'));
