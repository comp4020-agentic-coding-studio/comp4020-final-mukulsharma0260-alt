import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALLSIGN_RULES,
  isReservedCallsign,
  isValidCallsignFormat,
  normalizeCallsign,
  trimCallsign,
} from "../src/callsign.ts";
import { CallsignTakenError, getCallsignByHash, getCallsignByNormalized, openDb, setCallsign } from "../src/db.ts";

// A callsign is an anonymous alias chosen once, independent of any star
// (ADR 0012). This file checks format validation and the storage layer
// directly, against a standalone database (no server, no routes — those
// land in a later change); the same standalone-openDb pattern
// spec/stars.test.ts already uses for direct src/db.ts checks.

describe("callsign format (pure, no database)", () => {
  it("accepts a plain name within 3-16 characters", () => {
    expect(isValidCallsignFormat("nightowl")).toBe(true);
    expect(isValidCallsignFormat("abc")).toBe(true);
    expect(isValidCallsignFormat("a".repeat(16))).toBe(true);
  });

  it("rejects too short or too long", () => {
    expect(isValidCallsignFormat("ab")).toBe(false);
    expect(isValidCallsignFormat("a".repeat(17))).toBe(false);
    expect(CALLSIGN_RULES).toMatch(/3-16/);
  });

  it("accepts letters, numbers, spaces, hyphens and underscores", () => {
    expect(isValidCallsignFormat("orbit-reader")).toBe(true);
    expect(isValidCallsignFormat("quiet comet")).toBe(true);
    expect(isValidCallsignFormat("star_42")).toBe(true);
  });

  it("rejects emoji, HTML, control characters and line breaks", () => {
    expect(isValidCallsignFormat("night\u{1F31F}owl")).toBe(false);
    expect(isValidCallsignFormat("<script>x</script>")).toBe(false);
    expect(isValidCallsignFormat("night\nowl")).toBe(false);
    expect(isValidCallsignFormat("night\towl")).toBe(false);
    expect(isValidCallsignFormat("night\u0000owl")).toBe(false);
    // A zero-width space is invisible but not whitespace .trim() removes; it
    // must still be rejected by the character allowlist, not laundered away.
    expect(isValidCallsignFormat("night​owl")).toBe(false);
  });

  it("rejects URL-like values", () => {
    expect(isValidCallsignFormat("http://evil.example")).toBe(false);
    expect(isValidCallsignFormat("evil.example.com")).toBe(false);
    expect(isValidCallsignFormat("user@host")).toBe(false);
  });

  it("trims outer whitespace and collapses internal runs, without laundering a rejected character first", () => {
    expect(trimCallsign("  night owl  ")).toBe("night owl");
    expect(trimCallsign("night   owl")).toBe("night owl");
    // A line break between words must fail validation outright, never be
    // treated as if it were a collapsible space.
    expect(isValidCallsignFormat("night\nowl")).toBe(false);
  });

  it("normalises case and whitespace for uniqueness and reserved-word checks", () => {
    expect(normalizeCallsign("Night Owl")).toBe(normalizeCallsign("night  owl"));
    expect(normalizeCallsign("NIGHT OWL")).toBe(normalizeCallsign("night owl"));
  });

  it("flags reserved system words case- and whitespace-insensitively", () => {
    for (const word of ["admin", "Administrator", "SYSTEM", " moderator ", "Overlap", "support", "staff"]) {
      expect(isReservedCallsign(word)).toBe(true);
    }
    expect(isReservedCallsign("nightowl")).toBe(false);
  });
});

describe("callsign storage (direct against src/db.ts, no server)", () => {
  function withDb<T>(fn: (dbPath: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "overlap-callsign-db-"));
    try {
      return fn(join(dir, "stars.db"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("migration 005 creates the callsigns table, applied exactly once", () => {
    withDb((dbPath) => {
      const db1 = openDb(dbPath);
      const now = new Date().toISOString();
      const changeAvailableAt = new Date(Date.now() + 86_400_000).toISOString();
      setCallsign(db1, "a".repeat(64), "nightowl", "nightowl", now, changeAvailableAt);
      db1.close();

      // Reopening the same file must not reapply 005 (it would try to
      // CREATE TABLE a second time and throw).
      const db2 = openDb(dbPath);
      const saved = getCallsignByHash(db2, "a".repeat(64));
      expect(saved?.callsign).toBe("nightowl");
      db2.close();
    });
  });

  it("a callsign is independent of any star: it can be set with no star row present at all", () => {
    withDb((dbPath) => {
      const db = openDb(dbPath);
      const now = new Date().toISOString();
      const changeAvailableAt = new Date(Date.now() + 86_400_000).toISOString();
      // No row in `stars` for this hash at any point in this test.
      const saved = setCallsign(db, "b".repeat(64), "orbit-reader", "orbit-reader", now, changeAvailableAt);
      expect(saved.callsign).toBe("orbit-reader");
      db.close();
    });
  });

  it("callsign_normalized is unique at the database level, independent of server pre-checks", () => {
    withDb((dbPath) => {
      const db = openDb(dbPath);
      const now = new Date().toISOString();
      const changeAvailableAt = new Date(Date.now() + 86_400_000).toISOString();
      setCallsign(db, "c".repeat(64), "Night Owl", "night owl", now, changeAvailableAt);
      // A different identity claiming the same normalised form must be
      // refused by the UNIQUE index itself, not merely by a server-side
      // lookup that a bug could skip.
      expect(() => setCallsign(db, "d".repeat(64), "NIGHT OWL", "night owl", now, changeAvailableAt)).toThrow(
        CallsignTakenError,
      );
      db.close();
    });
  });

  it("the same identity can update its own row in place (a rename), targeted by token_hash", () => {
    withDb((dbPath) => {
      const db = openDb(dbPath);
      const now = new Date().toISOString();
      const changeAvailableAt = new Date(Date.now() + 86_400_000).toISOString();
      setCallsign(db, "e".repeat(64), "comet-one", "comet-one", now, changeAvailableAt);
      const renamed = setCallsign(db, "e".repeat(64), "comet-two", "comet-two", now, changeAvailableAt);
      expect(renamed.callsign).toBe("comet-two");
      expect(getCallsignByNormalized(db, "comet-one")).toBeUndefined();
      db.close();
    });
  });
});
