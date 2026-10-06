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
  lastSeenSeq: number;
  seq: number;
}

interface StarRow {
  id: string;
  token_hash: string;
  x: number;
  y: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  last_seen_seq: number;
  seq: number;
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
    lastSeenSeq: row.last_seen_seq,
    seq: row.seq,
  };
}

// star_seq holds a single counter row that only ever increases. Unlike
// rowid, its value is never freed up by a delete, so a watermark taken from
// it can never be handed back out to a different, later star.
function nextSeq(db: DatabaseSync): number {
  db.prepare("UPDATE star_seq SET next_seq = next_seq + 1 WHERE id = 1").run();
  const row = db.prepare("SELECT next_seq - 1 AS seq FROM star_seq WHERE id = 1").get() as { seq: number };
  return row.seq;
}

function currentMaxSeq(db: DatabaseSync): number {
  const row = db.prepare("SELECT next_seq - 1 AS seq FROM star_seq WHERE id = 1").get() as { seq: number };
  return row.seq;
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
  // A new star starts "caught up" through its own row: seq is assigned from
  // star_seq in strict, never-reused insertion order, unlike created_at, so
  // it's what the "since last visit" window is measured against (see
  // idsSeenSince below).
  const seq = nextSeq(db);
  db.prepare(
    `INSERT INTO stars (id, token_hash, x, y, created_at, updated_at, last_seen_at, seq, last_seen_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(args.id, args.tokenHash, args.x, args.y, args.now, args.now, args.now, seq, seq);
  return {
    id: args.id,
    tokenHash: args.tokenHash,
    x: args.x,
    y: args.y,
    createdAt: args.now,
    updatedAt: args.now,
    lastSeenAt: args.now,
    lastSeenSeq: seq,
    seq,
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

// Returns the star's last_seen_at/last_seen_seq as they were *before* this
// call, then advances both to `now`/the current star_seq counter. The caller
// needs the previous seq to count what's new since (see idsSeenSince below);
// the previous timestamp is only for human display ("you were last here...").
export function touchSeen(
  db: DatabaseSync,
  tokenHash: string,
  now: string,
): { star: Star; previousLastSeenAt: string; previousLastSeenSeq: number } | undefined {
  const before = getByHash(db, tokenHash);
  if (!before) return undefined;
  const seq = currentMaxSeq(db);
  db.prepare("UPDATE stars SET last_seen_at = ?, last_seen_seq = ? WHERE token_hash = ?").run(
    now,
    seq,
    tokenHash,
  );
  const after = getByHash(db, tokenHash)!;
  return { star: after, previousLastSeenAt: before.lastSeenAt, previousLastSeenSeq: before.lastSeenSeq };
}

export function listAll(db: DatabaseSync): Star[] {
  const rows = db.prepare("SELECT * FROM stars ORDER BY created_at ASC").all() as unknown as StarRow[];
  return rows.map(fromRow);
}

// created_at has only millisecond resolution, so two stars can tie on it, and
// so can a star's created_at and a visitor's own touch timestamp a moment
// later. Comparing against created_at with ">=" fixes the first tie but
// double-reports a star whose created_at happens to equal a later touch's
// own timestamp, since that timestamp becomes the next call's lower bound
// too. seq has no such ambiguity: it's assigned in strict insertion order,
// one per row, never tied even within the same millisecond, and — unlike
// rowid — never reused after a row is deleted, so a star is counted as new
// in exactly one call, never zero, never two, and never silently absorbed
// into an earlier watermark.
export function idsSeenSince(db: DatabaseSync, afterSeq: number, excludeId: string): string[] {
  const rows = db
    .prepare("SELECT id FROM stars WHERE seq > ? AND id != ?")
    .all(afterSeq, excludeId) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}
