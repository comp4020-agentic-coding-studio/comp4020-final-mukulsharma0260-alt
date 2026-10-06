import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { COOKIE_NAME } from "../src/cookies.ts";
import { createStar, getByHash, idsSeenSince, openDb, touchSeen } from "../src/db.ts";
import { formatDateInZone } from "../src/render.ts";

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
  expect(html).not.toContain(other.star.createdAt);
  expect(html).not.toContain(other.star.lastSeenAt);
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
    expect(applied.n).toBe(2);
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
