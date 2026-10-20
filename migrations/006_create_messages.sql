-- A chat message belongs to exactly one room: the Common Room, or one of
-- the five constellations. The stored value is "arts", not "arts-society" —
-- the slug split already used for URLs (public/sky.js SLUGS/ROUTES) is
-- reused here rather than renamed, so this stays consistent with
-- stars.constellation and does not touch any shipped migration.
--
-- author_token_hash references callsigns, not stars: posting the Common
-- Room requires only a callsign (an identity may have no star at all), so a
-- NOT NULL foreign key to stars would be wrong here. The token hash is
-- server-only and is never put in any API response or SSE event.
--
-- callsign_snapshot is written once at insert and never updated, so a later
-- rename never rewrites what an already-sent message is shown to say.
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL CHECK (room IN ('common', 'science', 'engineering', 'business', 'health', 'arts')),
  author_token_hash TEXT NOT NULL REFERENCES callsigns(token_hash),
  callsign_snapshot TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) >= 1 AND length(body) <= 280),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Chat reads are always "this room, not expired, newest last": one index
-- serves both the late-joiner snapshot and any future listing.
CREATE INDEX idx_messages_room_created ON messages (room, created_at);
-- Serves the expiry sweep (Phase 4): find everything past its expiry.
CREATE INDEX idx_messages_expires ON messages (expires_at);
