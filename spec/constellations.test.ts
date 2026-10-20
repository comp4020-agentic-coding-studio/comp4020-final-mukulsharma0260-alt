import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { COOKIE_NAME, hashToken } from "../src/cookies.ts";
import { createStar, getByHash, openDb, setConstellation } from "../src/db.ts";
import { migrate } from "../src/migrate.ts";

// Real constellations: a star belongs to at most one of five fixed study
// areas, its owner (and only its owner) chooses which, and live counts per
// area come from open, visible streams. This file runs its own server, so it
// can read the audit log and count streams without other files' traffic.

const REAL_MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));
const AREAS = ["science", "engineering", "business", "health", "arts"];

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
  dir = mkdtempSync(join(tmpdir(), "overlap-cst-"));
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
  throw new Error(`constellation test server did not start:\n${output}`);
});

afterAll(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  output = "";
});

async function createIdentity(): Promise<{ cookie: string; token: string; id: string }> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const { star } = await res.json();
  return { cookie, token: decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1)), id: star.id };
}

function choose(cookie: string | undefined, body: unknown): Promise<Response> {
  return fetch(new URL("/api/star/constellation", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

type StreamEvent = { type: string; data: Record<string, unknown>; raw: string };

async function openStream(cookie?: string) {
  const controller = new AbortController();
  const res = await fetch(new URL("/events", baseUrl), { headers: cookie ? { Cookie: cookie } : {}, signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const next = async (): Promise<StreamEvent> => {
    for (;;) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary >= 0) {
        const message = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (message.startsWith(":")) continue;
        const type = message.match(/^event: (.+)$/m)![1]!;
        return { type, data: JSON.parse(message.match(/^data: (.+)$/m)![1]!), raw: message };
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timed out waiting for an SSE event")), 2000); }),
      ]).finally(() => clearTimeout(timer));
      if (chunk.done) throw new Error("stream ended");
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
  return {
    next,
    async until(match: (e: StreamEvent) => boolean): Promise<StreamEvent> {
      for (let i = 0; i < 50; i++) {
        const e = await next();
        if (match(e)) return e;
      }
      throw new Error("expected event never arrived");
    },
    async close() {
      await reader.cancel().catch(() => {});
      controller.abort();
    },
  };
}

const counts = (e: StreamEvent) => e.data.liveByConstellation as Record<string, number> | undefined;

async function auditLines(match: (line: string) => boolean, count = 1): Promise<string[]> {
  for (let i = 0; i < 50; i++) {
    const lines = output.split("\n").filter((l) => l.startsWith("audit ") && match(l));
    if (lines.length >= count) return lines;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`expected ${count} matching audit line(s), got:\n${output}`);
}

it("migration 004 keeps every existing star, and leaves each one unsettled", () => {
  const tmp = mkdtempSync(join(tmpdir(), "overlap-mig-"));
  const migrations = join(tmp, "migrations");
  try {
    mkdirSync(migrations);
    for (const f of ["001_create_stars.sql", "002_add_last_seen_seq.sql", "003_add_star_seq.sql"]) {
      cpSync(join(REAL_MIGRATIONS_DIR, f), join(migrations, f));
    }
    const db = new DatabaseSync(join(tmp, "stars.db"));
    migrate(db, migrations);
    const now = new Date().toISOString();
    for (let i = 0; i < 3; i++) createStar(db, { id: `old-${i}`, tokenHash: `${i}`.repeat(64), x: 0.1 * (i + 1), y: 0.5, now });

    migrate(db, REAL_MIGRATIONS_DIR);
    const rows = db.prepare("SELECT id, x, y, constellation FROM stars ORDER BY id").all() as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      { id: "old-0", x: 0.1, y: 0.5, constellation: null },
      { id: "old-1", x: 0.2, y: 0.5, constellation: null },
      { id: "old-2", x: expect.closeTo(0.3, 10), y: 0.5, constellation: null },
    ]);
    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

it("the database itself refuses a constellation outside the five", () => {
  const tmp = mkdtempSync(join(tmpdir(), "overlap-chk-"));
  try {
    const db = openDb(join(tmp, "stars.db"));
    createStar(db, { id: "s", tokenHash: "c".repeat(64), x: 0.5, y: 0.5, now: new Date().toISOString() });
    expect(() => db.prepare("UPDATE stars SET constellation = 'astrology' WHERE id = 's'").run()).toThrow(/CHECK/);
    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

it("accepts each of the five constellations, and nothing else", async () => {
  const a = await createIdentity();
  for (const area of AREAS) {
    const res = await choose(a.cookie, { constellation: area });
    expect(res.status, area).toBe(200);
    expect((await res.json()).star.constellation).toBe(area);
  }
  for (const bad of ["astrology", "Science", "", " science", "room-1", null, 3, ["science"], { id: "science" }]) {
    const res = await choose(a.cookie, { constellation: bad });
    expect(res.status, JSON.stringify(bad)).toBe(400);
  }
  const res = await choose(a.cookie, { constellation: "arts" });
  expect((await res.json()).star.constellation).toBe("arts");
});

it("leaving sets the star back to unsettled", async () => {
  const a = await createIdentity();
  await choose(a.cookie, { constellation: "health" });
  const res = await choose(a.cookie, { constellation: null, leave: true });
  // null alone is refused above; leaving is its own explicit request.
  expect(res.status).toBe(200);
  expect((await res.json()).star.constellation).toBeNull();
});

it("a browser with no star cannot choose a constellation", async () => {
  const res = await choose(undefined, { constellation: "science" });
  expect(res.status).toBe(400);
  expect(res.headers.get("set-cookie")).toBeNull();
});

it("a second cookie sending the first star's id changes only its own star", async () => {
  const a = await createIdentity();
  const b = await createIdentity();
  await choose(a.cookie, { constellation: "science" });

  const res = await choose(b.cookie, { constellation: "business", starId: a.id, id: a.id });
  expect(res.status).toBe(200);
  expect((await res.json()).star.id).toBe(b.id);

  const aNow = await fetch(new URL("/api/star", baseUrl), { method: "POST", headers: { Cookie: a.cookie }, body: "{}" });
  expect((await aNow.json()).star.constellation).toBe("science");
});

it("a cross-origin request cannot change a constellation", async () => {
  const a = await createIdentity();
  const res = await fetch(new URL("/api/star/constellation", baseUrl), {
    method: "POST",
    headers: { Cookie: a.cookie, Origin: "https://evil.example", "Content-Type": "application/json" },
    body: JSON.stringify({ constellation: "science" }),
  });
  expect(res.status).toBe(403);
});

it("a constellation survives closing and reopening the database", () => {
  const tmp = mkdtempSync(join(tmpdir(), "overlap-reopen-"));
  const path = join(tmp, "stars.db");
  try {
    const db1 = openDb(path);
    createStar(db1, { id: "keep", tokenHash: "d".repeat(64), x: 0.4, y: 0.4, now: new Date().toISOString() });
    setConstellation(db1, "d".repeat(64), "engineering", new Date().toISOString());
    db1.close();
    const db2 = openDb(path);
    expect(getByHash(db2, "d".repeat(64))?.constellation).toBe("engineering");
    db2.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

it("the sync snapshot carries each star's constellation, the live and trace counts, and no secrets", async () => {
  const a = await createIdentity();
  await choose(a.cookie, { constellation: "engineering" });
  const own = await openStream(a.cookie);
  try {
    const sync = await own.until((e) => e.type === "sync");
    const star = (sync.data.stars as Array<Record<string, unknown>>).find((s) => s.id === a.id)!;
    expect(star.constellation).toBe("engineering");
    expect(Object.keys(star).sort()).toEqual(["brightness", "constellation", "id", "x", "y"]);
    expect(Object.keys(counts(sync)!).sort()).toEqual([...AREAS].sort());
    expect(counts(sync)!.engineering).toBeGreaterThanOrEqual(1);
    const traces = sync.data.tracesByConstellation as Record<string, number>;
    expect(traces.engineering).toBeGreaterThanOrEqual(1);
    expect(sync.data).toHaveProperty("unsettledTraces");
    for (const secret of [a.token, hashToken(a.token)]) expect(sync.raw).not.toContain(secret);
    expect(sync.raw).not.toMatch(/createdAt|updatedAt|lastSeenAt|token/i);
  } finally {
    await own.close();
  }
});

it("two browsers in different constellations each move the right live count, without a reload", async () => {
  const a = await createIdentity();
  const b = await createIdentity();
  const watcher = await openStream();
  const aTab = await openStream(a.cookie);
  const bTab = await openStream(b.cookie);
  try {
    const base = counts(await watcher.until((e) => e.type === "sync"))!;
    const started = Date.now();
    await choose(a.cookie, { constellation: "science" });
    await watcher.until((e) => e.type === "live" && counts(e)!.science === base.science + 1);
    await choose(b.cookie, { constellation: "health" });
    const both = await watcher.until((e) => e.type === "live" && counts(e)!.health === base.health + 1);
    expect(counts(both)!.science).toBe(base.science + 1);
    expect(Date.now() - started).toBeLessThan(1000);

    // Changing area moves the count from one constellation to the other.
    // The server sends the star event first (so other browsers can move the
    // star), then the new counts.
    await choose(a.cookie, { constellation: "health" });
    const starEvent = await watcher.until((e) => e.type === "star" && (e.data.star as { id: string }).id === a.id && e.data.change === "constellation");
    expect((starEvent.data.star as { constellation: string }).constellation).toBe("health");
    const moved = await watcher.until((e) => e.type === "live" && counts(e)!.health === base.health + 2);
    expect(counts(moved)!.science).toBe(base.science);
  } finally {
    await watcher.close();
    await aTab.close();
    await bTab.close();
  }
});

it("a closed or hidden tab drops out of its constellation's live count, and returning restores it", async () => {
  const a = await createIdentity();
  await choose(a.cookie, { constellation: "business" });
  const watcher = await openStream();
  try {
    const base = counts(await watcher.until((e) => e.type === "sync"))!.business!;
    let tab = await openStream(a.cookie);
    await watcher.until((e) => e.type === "live" && counts(e)!.business === base + 1);

    // A hidden tab closes its stream (client.test.ts); the server sees a close.
    await tab.close();
    await watcher.until((e) => e.type === "live" && counts(e)!.business === base);

    tab = await openStream(a.cookie);
    await watcher.until((e) => e.type === "live" && counts(e)!.business === base + 1);
    await tab.close();
  } finally {
    await watcher.close();
  }
});

it("a star with no constellation glows, but counts toward no constellation", async () => {
  const a = await createIdentity();
  const watcher = await openStream();
  try {
    const before = counts(await watcher.until((e) => e.type === "sync"))!;
    const tab = await openStream(a.cookie);
    const live = await watcher.until((e) => e.type === "live" && (e.data.starIds as string[]).includes(a.id));
    expect(counts(live)).toEqual(before);
    await tab.close();
  } finally {
    await watcher.close();
  }
});

it("choosing a constellation is audited under the public star id only", async () => {
  const a = await createIdentity();
  const marker = "body-marker-must-not-be-logged";
  await choose(a.cookie, { constellation: "engineering", note: marker });
  const [line] = await auditLines((l) => l.includes("action=star.constellation_changed"));
  expect(line).toBe(`audit action=star.constellation_changed actor=star:${a.id} target=star:${a.id} room=engineering result=accepted`);
  expect(output).not.toContain(marker);
});

it("refusals are audited without the body: no star is anonymous, a bad area names no value", async () => {
  const a = await createIdentity();
  await choose(undefined, { constellation: "science" });
  await choose(a.cookie, { constellation: "astrology-marker" });
  const [noStar] = await auditLines((l) => l.includes("action=star.constellation_denied") && l.includes("anonymous"));
  expect(noStar).toBe("audit action=star.constellation_denied actor=anonymous reason=no_owned_star result=rejected");
  const [bad] = await auditLines((l) => l.includes("action=star.constellation_denied") && l.includes(a.id));
  expect(bad).toBe(`audit action=star.constellation_denied actor=star:${a.id} reason=invalid_constellation result=rejected`);
  expect(output).not.toContain("astrology-marker");
});

it("constellation audit output never contains a token, hash, cookie, IP, body or timestamp", async () => {
  const a = await createIdentity();
  const b = await createIdentity();
  const marker = "secret-body-marker";
  await choose(a.cookie, { constellation: "arts", note: marker });
  await choose(b.cookie, { constellation: "science", starId: a.id, note: marker });
  await choose(b.cookie, { leave: true });
  await auditLines((l) => l.includes("action=star.constellation"), 3);
  for (const secret of [a.token, b.token, hashToken(a.token), hashToken(b.token), a.cookie, b.cookie]) {
    expect(output).not.toContain(secret);
  }
  expect(output).not.toContain(marker);
  expect(output).not.toMatch(/token|hash|cookie/i);
  expect(output).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b|::1|::ffff/);
  expect(output).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
});

it("the Common Room page shows real counts from the database, not invented ones", async () => {
  const a = await createIdentity();
  await choose(a.cookie, { constellation: "arts" });
  const html = await (await fetch(new URL("/", baseUrl))).text();
  expect(html).toContain("The Common Room");
  expect(html).not.toMatch(/simulated|prototype|Observatory/i);
  const db = new DatabaseSync(join(dir, "stars.db"), { readOnly: true });
  try {
    const arts = (db.prepare("SELECT COUNT(*) AS n FROM stars WHERE constellation = 'arts'").get() as { n: number }).n;
    const all = (db.prepare("SELECT COUNT(*) AS n FROM stars").get() as { n: number }).n;
    const trace = html.match(/data-region="arts"[^>]*data-traces="(\d+)"/)?.[1];
    expect(Number(trace)).toBe(arts);
    // Every real star is on the map, settled or not: one <g class="star"> each.
    expect((html.match(/<g class="star /g) ?? []).length).toBe(all);
    // An unsettled star is still drawn, with no constellation of its own.
    const plain = await createIdentity();
    const html2 = await (await fetch(new URL("/", baseUrl))).text();
    const tag = html2.match(new RegExp(`<g class="star[^"]*" data-id="${plain.id}"[^>]*>`))?.[0];
    expect(tag).toBeDefined();
    expect(tag).not.toContain("data-constellation");
  } finally {
    db.close();
  }
});

it("a visitor's own constellation is rendered on the page from the server, never from localStorage", async () => {
  const a = await createIdentity();
  await choose(a.cookie, { constellation: "health" });
  const html = await (await fetch(new URL("/", baseUrl), { headers: { Cookie: a.cookie } })).text();
  expect(html).toMatch(/<body[^>]*data-constellation="health"/);
  expect(html).toContain("Your star is in Health.");
  // Their star is on the map, inside Health's region, marked as theirs.
  const tag = html.match(new RegExp(`<g class="star[^"]* own" data-id="${a.id}"[^>]*>`))?.[0];
  expect(tag).toContain('data-constellation="health"');
  const x = Number(tag!.match(/data-x="([\d.]+)"/)![1]);
  const y = Number(tag!.match(/data-y="([\d.]+)"/)![1]);
  expect(inRegion("health", x, y)).toBe(true);
});

// ---- The shared map: a constellation is a real region of the Common Room ----

import { REGIONS, inRegion } from "../src/regions.ts";

async function placeAt(x: number, y: number): Promise<{ cookie: string; id: string }> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: JSON.stringify({ x, y }) });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  return { cookie, id: (await res.json()).star.id };
}

function move(cookie: string, body: unknown): Promise<Response> {
  return fetch(new URL("/api/star/move", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
}

it("the five regions sit inside the map and never overlap", () => {
  const ids = Object.keys(REGIONS);
  expect(ids).toEqual(AREAS);
  for (const id of ids) {
    const r = REGIONS[id as keyof typeof REGIONS];
    expect(r.x0).toBeGreaterThanOrEqual(0);
    expect(r.y0).toBeGreaterThanOrEqual(0);
    expect(r.x1).toBeLessThanOrEqual(1);
    expect(r.y1).toBeLessThanOrEqual(1);
    for (const other of ids.filter((o) => o !== id)) {
      const o = REGIONS[other as keyof typeof REGIONS];
      const apart = r.x1 <= o.x0 || o.x1 <= r.x0 || r.y1 <= o.y0 || o.y1 <= r.y0;
      expect(apart, `${id} overlaps ${other}`).toBe(true);
    }
  }
});

it("a star placed in the Common Room can be anywhere, and stays unsettled", async () => {
  const a = await placeAt(0.5, 0.5);
  const res = await move(a.cookie, { x: 0.02, y: 0.98 });
  const { star } = await res.json();
  expect([star.x, star.y, star.constellation]).toEqual([0.02, 0.98, null]);
});

it("settling in a constellation moves the server's copy of the star into that region", async () => {
  const a = await placeAt(0.5, 0.5);
  const { star } = await (await choose(a.cookie, { constellation: "engineering" })).json();
  expect(star.constellation).toBe("engineering");
  expect(inRegion("engineering", star.x, star.y)).toBe(true);
});

it("a star already inside the region keeps its exact position when it settles", async () => {
  const r = REGIONS.health;
  const x = (r.x0 + r.x1) / 2;
  const y = (r.y0 + r.y1) / 2;
  const a = await placeAt(x, y);
  const { star } = await (await choose(a.cookie, { constellation: "health" })).json();
  expect([star.x, star.y]).toEqual([x, y]);
});

it("while settled, a move outside the region is kept inside it by the server", async () => {
  const a = await placeAt(0.5, 0.5);
  await choose(a.cookie, { constellation: "science" });
  const { star } = await (await move(a.cookie, { x: 0.99, y: 0.99 })).json();
  expect(inRegion("science", star.x, star.y)).toBe(true);
  const db = new DatabaseSync(join(dir, "stars.db"), { readOnly: true });
  try {
    const row = db.prepare("SELECT x, y, constellation FROM stars WHERE id = ?").get(a.id) as { x: number; y: number; constellation: string };
    expect(row.constellation).toBe("science");
    expect(inRegion("science", row.x, row.y)).toBe(true);
  } finally {
    db.close();
  }
});

it("leaving a constellation returns the star to the Common Room where it stands", async () => {
  const a = await placeAt(0.5, 0.5);
  const settled = (await (await choose(a.cookie, { constellation: "business" })).json()).star;
  const left = (await (await choose(a.cookie, { leave: true })).json()).star;
  expect(left.constellation).toBeNull();
  expect([left.x, left.y]).toEqual([settled.x, settled.y]);
  const free = (await (await move(a.cookie, { x: 0.5, y: 0.5 })).json()).star;
  expect([free.x, free.y]).toEqual([0.5, 0.5]);
});

it("the moved position of a settling star reaches other browsers through /events", async () => {
  const a = await placeAt(0.5, 0.5);
  const watcher = await openStream();
  try {
    await watcher.until((e) => e.type === "sync");
    await choose(a.cookie, { constellation: "arts" });
    const e = await watcher.until((ev) => ev.type === "star" && (ev.data.star as { id: string }).id === a.id);
    const s = e.data.star as { x: number; y: number; constellation: string };
    expect(s.constellation).toBe("arts");
    expect(inRegion("arts", s.x, s.y)).toBe(true);
  } finally {
    await watcher.close();
  }
});

// ---- Joining a constellation with a first star ---------------------------

it("a first star can be created straight into a constellation, inside its region, as one star", async () => {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: JSON.stringify({ constellation: "engineering" }) });
  expect(res.status).toBe(201);
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const { star } = await res.json();
  expect(star.constellation).toBe("engineering");
  expect(inRegion("engineering", star.x, star.y)).toBe(true);
  // The same browser asking again gets the same one star back.
  const again = await (await fetch(new URL("/api/star", baseUrl), { method: "POST", headers: { Cookie: cookie }, body: JSON.stringify({ constellation: "health" }) })).json();
  expect(again.star.id).toBe(star.id);
  expect(again.star.constellation).toBe("engineering");
  const db = new DatabaseSync(join(dir, "stars.db"), { readOnly: true });
  try {
    const row = db.prepare("SELECT constellation FROM stars WHERE id = ?").get(star.id) as { constellation: string };
    expect(row.constellation).toBe("engineering");
  } finally {
    db.close();
  }
  await auditLines((l) => l.includes(`star:${star.id}`) && l.includes("action=star.created"));
});

it("a first star with an unknown constellation is refused and stores nothing", async () => {
  const before = (() => {
    const db = new DatabaseSync(join(dir, "stars.db"), { readOnly: true });
    try { return (db.prepare("SELECT COUNT(*) AS n FROM stars").get() as { n: number }).n; } finally { db.close(); }
  })();
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: JSON.stringify({ constellation: "astrology" }) });
  expect(res.status).toBe(400);
  expect(res.headers.get("set-cookie")).toBeNull();
  const db = new DatabaseSync(join(dir, "stars.db"), { readOnly: true });
  try {
    expect((db.prepare("SELECT COUNT(*) AS n FROM stars").get() as { n: number }).n).toBe(before);
  } finally {
    db.close();
  }
});

it("a star created into a constellation reaches other browsers through /events with its constellation", async () => {
  const watcher = await openStream();
  try {
    await watcher.until((e) => e.type === "sync");
    const { star } = await (await fetch(new URL("/api/star", baseUrl), { method: "POST", body: JSON.stringify({ constellation: "business" }) })).json();
    const e = await watcher.until((ev) => ev.type === "star" && (ev.data.star as { id: string }).id === star.id);
    expect((e.data.star as { constellation: string }).constellation).toBe("business");
  } finally {
    await watcher.close();
  }
});

// ---- Break: who is listening, from memory only ----------------------------

function listen(cookie: string | undefined, body: unknown): Promise<Response> {
  return fetch(new URL("/api/listening", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

const listening = (e: StreamEvent) => e.data.listeningByMode as Record<string, number> | undefined;

it("a glowing star that presses Play counts as listening to that mode, live, for every browser", async () => {
  const a = await createIdentity();
  const own = await openStream(a.cookie);
  const watcher = await openStream();
  try {
    await own.until((e) => e.type === "sync");
    const start = (await watcher.until((e) => e.type === "sync"));
    const base = listening(start)?.calm ?? 0;
    expect((await listen(a.cookie, { mode: "calm" })).status).toBe(200);
    const up = await watcher.until((e) => e.type === "live" && (listening(e)?.calm ?? 0) === base + 1);
    expect(listening(up)?.calm).toBe(base + 1);
    await listen(a.cookie, { mode: null });
    await watcher.until((e) => e.type === "live" && (listening(e)?.calm ?? 0) === base);
  } finally {
    await own.close();
    await watcher.close();
  }
});

it("closing or hiding the tab stops a star counting as listening", async () => {
  const a = await createIdentity();
  const own = await openStream(a.cookie);
  const watcher = await openStream();
  try {
    await own.until((e) => e.type === "sync");
    await watcher.until((e) => e.type === "sync");
    await listen(a.cookie, { mode: "focus" });
    await watcher.until((e) => e.type === "live" && (listening(e)?.focus ?? 0) >= 1);
    await own.close();
    await watcher.until((e) => e.type === "live" && (listening(e)?.focus ?? 0) === 0);
  } finally {
    await watcher.close();
  }
});

it("a star with no visible tab cannot count as listening", async () => {
  const a = await createIdentity();
  const res = await listen(a.cookie, { mode: "energy" });
  expect(res.status).toBe(409);
  const watcher = await openStream();
  try {
    const sync = await watcher.until((e) => e.type === "sync");
    expect(listening(sync)?.energy ?? 0).toBe(0);
  } finally {
    await watcher.close();
  }
});

it("listening refuses an unknown mode, a visitor with no star, and a cross-site request", async () => {
  const a = await createIdentity();
  const own = await openStream(a.cookie);
  try {
    await own.until((e) => e.type === "sync");
    expect((await listen(a.cookie, { mode: "skyfall" })).status).toBe(400);
    expect((await listen(undefined, { mode: "calm" })).status).toBe(400);
    const cross = await fetch(new URL("/api/listening", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: a.cookie, Origin: "https://evil.example" },
      body: JSON.stringify({ mode: "calm" }),
    });
    expect(cross.status).toBe(403);
  } finally {
    await own.close();
  }
});

it("listening is never written to SQLite", async () => {
  const a = await createIdentity();
  const own = await openStream(a.cookie);
  try {
    await own.until((e) => e.type === "sync");
    await listen(a.cookie, { mode: "night-walk" });
    const db = new DatabaseSync(join(dir, "stars.db"), { readOnly: true });
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
      expect(tables.map((t) => t.name).sort()).toEqual(["schema_migrations", "star_seq", "stars"].sort());
      const cols = (db.prepare("PRAGMA table_info(stars)").all() as Array<{ name: string }>).map((c) => c.name);
      for (const col of cols) expect(col).not.toMatch(/listen|mode|^lat|^lon|latitude|longitude|location/i);
    } finally {
      db.close();
    }
  } finally {
    await own.close();
  }
});

it("newcomers who join a constellation without tapping each get their own spot, never one shared point", async () => {
  const spots = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const { star } = await (await fetch(new URL("/api/star", baseUrl), { method: "POST", body: JSON.stringify({ constellation: "science" }) })).json();
    expect(inRegion("science", star.x, star.y)).toBe(true);
    spots.add(`${star.x},${star.y}`);
  }
  expect(spots.size).toBe(4);
});
