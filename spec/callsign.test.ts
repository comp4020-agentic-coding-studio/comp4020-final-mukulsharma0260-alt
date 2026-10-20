import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CALLSIGN_RULES,
  isReservedCallsign,
  isValidCallsignFormat,
  normalizeCallsign,
  trimCallsign,
} from "../src/callsign.ts";
import { CallsignTakenError, getCallsignByHash, getCallsignByNormalized, openDb, setCallsign } from "../src/db.ts";

// A callsign is an anonymous alias chosen once, independent of any star
// (ADR 0012). The first two describe blocks below check format validation
// and the storage layer directly, against a standalone database (no server,
// no routes) — the same standalone-openDb pattern spec/stars.test.ts already
// uses for direct src/db.ts checks. The rest spawn a real server, like
// spec/constellations.test.ts, to exercise POST /api/callsign end to end.

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

let server: ChildProcess;
let dir: string;
let baseUrl: string;
let output = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "overlap-callsign-"));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["src/server.ts"], {
    env: { ...process.env, PORT: String(port), DB_PATH: join(dir, "stars.db"), NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout!.on("data", (chunk) => { output += chunk.toString(); });
  server.stderr!.on("data", (chunk) => { output += chunk.toString(); });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(baseUrl);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`callsign test server did not start:\n${output}`);
});

afterAll(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  output = "";
});

function field(line: string, key: string): string | undefined {
  return line.match(new RegExp(`(?:^| )${key}=(\\S+)`))?.[1];
}

async function auditLines(match: (line: string) => boolean, count = 1): Promise<string[]> {
  for (let i = 0; i < 50; i++) {
    const lines = output.split("\n").filter((l) => l.startsWith("audit ") && match(l));
    if (lines.length >= count) return lines;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`expected ${count} matching audit line(s), got:\n${output}`);
}

