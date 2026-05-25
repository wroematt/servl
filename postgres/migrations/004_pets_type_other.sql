-- Allow 'other' as a valid pet type (previously only 'cat' and 'dog').
ALTER TABLE pets DROP CONSTRAINT IF EXISTS pets_type_check;
ALTER TABLE pets ADD CONSTRAINT pets_type_check CHECK (type IN ('cat', 'dog', 'other'));
