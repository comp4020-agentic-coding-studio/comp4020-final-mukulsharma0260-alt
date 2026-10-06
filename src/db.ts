import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./migrate.ts";

export interface Star {
  id: string;
  tokenHash: string;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

interface StarRow {
  id: string;
  token_hash: string;
  x: number;
  y: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

function fromRow(row: StarRow): Star {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    x: row.x,
    y: row.y,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

export function getByHash(db: DatabaseSync, tokenHash: string): Star | undefined {
  const row = db.prepare("SELECT * FROM stars WHERE token_hash = ?").get(tokenHash) as unknown as
    | StarRow
    | undefined;
  return row ? fromRow(row) : undefined;
}

export function createStar(
  db: DatabaseSync,
  args: { id: string; tokenHash: string; x: number; y: number; now: string },
): Star {
  db.prepare(
    `INSERT INTO stars (id, token_hash, x, y, created_at, updated_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(args.id, args.tokenHash, args.x, args.y, args.now, args.now, args.now);
  return {
    id: args.id,
    tokenHash: args.tokenHash,
    x: args.x,
    y: args.y,
    createdAt: args.now,
    updatedAt: args.now,
    lastSeenAt: args.now,
  };
}

export function moveStar(
  db: DatabaseSync,
  tokenHash: string,
  x: number,
  y: number,
  now: string,
): Star | undefined {
  db.prepare(
    "UPDATE stars SET x = ?, y = ?, updated_at = ? WHERE token_hash = ?",
  ).run(x, y, now, tokenHash);
  return getByHash(db, tokenHash);
}

// Returns the star's last_seen_at as it was *before* this call, then advances
// it to `now`. The caller needs the previous value to count what's new since.
export function touchSeen(
  db: DatabaseSync,
  tokenHash: string,
  now: string,
): { star: Star; previousLastSeenAt: string } | undefined {
  const before = getByHash(db, tokenHash);
  if (!before) return undefined;
  db.prepare("UPDATE stars SET last_seen_at = ? WHERE token_hash = ?").run(now, tokenHash);
  const after = getByHash(db, tokenHash)!;
  return { star: after, previousLastSeenAt: before.lastSeenAt };
}

export function listAll(db: DatabaseSync): Star[] {
  const rows = db.prepare("SELECT * FROM stars ORDER BY created_at ASC").all() as unknown as StarRow[];
  return rows.map(fromRow);
}

export function countCreatedAfter(db: DatabaseSync, afterIso: string, excludeId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM stars WHERE created_at > ? AND id != ?")
    .get(afterIso, excludeId) as unknown as { n: number };
  return row.n;
}

export function idsCreatedAfter(db: DatabaseSync, afterIso: string, excludeId: string): string[] {
  const rows = db
    .prepare("SELECT id FROM stars WHERE created_at > ? AND id != ?")
    .all(afterIso, excludeId) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}