// A bare fetch with no cookie jar: tests manage cookies explicitly so two
// "browsers" (two separate cookie strings) are genuinely independent, the
// same style as spec/constellations.test.ts's createIdentity.
function setCallsignOverHttp(cookie: string | undefined, body: unknown): Promise<Response> {
  return fetch(new URL("/api/callsign", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function cookieFrom(res: Response): string {
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

async function createStarIdentity(body: unknown = {}): Promise<{ cookie: string; id: string }> {
  const res = await fetch(new URL("/api/star", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const cookie = cookieFrom(res);
  const { star } = await res.json();
  return { cookie, id: star.id };
}

describe("choosing a callsign over POST /api/callsign (scenarios 1, 8)", () => {
  it("a fresh browser with no star yet can choose a valid callsign", async () => {
    const res = await setCallsignOverHttp(undefined, { callsign: "nightowl" });
    expect(res.status).toBe(201);
    const cookie = cookieFrom(res);
    const { callsign } = await res.json();
    expect(callsign.callsign).toBe("nightowl");

    // Returning with the same cookie and no star restores it (part of the
    // user's own success criteria: returning finds their own callsign).
    const again = await setCallsignOverHttp(cookie, { callsign: "nightowl" });
    expect(again.status).toBe(200);
  });

  it("choosing a callsign does not require or create a star, and an existing star's ownership is untouched", async () => {
    const { cookie, id } = await createStarIdentity();

    const res = await setCallsignOverHttp(cookie, { callsign: "orbit-reader" });
    expect(res.status).toBe(201);

    // POST /api/star with an existing identity returns that identity's own
    // star unchanged (src/server.ts handleCreateStar's early-return path) —
    // the same star id as before, proving the callsign write didn't touch it.
    const after = await (
      await fetch(new URL("/api/star", baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: "{}",
      })
    ).json();
    expect(after.star.id).toBe(id);
  });
});

describe("case-insensitive collision handling over HTTP (scenario 5)", () => {
  it("a second identity cannot claim a callsign that differs only in case or spacing", async () => {
    const first = await setCallsignOverHttp(undefined, { callsign: "Night Owl" });
    expect(first.status).toBe(201);

    const second = await setCallsignOverHttp(undefined, { callsign: "NIGHT  OWL" });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toMatch(/already taken/i);
    const [line] = await auditLines((l) => l.includes("action=callsign.denied") && l.includes("reason=taken"));
    expect(field(line!, "result")).toBe("rejected");
  });

  it("the same identity re-submitting its own current callsign (any casing) is a no-op, not a collision", async () => {
    const res = await setCallsignOverHttp(undefined, { callsign: "Quiet Comet" });
    const cookie = cookieFrom(res);
    const again = await setCallsignOverHttp(cookie, { callsign: "QUIET COMET" });
    expect(again.status).toBe(200);
  });
});

describe("ownership: only a browser's own cookie can change its callsign (scenario 6)", () => {
  it("B's request body carries nothing that could name A, so it can only ever act on B's own identity, never A's", async () => {
    const a = await setCallsignOverHttp(undefined, { callsign: "alpha-star" });
    const aCookie = cookieFrom(a);
    const b = await setCallsignOverHttp(undefined, { callsign: "beta-star" });
    const bCookie = cookieFrom(b);

    // The endpoint takes only {callsign}: there is no field a caller could
    // use to name a different identity, so "B renames A" is not expressible
    // as a request at all — ownership comes solely from each caller's own
    // cookie. B acting under its own cookie only ever touches its own name:
    // a second attempt within the cooldown is refused, not applied to A's.
    const second = await setCallsignOverHttp(bCookie, { callsign: "beta-star-two" });
    expect(second.status).toBe(429);

    // A's callsign is untouched by anything B did: re-submitting A's own
    // current name (a no-op, exempt from the cooldown) still succeeds and
    // still returns A's own unchanged name, not B's.
    const aStillOwns = await setCallsignOverHttp(aCookie, { callsign: "alpha-star" });
    expect(aStillOwns.status).toBe(200);
    const { callsign } = await aStillOwns.json();
    expect(callsign.callsign).toBe("alpha-star");
  });
});

describe("rename cooldown (scenario 7)", () => {
  it("a second rename within 24h is refused with a safe reason and a resumable time", async () => {
    const first = await setCallsignOverHttp(undefined, { callsign: "comet-one" });
    expect(first.status).toBe(201);
    const cookie = cookieFrom(first);

    const rename = await setCallsignOverHttp(cookie, { callsign: "comet-two" });
    expect(rename.status).toBe(429);
    const body = await rename.json();
    expect(body.changeAvailableAt).toBeTruthy();
    expect(new Date(body.changeAvailableAt).getTime()).toBeGreaterThan(Date.now());

    const [line] = await auditLines((l) => l.includes("action=callsign.denied") && l.includes("reason=cooldown"));
    expect(field(line!, "result")).toBe("rejected");
  });
});

describe("a callsign chosen before any star shares the same identity as a star placed after (cross-cutting fix)", () => {
  it("placing a star after choosing a callsign reuses the same cookie identity, not a second one", async () => {
    const callsignRes = await setCallsignOverHttp(undefined, { callsign: "early-chooser" });
    const cookie = cookieFrom(callsignRes);

    const starRes = await fetch(new URL("/api/star", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    });
    // If placing a star minted a second token, the Set-Cookie header below
    // would carry a different token than `cookie`, orphaning the callsign.
    const starSetCookie = starRes.headers.get("set-cookie");
    if (starSetCookie) {
      expect(starSetCookie.split(";")[0]).toBe(cookie);
    }

    // The callsign is still reachable under the (possibly now-confirmed)
    // same cookie, proving the two were never split onto separate identities.
    const noop = await setCallsignOverHttp(cookie, { callsign: "early-chooser" });
    expect(noop.status).toBe(200);
    const { callsign } = await noop.json();
    expect(callsign.callsign).toBe("early-chooser");
  });
});
