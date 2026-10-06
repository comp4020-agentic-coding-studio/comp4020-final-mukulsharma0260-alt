-- SQLite reuses the largest rowid once the row holding it is deleted, so a
-- rowid-based watermark can't tell a brand new star apart from the old,
-- already-seen star that used to have that same rowid. star_seq is a counter
-- that only ever increases, independent of which rows still exist.
CREATE TABLE star_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_seq INTEGER NOT NULL
);
INSERT INTO star_seq (id, next_seq) VALUES (1, (SELECT COALESCE(MAX(rowid), 0) + 1 FROM stars));

ALTER TABLE stars ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
UPDATE stars SET seq = rowid;

-- Re-baseline every visitor's watermark (previously a rowid snapshot) onto
-- the same counter scale, so existing visitors stay caught up through now
-- instead of being flooded with stars they've already seen.
UPDATE stars SET last_seen_seq = (SELECT COALESCE(MAX(seq), 0) FROM stars);
