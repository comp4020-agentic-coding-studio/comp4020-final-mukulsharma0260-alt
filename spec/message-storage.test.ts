import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createMessage, isRoomKey, listRoomMessages, openDb, publicMessage, setCallsign } from "../src/db.ts";

// The messages table and its src/db.ts functions, checked directly against a
// standalone database (no server, no routes — those land in a later
// change), the same pattern spec/stars.test.ts and spec/callsign.test.ts
// already use for direct src/db.ts checks.
//
// messages.author_token_hash references callsigns(token_hash) (not stars):
// every createMessage call here first gives that token hash a real row in
// callsigns via setCallsign, exactly as a real post always would (the
// server's handleCreateMessage refuses to post without a resolved
// callsign). This is what proves posting needs no star, not an absence of
// setup: a star row is never created in any test in this file.

function withDb<T>(fn: (dbPath: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "overlap-messages-db-"));
  try {
    return fn(join(dir, "stars.db"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function withCallsign(db: DatabaseSync, tokenHash: string, callsign: string, now: string): void {
  const changeAvailableAt = new Date(new Date(now).getTime() + 86_400_000).toISOString();
  setCallsign(db, tokenHash, callsign, callsign, now, changeAvailableAt);
}

describe("isRoomKey", () => {
  it("accepts every real room key", () => {
    for (const room of ["common", "science", "engineering", "business", "health", "arts"]) {
      expect(isRoomKey(room)).toBe(true);
    }
  });

  it("rejects an unknown value, including the URL slug that is not the stored value", () => {
    expect(isRoomKey("arts-society")).toBe(false);
    expect(isRoomKey("not-a-room")).toBe(false);
    expect(isRoomKey(123)).toBe(false);
    expect(isRoomKey(undefined)).toBe(false);
  });
});

describe("migration 006 creates the messages table", () => {
  it("is applied exactly once, and a message survives closing and reopening the database file", () => {
    withDb((dbPath) => {
      const db1 = openDb(dbPath);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
      withCallsign(db1, "a".repeat(64), "nightowl", now);
      createMessage(db1, { id: "msg-1", room: "common", tokenHash: "a".repeat(64), callsignSnapshot: "nightowl", body: "hello", now, expiresAt });
      db1.close();

      // Reopening the same file must not reapply 006 (it would try to
      // CREATE TABLE a second time and throw).
      const db2 = openDb(dbPath);
      const messages = listRoomMessages(db2, "common", now);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.body).toBe("hello");
      db2.close();
    });
  });
});

describe("createMessage / listRoomMessages", () => {
  it("posting to the Common Room never requires a star: a callsign alone is enough, no row in stars at any point", () => {
    withDb((dbPath) => {
      const db = openDb(dbPath);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
      withCallsign(db, "b".repeat(64), "orbit-reader", now);
      const message = createMessage(db, { id: "msg-1", room: "common", tokenHash: "b".repeat(64), callsignSnapshot: "orbit-reader", body: "no star needed", now, expiresAt });
      expect(message.callsignSnapshot).toBe("orbit-reader");
      const rows = db.prepare("SELECT COUNT(*) AS n FROM stars").get() as { n: number };
      expect(rows.n).toBe(0);
      db.close();
    });
  });

  it("listRoomMessages returns only messages for the given room, oldest first", () => {
    withDb((dbPath) => {
      const db = openDb(dbPath);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
      withCallsign(db, "a".repeat(64), "a", now);
      createMessage(db, { id: "msg-1", room: "common", tokenHash: "a".repeat(64), callsignSnapshot: "a", body: "first", now, expiresAt });
      createMessage(db, { id: "msg-2", room: "engineering", tokenHash: "a".repeat(64), callsignSnapshot: "a", body: "wrong room", now, expiresAt });
      createMessage(db, { id: "msg-3", room: "common", tokenHash: "a".repeat(64), callsignSnapshot: "a", body: "second", now, expiresAt });
      const common = listRoomMessages(db, "common", now);
      expect(common.map((m) => m.body)).toEqual(["first", "second"]);
      db.close();
    });
  });

  it("excludes a message whose expires_at has already passed, even though no sweep has run", () => {
    withDb((dbPath) => {
      const db = openDb(dbPath);
      const past = new Date(Date.now() - 1000).toISOString();
      const now = new Date().toISOString();
      withCallsign(db, "a".repeat(64), "a", now);
      createMessage(db, { id: "msg-1", room: "common", tokenHash: "a".repeat(64), callsignSnapshot: "a", body: "already expired", now, expiresAt: past });
      expect(listRoomMessages(db, "common", now)).toEqual([]);
      db.close();
    });
  });

  it("callsign_snapshot is independent of the callsigns table: a later rename does not change an already-stored message", () => {
    withDb((dbPath) => {
      const db = openDb(dbPath);
      const now = new Date().toISOString();
      const changeAvailableAt = new Date(Date.now() + 86_400_000).toISOString();
      const tokenHash = "a".repeat(64);
      setCallsign(db, tokenHash, "original-name", "original-name", now, changeAvailableAt);
      createMessage(db, { id: "msg-1", room: "common", tokenHash, callsignSnapshot: "original-name", body: "before rename", now, expiresAt: changeAvailableAt });
      setCallsign(db, tokenHash, "renamed", "renamed", now, changeAvailableAt);
      const [message] = listRoomMessages(db, "common", now);
      expect(message?.callsignSnapshot).toBe("original-name");
      db.close();
    });
  });

  it("publicMessage never includes the author's token hash", () => {
    withDb((dbPath) => {
      const db = openDb(dbPath);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
      withCallsign(db, "secret-hash-value".padEnd(64, "0"), "visitor", now);
      const message = createMessage(db, { id: "msg-1", room: "common", tokenHash: "secret-hash-value".padEnd(64, "0"), callsignSnapshot: "visitor", body: "hi", now, expiresAt });
      const pub = publicMessage(message);
      expect(Object.keys(pub).sort()).toEqual(["body", "callsign", "createdAt", "id"]);
      expect(JSON.stringify(pub)).not.toContain("secret-hash-value");
      db.close();
    });
  });
});
