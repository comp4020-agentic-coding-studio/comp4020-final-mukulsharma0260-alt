import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { COOKIE_NAME } from "../src/cookies.ts";
import { createStar, getByHash, openDb } from "../src/db.ts";

const baseUrl = inject("baseUrl");

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie");
  if (!raw) throw new Error("expected a Set-Cookie header");
  return raw.split(";")[0]!;
}

async function createIdentity(): Promise<{
  cookie: string;
  star: { id: string; x: number; y: number; createdAt: string };
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

it("homepage HTML never exposes a cookie token, token hash, or exact timestamps", async () => {
  const identity = await createIdentity();
  const rawToken = identity.cookie.slice(COOKIE_NAME.length + 1);

  const recheck = await fetch(new URL("/api/star", baseUrl), {
    method: "POST",
    headers: { Cookie: identity.cookie },
    body: "{}",
  });
  const { star } = await recheck.json();

  const html = await fetchHomeHtml(identity.cookie);
  expect(html).not.toContain(rawToken);
  expect(html.toLowerCase()).not.toContain("token_hash");
  expect(html).not.toContain(star.createdAt);
  expect(html).not.toContain(star.lastSeenAt);
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

    const applied = db2.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number };
    expect(applied.n).toBe(1);
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
