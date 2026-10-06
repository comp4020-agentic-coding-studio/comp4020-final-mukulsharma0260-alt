import { DatabaseSync } from "node:sqlite";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, inject, it } from "vitest";
import { COOKIE_NAME } from "../src/cookies.ts";
import { createStar, getByHash, idsSeenSince, openDb, touchSeen } from "../src/db.ts";
import { migrate } from "../src/migrate.ts";
import { formatDateInZone } from "../src/render.ts";

const REAL_MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

const baseUrl = inject("baseUrl");

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie");
  if (!raw) throw new Error("expected a Set-Cookie header");
  return raw.split(";")[0]!;
}

async function createIdentity(): Promise<{
  cookie: string;
  star: { id: string; x: number; y: number; createdAt: string; lastSeenAt: string };
}> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = cookieFrom(res);
  const { star } = await res.json();
  return { cookie, star };
}

async function fetchHomeHtml(cookie?: string): Promise<string> {
  const res = await fetch(new URL("/", baseUrl), {
    headers: cookie ? { Cookie: cookie } : {},
  });
  return res.text();
}

function circleCount(html: string): number {
  return (html.match(/<circle /g) ?? []).length;
}

it("the sky's viewBox is square and cannot be stretched", async () => {
  const html = await fetchHomeHtml();
  const svgTag = html.match(/<svg id="sky"[^>]*>/);
  expect(svgTag).not.toBeNull();

  const viewBox = svgTag![0].match(/viewBox="([^"]+)"/);
  expect(viewBox).not.toBeNull();
  const [, , w, h] = viewBox![1]!.split(/\s+/).map(Number);
  expect(w).toBe(h);

  expect(svgTag![0]).toMatch(/preserveAspectRatio="xMidYMid meet"/);
});

it("repeated anonymous GET / creates no stars", async () => {
  const before = circleCount(await fetchHomeHtml());
  await fetchHomeHtml();
  await fetchHomeHtml();
  const after = circleCount(await fetchHomeHtml());
  expect(after).toBe(before);
});

it("GET / never advances last_seen_at", async () => {
  const identity = await createIdentity();

  await fetchHomeHtml(identity.cookie);
  await fetchHomeHtml(identity.cookie);
  await fetchHomeHtml(identity.cookie);

  const res = await fetch(new URL("/api/here", baseUrl), {
    method: "POST",
    headers: { Cookie: identity.cookie },
    body: "{}",
  });
  const data = await res.json();
  // /api/here reports the previous last_seen_at before advancing it. If any
  // of the GETs above had touched it, this would no longer equal createdAt.
  expect(data.previousLastSeenAt).toBe(identity.star.createdAt);
});

it("POST /api/star is idempotent for the same identity", async () => {
  const { cookie, star } = await createIdentity();
  const before = circleCount(await fetchHomeHtml());

  const res = await fetch(new URL("/api/star", baseUrl), {
    method: "POST",
    headers: { Cookie: cookie },
    body: "{}",
  });
  const { star: again } = await res.json();

  expect(again.id).toBe(star.id);
  expect(circleCount(await fetchHomeHtml())).toBe(before);
});

it("a second identity cannot move the first identity's star", async () => {
  const a = await createIdentity();
  const b = await createIdentity();

  const res = await fetch(new URL("/api/star/move", baseUrl), {
    method: "POST",
    headers: { Cookie: b.cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ x: 0.91, y: 0.92, starId: a.star.id }),
  });
  expect(res.status).toBe(200);
  const { star: moved } = await res.json();
  expect(moved.id).toBe(b.star.id);
  expect(moved.x).toBeCloseTo(0.91);

  const recheck = await fetch(new URL("/api/star", baseUrl), {
    method: "POST",
    headers: { Cookie: a.cookie },
    body: "{}",
  });
  const { star: aAfter } = await recheck.json();
  expect(aAfter.id).toBe(a.star.id);
  expect(aAfter.x).toBe(a.star.x);
  expect(aAfter.y).toBe(a.star.y);
});

