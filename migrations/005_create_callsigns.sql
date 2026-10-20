-- A callsign belongs to the anonymous browser identity itself, not to a
-- star: a visitor may choose one before ever placing a star, an old star
-- with no callsign is untouched, and a star may exist with no callsign.
-- Keyed by the same SHA-256 token hash stars.token_hash already uses, so
-- this table describes one identity without depending on a star existing.
--
-- Callsigns are permanently unique in this version: once a normalised form
-- is claimed, it is never freed. No stale-name release, no last-seen
-- tracking for one.
CREATE TABLE callsigns (
  token_hash TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  callsign_normalized TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  change_available_at TEXT NOT NULL
);
