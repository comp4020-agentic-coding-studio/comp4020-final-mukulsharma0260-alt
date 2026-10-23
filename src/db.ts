import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./migrate.ts";
import { ROOMS, type Room } from "./audit.ts";

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
  constellation: Constellation | null;
}

// The five study constellations, fixed in code. The migration's CHECK holds
// the same list, so a value outside it can be stored by neither path.
export const CONSTELLATIONS = ["science", "engineering", "business", "health", "arts"] as const;
export type Constellation = (typeof CONSTELLATIONS)[number];

export function isConstellation(value: unknown): value is Constellation {
  return typeof value === "string" && (CONSTELLATIONS as readonly string[]).includes(value);
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
  constellation: string | null;
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
    constellation: isConstellation(row.constellation) ? row.constellation : null,
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

// A star by its public id, for server-side use only (the logs need a star's
// current room after its last stream closes, when no cookie is at hand).
export function getById(db: DatabaseSync, id: string): Star | undefined {
  const row = db.prepare("SELECT * FROM stars WHERE id = ?").get(id) as unknown as StarRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function getByHash(db: DatabaseSync, tokenHash: string): Star | undefined {
  const row = db.prepare("SELECT * FROM stars WHERE token_hash = ?").get(tokenHash) as unknown as
    | StarRow
    | undefined;
  return row ? fromRow(row) : undefined;
}

export function createStar(
  db: DatabaseSync,
  args: { id: string; tokenHash: string; x: number; y: number; now: string; constellation?: Constellation | null },
): Star {
  // A new star starts "caught up" through its own row: seq is assigned from
  // star_seq in strict, never-reused insertion order, unlike created_at, so
  // it's what the "since last visit" window is measured against (see
  // idsSeenSince below).
  const seq = nextSeq(db);
  // The constellation column is only named when there is one to store, so
  // this also works on a database that has not yet taken migration 004.
  if (args.constellation) {
    db.prepare(
      `INSERT INTO stars (id, token_hash, x, y, created_at, updated_at, last_seen_at, seq, last_seen_seq, constellation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(args.id, args.tokenHash, args.x, args.y, args.now, args.now, args.now, seq, seq, args.constellation);
  } else {
    db.prepare(
      `INSERT INTO stars (id, token_hash, x, y, created_at, updated_at, last_seen_at, seq, last_seen_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(args.id, args.tokenHash, args.x, args.y, args.now, args.now, args.now, seq, seq);
  }
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
    constellation: args.constellation ?? null,
  };
}

// Settles the caller's own star into a constellation, or unsettles it with
// null. The star is found by token hash, so only its owner can change it.
// When a position is given (settling into a region), it is written in the
// same statement, so the star is never stored in one area's region while
// marked as another.
export function setConstellation(
  db: DatabaseSync,
  tokenHash: string,
  constellation: Constellation | null,
  now: string,
  position?: { x: number; y: number },
): Star | undefined {
  if (position) {
    db.prepare("UPDATE stars SET constellation = ?, x = ?, y = ?, updated_at = ? WHERE token_hash = ?").run(
      constellation,
      position.x,
      position.y,
      now,
      tokenHash,
    );
  } else {
    db.prepare("UPDATE stars SET constellation = ?, updated_at = ? WHERE token_hash = ?").run(
      constellation,
      now,
      tokenHash,
    );
  }
  return getByHash(db, tokenHash);
}

// Traces: how many stars have settled into each constellation, kept in
// SQLite, so they outlive a deploy. Stars that never chose one are counted
// separately rather than given an area.
export function traceCounts(db: DatabaseSync): { byConstellation: Record<Constellation, number>; unsettled: number } {
  const byConstellation = Object.fromEntries(CONSTELLATIONS.map((c) => [c, 0])) as Record<Constellation, number>;
  let unsettled = 0;
  const rows = db.prepare("SELECT constellation, COUNT(*) AS n FROM stars GROUP BY constellation").all() as Array<{
    constellation: string | null;
    n: number;
  }>;
  for (const row of rows) {
    if (isConstellation(row.constellation)) byConstellation[row.constellation] = row.n;
    else unsettled += row.n;
  }
  return { byConstellation, unsettled };
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

// A callsign belongs to the anonymous identity itself (its token hash), not
// to a star: see migrations/005_create_callsigns.sql. A visitor may have one
// before ever placing a star.
export interface Callsign {
  tokenHash: string;
  callsign: string;
  callsignNormalized: string;
  createdAt: string;
  updatedAt: string;
  changeAvailableAt: string;
}

interface CallsignRow {
  token_hash: string;
  callsign: string;
  callsign_normalized: string;
  created_at: string;
  updated_at: string;
  change_available_at: string;
}

function fromCallsignRow(row: CallsignRow): Callsign {
  return {
    tokenHash: row.token_hash,
    callsign: row.callsign,
    callsignNormalized: row.callsign_normalized,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    changeAvailableAt: row.change_available_at,
  };
}

export function getCallsignByHash(db: DatabaseSync, tokenHash: string): Callsign | undefined {
  const row = db.prepare("SELECT * FROM callsigns WHERE token_hash = ?").get(tokenHash) as unknown as
    | CallsignRow
    | undefined;
  return row ? fromCallsignRow(row) : undefined;
}

export function getCallsignByNormalized(db: DatabaseSync, normalized: string): Callsign | undefined {
  const row = db.prepare("SELECT * FROM callsigns WHERE callsign_normalized = ?").get(normalized) as unknown as
    | CallsignRow
    | undefined;
  return row ? fromCallsignRow(row) : undefined;
}

// Thrown when callsign_normalized collides with a *different* identity's
// already-claimed name. The server pre-checks with getCallsignByNormalized
// for a friendly message, but this is the real authority: if two requests
// race to claim the same name at once, SQLite's UNIQUE index decides, and
// the loser gets this error rather than silently overwriting the winner.
export class CallsignTakenError extends Error {}

// Sets the caller's callsign: creates it on a first choice, or renames it on
// a later one, in one statement so a crash can never leave created_at set
// without the rest. ON CONFLICT targets token_hash only, so a rename (same
// identity, new name) updates in place; a collision with a different
// identity's claimed name instead hits the separate UNIQUE index on
// callsign_normalized and throws, since that conflict has no handler here.
export function setCallsign(
  db: DatabaseSync,
  tokenHash: string,
  callsign: string,
  callsignNormalized: string,
  now: string,
  changeAvailableAt: string,
): Callsign {
  try {
    db.prepare(
      `INSERT INTO callsigns (token_hash, callsign, callsign_normalized, created_at, updated_at, change_available_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(token_hash) DO UPDATE SET
         callsign = excluded.callsign,
         callsign_normalized = excluded.callsign_normalized,
         updated_at = excluded.updated_at,
         change_available_at = excluded.change_available_at`,
    ).run(tokenHash, callsign, callsignNormalized, now, now, changeAvailableAt);
  } catch (err) {
    throw new CallsignTakenError("callsign already taken", { cause: err });
  }
  return getCallsignByHash(db, tokenHash)!;
}

// A chat message (migrations/006_create_messages.sql). author_token_hash is
// server-only: it is never read back by anything in this module's public
// shape (see PublicMessage) or sent in any API response or SSE event.
export interface Message {
  id: string;
  room: Room;
  authorTokenHash: string;
  callsignSnapshot: string;
  body: string;
  createdAt: string;
  expiresAt: string;
}

// What a message is allowed to tell another browser: never the author's
// token hash, only the identity-free facts a chat bubble needs to render.
export interface PublicMessage {
  id: string;
  callsign: string;
  body: string;
  createdAt: string;
}

export function publicMessage(m: Message): PublicMessage {
  return { id: m.id, callsign: m.callsignSnapshot, body: m.body, createdAt: m.createdAt };
}

interface MessageRow {
  id: string;
  room: string;
  author_token_hash: string;
  callsign_snapshot: string;
  body: string;
  created_at: string;
  expires_at: string;
}

export function isRoomKey(value: unknown): value is Room {
  return typeof value === "string" && (ROOMS as readonly string[]).includes(value);
}

function fromMessageRow(row: MessageRow): Message {
  return {
    id: row.id,
    // Written and read back through the same CHECK-constrained column, so
    // an unrecognised value here would mean the CHECK itself had changed
    // without this cast being updated — not a value a normal write path
    // could ever produce.
    room: row.room as Room,
    authorTokenHash: row.author_token_hash,
    callsignSnapshot: row.callsign_snapshot,
    body: row.body,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

// Inserts a message whose author is the given identity. The caller is
// responsible for resolving tokenHash to its own real, current callsign
// (getCallsignByHash) before calling this: callsignSnapshot is taken as
// given, never re-derived here, so a caller that passed a client-supplied
// value instead of the server's own lookup would be the one at fault, not
// this function — see src/server.ts's handleCreateMessage for the actual
// lookup this function must never be allowed to skip.
export function createMessage(
  db: DatabaseSync,
  args: { id: string; room: Room; tokenHash: string; callsignSnapshot: string; body: string; now: string; expiresAt: string },
): Message {
  db.prepare(
    `INSERT INTO messages (id, room, author_token_hash, callsign_snapshot, body, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(args.id, args.room, args.tokenHash, args.callsignSnapshot, args.body, args.now, args.expiresAt);
  return {
    id: args.id,
    room: args.room,
    authorTokenHash: args.tokenHash,
    callsignSnapshot: args.callsignSnapshot,
    body: args.body,
    createdAt: args.now,
    expiresAt: args.expiresAt,
  };
}

// Unexpired messages in a room, oldest first. The expiry filter is here,
// not only in a separate sweep job, so an expired message can never be
// read back even if no sweep has run yet (deleteExpiredMessages below is
// the sweep; this filter is what actually enforces expiry on every read
// path, independent of whether that sweep has run).
export function listRoomMessages(db: DatabaseSync, room: Room, nowIso: string): Message[] {
  const rows = db
    .prepare("SELECT * FROM messages WHERE room = ? AND expires_at > ? ORDER BY created_at ASC")
    .all(room, nowIso) as unknown as MessageRow[];
  return rows.map(fromMessageRow);
}

// Deletes every message past its expiry and reports exactly which ones, so
// the caller can tell currently-connected visitors their room just lost
// those messages (a live message.expired event). This is the only thing
// that actually frees storage: listRoomMessages's filter above already
// makes an expired row unreadable before this ever runs, so a delayed or
// skipped sweep is a storage cost, never a correctness or privacy gap.
export function deleteExpiredMessages(db: DatabaseSync, nowIso: string): Array<{ id: string; room: Room }> {
  const rows = db
    .prepare("SELECT id, room FROM messages WHERE expires_at <= ?")
    .all(nowIso) as unknown as Array<{ id: string; room: string }>;
  if (rows.length === 0) return [];
  db.prepare("DELETE FROM messages WHERE expires_at <= ?").run(nowIso);
  return rows.map((r) => ({ id: r.id, room: r.room as Room }));
}