describe("invalid move coordinates are rejected without changing state", () => {
  const cases: Array<[string, unknown]> = [
    ["missing", {}],
    ["string", { x: "a", y: 0.5 }],
    ["not a number", { x: "NaN", y: 0.5 }],
    ["below range", { x: -0.1, y: 0.5 }],
    ["above range", { x: 1.1, y: 0.5 }],
  ];

  for (const [label, body] of cases) {
    it(`rejects ${label} coordinates`, async () => {
      const identity = await createIdentity();

      const res = await fetch(new URL("/api/star/move", baseUrl), {
        method: "POST",
        headers: { Cookie: identity.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);

      const recheck = await fetch(new URL("/api/star", baseUrl), {
        method: "POST",
        headers: { Cookie: identity.cookie },
        body: "{}",
      });
      const { star } = await recheck.json();
      expect(star.x).toBe(identity.star.x);
      expect(star.y).toBe(identity.star.y);
    });
  }
});

it("homepage HTML never exposes a cookie token, token hash, or another visitor's exact timestamp", async () => {
  const identity = await createIdentity();
  const other = await createIdentity();
  const rawToken = identity.cookie.slice(COOKIE_NAME.length + 1);

  // Touch the viewer's own last_seen_at so it no longer coincides with their
  // star's createdAt (which legitimately appears, in <time datetime>, below).
  await fetch(new URL("/api/here", baseUrl), {
    method: "POST",
    headers: { Cookie: identity.cookie },
    body: "{}",
  });
  const recheck = await fetch(new URL("/api/star", baseUrl), {
    method: "POST",
    headers: { Cookie: identity.cookie },
    body: "{}",
  });
  const { star: touchedStar } = await recheck.json();

  const html = await fetchHomeHtml(identity.cookie);
  expect(html).not.toContain(rawToken);
  expect(html.toLowerCase()).not.toContain("token_hash");
  // Nobody's last_seen_at is ever shown exactly, brightness is a bucket.
  expect(html).not.toContain(touchedStar.lastSeenAt);
  // The only timestamp the HTML ever embeds is the viewer's own createdAt
  // (in <time datetime>), so `other`'s createdAt can only coincide with it
  // textually, never be shown as other's data. Two real-clock requests can
  // land in the same millisecond, so skip the one case where that coincidence
  // is expected and legitimate.
  if (other.star.createdAt !== touchedStar.createdAt) {
    expect(html).not.toContain(other.star.createdAt);
  }
  // other.star.lastSeenAt is still its creation-time value (equal to its own
  // createdAt), so the same coincidental-collision guard applies here too.
  if (other.star.lastSeenAt !== touchedStar.createdAt) {
    expect(html).not.toContain(other.star.lastSeenAt);
  }
});

it("/api/here reports only stars created since the caller's last visit", async () => {
  const viewer = await createIdentity();

  // Reset the window: after this call, "since last visit" starts now.
  await fetch(new URL("/api/here", baseUrl), {
    method: "POST",
    headers: { Cookie: viewer.cookie },
    body: "{}",
  });

  const other = await createIdentity();

  const res = await fetch(new URL("/api/here", baseUrl), {
    method: "POST",
    headers: { Cookie: viewer.cookie },
    body: "{}",
  });
  const data = await res.json();
  expect(data.hasStar).toBe(true);
  expect(data.newStarIds).toContain(other.star.id);
  expect(data.newStarIds).not.toContain(viewer.star.id);
  expect(data.newCount).toBe(data.newStarIds.length);

  // The window has now advanced past `other`'s creation, so a third call
  // with nothing new in between reports nothing new.
  const again = await fetch(new URL("/api/here", baseUrl), {
    method: "POST",
    headers: { Cookie: viewer.cookie },
    body: "{}",
  });
  const dataAgain = await again.json();
  expect(dataAgain.newCount).toBe(0);
});

it("counts a star created in the same instant as the caller's last visit, never the caller's own", () => {
  // This does not rely on the real clock: two stars are written with the
  // identical ISO-millisecond created_at, so the tie reproduces every run
  // instead of only when two real requests happen to land in the same
  // millisecond. The window is measured against rowid (insertion order),
  // not created_at, specifically because rowid can never tie.
  const dir = mkdtempSync(join(tmpdir(), "overlap-db-"));
  const dbPath = join(dir, "stars.db");

  try {
    const db = openDb(dbPath);
    const tie = "2026-01-01T00:00:00.000Z";
    const viewer = createStar(db, { id: "viewer-star", tokenHash: "d".repeat(64), x: 0.1, y: 0.1, now: tie });
    const other = createStar(db, { id: "other-star", tokenHash: "e".repeat(64), x: 0.2, y: 0.2, now: tie });

    const ids = idsSeenSince(db, viewer.lastSeenSeq, viewer.id);
    expect(ids).toContain(other.id);
    expect(ids).not.toContain(viewer.id);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("never reports a star as new twice, even when its creation ties a later touch's own timestamp", () => {
  // A ">=" comparison against created_at fixes the tie above but creates a
  // different one: if another star's created_at happens to equal the exact
  // millisecond of the viewer's OWN later touch, that touch's timestamp
  // becomes the next call's lower bound too, and the star gets reported as
  // new a second time. This does not rely on the real clock either: every
  // write below shares the identical timestamp, so if rowid-based ordering
  // didn't disambiguate them, this would fail every run, not just sometimes.
  const dir = mkdtempSync(join(tmpdir(), "overlap-db-"));
  const dbPath = join(dir, "stars.db");

  try {
    const db = openDb(dbPath);
    const tie = "2026-01-01T00:00:00.000Z";
    const tokenHash = "f".repeat(64);
    const viewer = createStar(db, { id: "viewer-star-2", tokenHash, x: 0.1, y: 0.1, now: tie });

    const seen1 = touchSeen(db, tokenHash, tie)!;
    expect(idsSeenSince(db, seen1.previousLastSeenSeq, viewer.id)).toEqual([]);

    const other = createStar(db, { id: "other-star-2", tokenHash: "g".repeat(64), x: 0.2, y: 0.2, now: tie });

    const seen2 = touchSeen(db, tokenHash, tie)!;
    expect(idsSeenSince(db, seen2.previousLastSeenSeq, viewer.id)).toContain(other.id);

    // Nothing new has happened since seen2, so a third touch must not
    // re-report `other` just because its created_at ties with seen2's own
    // watermark timestamp.
    const seen3 = touchSeen(db, tokenHash, tie)!;
    expect(idsSeenSince(db, seen3.previousLastSeenSeq, viewer.id)).not.toContain(other.id);

    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("still reports a star as new even when a deleted row's rowid gets reused", () => {
  // SQLite assigns a new row's rowid as (current max rowid) + 1. Deleting the
  // row that currently holds the max rowid frees that exact value, so the
  // next inserted row can be assigned it back. A watermark stored as a bare
  // rowid snapshot can't tell a brand new star with a reused rowid apart from
  // the old, already-seen star that used to have it.
  const dir = mkdtempSync(join(tmpdir(), "overlap-db-"));
  const dbPath = join(dir, "stars.db");

  try {
    const db = openDb(dbPath);
    const now = "2026-01-01T00:00:00.000Z";
    const viewerHash = "k".repeat(64);
    const viewer = createStar(db, { id: "viewer-reuse", tokenHash: viewerHash, x: 0.1, y: 0.1, now });
    const first = createStar(db, { id: "first-newest", tokenHash: "l".repeat(64), x: 0.2, y: 0.2, now });

    // The visitor checks in while `first` is the newest star: their watermark
    // now covers it.
    const seen = touchSeen(db, viewerHash, now)!;
    expect(idsSeenSince(db, seen.previousLastSeenSeq, viewer.id)).toContain(first.id);
    const watermark = seen.star.lastSeenSeq;

    // `first` held the largest rowid, so deleting it frees that rowid value.
    db.prepare("DELETE FROM stars WHERE id = ?").run(first.id);
    const second = createStar(db, { id: "second-newest", tokenHash: "m".repeat(64), x: 0.3, y: 0.3, now });

    // `second` is a star the visitor has never seen, created after their
    // recorded watermark. It must be reported as new.
    expect(idsSeenSince(db, watermark, viewer.id)).toContain(second.id);

    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("the seq counter starts above a stale watermark left over from the old rowid bug, even once migration 003 introduces it", () => {
  // Before star_seq existed, a visitor's last_seen_seq could be set from
  // MAX(rowid) while many stars existed, then survive the deletion of all
  // of them, leaving it higher than the current MAX(rowid) among whatever
  // rows remain (exactly what the production deletion batch risked). This
  // simulates that stale state against only migrations 001+002, then runs
  // migration 003 for real and checks the new counter still starts above it.
  const dir = mkdtempSync(join(tmpdir(), "overlap-migrate-"));
  const dbPath = join(dir, "stars.db");
  const partialMigrationsDir = join(dir, "migrations");
  mkdirSync(partialMigrationsDir);
  for (const name of ["001_create_stars.sql", "002_add_last_seen_seq.sql"]) {
    cpSync(join(REAL_MIGRATIONS_DIR, name), join(partialMigrationsDir, name));
  }

  try {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    migrate(db, partialMigrationsDir);

    const now = "2026-01-01T00:00:00.000Z";
    for (let i = 1; i <= 5; i++) {
      db.prepare(
        `INSERT INTO stars (id, token_hash, x, y, created_at, updated_at, last_seen_at)
         VALUES (?, ?, 0.1, 0.1, ?, ?, ?)`,
      ).run(`star-${i}`, `h${i}`.padEnd(64, "0"), now, now, now);
    }
    // A visitor touched in while all 5 stars existed: their watermark became 5.
    db.prepare("UPDATE stars SET last_seen_seq = 5 WHERE id = 'star-1'").run();
    // Stars 2-5 (including the one that held rowid 5) are later deleted.
    db.prepare("DELETE FROM stars WHERE id != 'star-1'").run();

    const stale = db.prepare("SELECT last_seen_seq FROM stars WHERE id = 'star-1'").get() as {
      last_seen_seq: number;
    };
    // star-1's stored watermark (5) is now above the table's own current max
    // rowid (1) -- exactly the corrupt shape this check targets.
    expect(stale.last_seen_seq).toBeGreaterThan(1);

    migrate(db); // applies 003 for real, against the real migrations dir

    const counter = db.prepare("SELECT next_seq FROM star_seq").get() as { next_seq: number };
    const maxWatermark = db.prepare("SELECT MAX(last_seen_seq) AS m FROM stars").get() as { m: number };
    expect(counter.next_seq).toBeGreaterThan(maxWatermark.m);

    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("formats a star's date in the viewer's timezone, not the server's", () => {
  // 21:02 UTC on the 6th is already the morning of the 7th in Sydney
  // (UTC+11 in October). A server that formats in its own zone shows the
  // wrong day for an Australian viewer.
  expect(formatDateInZone("2026-10-06T21:02:15Z", "Australia/Sydney")).toBe("7 October 2026");
});

it("a star survives closing and reopening the database file", () => {
  const dir = mkdtempSync(join(tmpdir(), "overlap-db-"));
  const dbPath = join(dir, "stars.db");

  try {
    const db1 = openDb(dbPath);
    const tokenHash = "a".repeat(64);
    const now = new Date().toISOString();
    createStar(db1, { id: "star-1", tokenHash, x: 0.27, y: 0.81, now });
    db1.close();

    const db2 = openDb(dbPath);
    const star = getByHash(db2, tokenHash);
    expect(star?.id).toBe("star-1");
    expect(star?.x).toBe(0.27);
    expect(star?.y).toBe(0.81);

    // One row per migrations/*.sql file, each applied exactly once (not
    // reapplied on reopen).
    const applied = db2.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number };
    expect(applied.n).toBe(3);
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
