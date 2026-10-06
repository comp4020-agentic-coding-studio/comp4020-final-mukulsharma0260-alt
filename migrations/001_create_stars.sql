CREATE TABLE stars (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
  y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
