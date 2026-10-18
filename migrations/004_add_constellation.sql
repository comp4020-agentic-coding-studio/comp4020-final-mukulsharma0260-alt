-- A star may settle into one of five fixed study constellations. NULL means
-- it has not chosen one: every star that existed before this migration stays
-- NULL, so no visitor is placed in an area they never picked. The CHECK makes
-- the database itself refuse any other value, behind the server's own list.
ALTER TABLE stars ADD COLUMN constellation TEXT
  CHECK (constellation IN ('science', 'engineering', 'business', 'health', 'arts'));
