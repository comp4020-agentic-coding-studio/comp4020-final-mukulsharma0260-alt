ALTER TABLE stars ADD COLUMN last_seen_seq INTEGER NOT NULL DEFAULT 0;

-- Existing rows have no history to replay honestly, so treat every visitor as
-- caught up to everything that exists right now rather than flooding them
-- with "new" stars that are really old.
UPDATE stars SET last_seen_seq = (SELECT COALESCE(MAX(rowid), 0) FROM stars);
