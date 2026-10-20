import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { COOKIE_NAME, hashToken } from "../src/cookies.ts";

// The multi-user logging contract: every connection, departure, action,
// broadcast, refusal and snapshot is one safe line in the server's own
// output, so a live test can be narrated from `flyctl logs` alone. Like
// spec/audit.test.ts, this starts its own server and reads its real stdout.

let server: ChildProcess;
let baseUrl: string;
let dir: string;
let output = "";

async function freePort(): Promise<number> {
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
  dir = mkdtempSync(join(tmpdir(), "overlap-logs-"));
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
  throw new Error(`logging test server did not start:\n${output}`);
});

afterAll(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  output = "";
});

const lines = () => output.split("\n").filter((l) => l.startsWith("audit "));

async function waitFor(match: (line: string) => boolean, count = 1): Promise<string[]> {
  for (let i = 0; i < 100; i++) {
    const found = lines().filter(match);
    if (found.length >= count) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`expected ${count} matching line(s), got:\n${output}`);
}

// Server output arrives asynchronously: wait until a setup step's own line is
// in, then count afresh.
async function settle(match: (line: string) => boolean): Promise<void> {
  await waitFor(match);
  output = "";
}

function field(line: string, key: string): string | undefined {
  return line.match(new RegExp(`(?:^| )${key}=(\\S+)`))?.[1];
}

async function identity(body: unknown = {}): Promise<{ cookie: string; token: string; id: string }> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: JSON.stringify(body) });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const { star } = await res.json();
  return { cookie, token: decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1)), id: star.id };
}

function post(path: string, cookie: string | undefined, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function openStream(cookie?: string) {
  const controller = new AbortController();
  const res = await fetch(new URL("/events", baseUrl), { headers: cookie ? { Cookie: cookie } : {}, signal: controller.signal });
  const reader = res.body!.getReader();
  await reader.read();
  return {
    async close() {
      await reader.cancel().catch(() => {});
      controller.abort();
    },
  };
}

// ---- 1, 2 and 6: joining, leaving, and the snapshot ------------------------

it("opening the stream logs one snapshot for that viewer, and a star's first visible stream logs joining its room", async () => {
  const a = await identity({ constellation: "engineering" });
  await settle((l) => l.includes(`star:${a.id}`) && l.includes("action=star.created"));
  const s = await openStream(a.cookie);
  try {
    const [snap] = await waitFor((l) => l.includes("action=state.snapshot"));
    expect(field(snap!, "actor")).toBe(`star:${a.id}`);
    expect(field(snap!, "room")).toBe("engineering");
    expect(Number(field(snap!, "stars"))).toBeGreaterThanOrEqual(1);
    const [joined] = await waitFor((l) => l.includes("action=presence.joined"));
    expect(field(joined!, "actor")).toBe(`star:${a.id}`);
    expect(field(joined!, "room")).toBe("engineering");
    expect(field(joined!, "clients_in_room")).toBe("1");
  } finally {
    await s.close();
  }
});

it("a viewer with no star gets a snapshot logged as anonymous, and never joins", async () => {
  // The previous test's star leaving is logged asynchronously; wait for it
  // so it is not mistaken for this viewer.
  await new Promise((r) => setTimeout(r, 200));
  output = "";
  const s = await openStream();
  try {
    const [snap] = await waitFor((l) => l.includes("action=state.snapshot"));
    expect(field(snap!, "actor")).toBe("anonymous");
    expect(field(snap!, "room")).toBe("common");
    await new Promise((r) => setTimeout(r, 150));
    // An anonymous viewer has no star, so nothing can join or leave for it.
    expect(lines().filter((l) => l.includes("presence.") && l.includes("actor=anonymous"))).toEqual([]);
    expect(lines().filter((l) => l.includes("presence.joined"))).toEqual([]);
  } finally {
    await s.close();
  }
});

it("a second tab for the same star is a snapshot, not a second join; the last tab closing logs leaving", async () => {
  const a = await identity();
  await settle((l) => l.includes(`star:${a.id}`));
  const one = await openStream(a.cookie);
  const two = await openStream(a.cookie);
  await waitFor((l) => l.includes("action=state.snapshot") && l.includes(a.id), 2);
  expect(lines().filter((l) => l.includes("action=presence.joined") && l.includes(a.id))).toHaveLength(1);
  await one.close();
  await new Promise((r) => setTimeout(r, 150));
  expect(lines().filter((l) => l.includes("action=presence.left"))).toEqual([]);
  await two.close();
  const [left] = await waitFor((l) => l.includes("action=presence.left") && l.includes(a.id));
  expect(field(left!, "room")).toBe("common");
  // The server only sees a closed stream: a hidden tab, a closed tab and a
  // dropped network all look the same, so the reason says exactly that.
  expect(field(left!, "reason")).toBe("stream_closed");
  expect(field(left!, "clients_in_room")).toBe("0");
});

it("clients_in_room counts glowing stars in that room", async () => {
  const a = await identity({ constellation: "health" });
  const b = await identity({ constellation: "health" });
  await settle((l) => l.includes(`star:${b.id}`) && l.includes("action=star.created"));
  const sa = await openStream(a.cookie);
  await waitFor((l) => l.includes("action=presence.joined") && l.includes(a.id));
  const sb = await openStream(b.cookie);
  try {
    const [joined] = await waitFor((l) => l.includes("action=presence.joined") && l.includes(b.id));
    expect(field(joined!, "clients_in_room")).toBe("2");
  } finally {
    await sa.close();
    await sb.close();
  }
});

// ---- 3 and 4: an action received, and its broadcast --------------------------

it("an accepted move is logged with its room, then broadcast to every open stream", async () => {
  const a = await identity({ constellation: "science" });
  const s1 = await openStream(a.cookie);
  const s2 = await openStream();
  await settle((l) => l.includes("action=state.snapshot") && l.includes("actor=anonymous"));
  try {
    await post("/api/star/move", a.cookie, { x: 0.2, y: 0.2 });
    const [moved] = await waitFor((l) => l.includes("action=star.moved"));
    expect(field(moved!, "actor")).toBe(`star:${a.id}`);
    expect(field(moved!, "room")).toBe("science");
    expect(field(moved!, "result")).toBe("accepted");
    const [cast] = await waitFor((l) => l.includes("action=state.broadcast") && l.includes("change=star.moved"));
    expect(field(cast!, "room")).toBe("science");
    // Broadcasts go to every stream: the Common Room shows every star.
    expect(field(cast!, "scope")).toBe("all");
    expect(field(cast!, "recipients")).toBe("2");
    // Received before broadcast.
    expect(lines().indexOf(moved!)).toBeLessThan(lines().indexOf(cast!));
  } finally {
    await s1.close();
    await s2.close();
  }
});

it("creating a star and changing its constellation each log the action and its broadcast", async () => {
  const watcher = await openStream();
  await settle((l) => l.includes("action=state.snapshot"));
  try {
    const a = await identity();
    await waitFor((l) => l.includes("action=star.created") && l.includes(a.id));
    await waitFor((l) => l.includes("action=state.broadcast") && l.includes("change=star.created"));
    await post("/api/star/constellation", a.cookie, { constellation: "arts" });
    const [changed] = await waitFor((l) => l.includes("action=star.constellation_changed"));
    expect(field(changed!, "room")).toBe("arts");
    expect(field(changed!, "result")).toBe("accepted");
    const [cast] = await waitFor((l) => l.includes("action=state.broadcast") && l.includes("change=star.constellation"));
    expect(field(cast!, "room")).toBe("arts");
  } finally {
    await watcher.close();
  }
});

it("a change in live counts is logged as a presence broadcast", async () => {
  const watcher = await openStream();
  const a = await identity();
  await settle((l) => l.includes("action=star.created") && l.includes(a.id));
  const s = await openStream(a.cookie);
  try {
    const [cast] = await waitFor((l) => l.includes("action=state.broadcast") && l.includes("change=presence"));
    expect(field(cast!, "scope")).toBe("all");
    expect(Number(field(cast!, "recipients"))).toBe(2);
  } finally {
    await s.close();
    await watcher.close();
  }
});

// ---- 5: every refusal is logged ---------------------------------------------

it("every refused request is logged as rejected with a reason, never with the body", async () => {
  const a = await identity();
  await settle((l) => l.includes(`star:${a.id}`));
  const marker = "body-marker-7731";
  const cases: Array<[string, () => Promise<Response>, string, string]> = [
    ["move with no star", () => post("/api/star/move", undefined, { x: 0.5, y: 0.5, note: marker }), "star.move_denied", "no_owned_star"],
    ["move out of range", () => post("/api/star/move", a.cookie, { x: 2, y: 0.5, note: marker }), "star.move_denied", "invalid_position"],
    ["move with bad JSON", () => post("/api/star/move", a.cookie, `{"x":${marker}`), "star.move_denied", "invalid_json"],
    ["unknown constellation", () => post("/api/star/constellation", a.cookie, { constellation: marker }), "star.constellation_denied", "invalid_constellation"],
    ["create with bad position", () => post("/api/star", undefined, { x: -1, y: 0.5, note: marker }), "star.create_denied", "invalid_position"],
    ["create in unknown constellation", () => post("/api/star", undefined, { constellation: marker }), "star.create_denied", "invalid_constellation"],
    ["cross-site request", () => post("/api/star/move", a.cookie, { x: 0.5, y: 0.5 }, { Origin: "https://evil.example" }), "request.denied", "cross_origin"],
    ["listen with no glowing tab", () => post("/api/listening", a.cookie, { mode: "calm" }), "break.listening_denied", "not_glowing"],
    ["listen to an unknown mode", () => post("/api/listening", a.cookie, { mode: marker }), "break.listening_denied", "invalid_mode"],
  ];
  for (const [name, send, action, reason] of cases) {
    output = "";
    const res = await send();
    expect(res.status, name).toBeGreaterThanOrEqual(400);
    const [line] = await waitFor((l) => l.includes(`action=${action}`));
    expect(field(line!, "result"), name).toBe("rejected");
    expect(field(line!, "reason"), name).toBe(reason);
    expect(output, name).not.toContain(marker);
  }
});

it("a forged star id never names another star: the move is the sender's own", async () => {
  const a = await identity();
  const b = await identity();
  await settle((l) => l.includes(`star:${b.id}`) && l.includes("action=star.created"));
  await post("/api/star/move", b.cookie, { x: 0.3, y: 0.3, id: a.id, starId: a.id });
  const [moved] = await waitFor((l) => l.includes("action=star.moved"));
  expect(field(moved!, "actor")).toBe(`star:${b.id}`);
  expect(field(moved!, "target")).toBe(`star:${b.id}`);
  expect(output).not.toContain(a.id);
});

// ---- privacy ------------------------------------------------------------------

it("no presence, snapshot or broadcast line carries a token, hash, cookie, IP or timestamp", async () => {
  const a = await identity({ constellation: "business" });
  const s = await openStream(a.cookie);
  await post("/api/star/move", a.cookie, { x: 0.8, y: 0.2 });
  await post("/api/listening", a.cookie, { mode: "focus" });
  await s.close();
  await waitFor((l) => l.includes("action=presence.left") && l.includes(a.id));
  for (const secret of [a.token, hashToken(a.token), a.cookie]) expect(output).not.toContain(secret);
  expect(output).not.toMatch(/token|hash|cookie/i);
  expect(output).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b|::1|::ffff/);
  expect(output).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  for (const line of lines()) expect(line).toMatch(/^audit( [a-z_]+=[^\s=]+)+$/);
});

it("the audit helper accepts only the known fields, each in its narrow shape", async () => {
  const { auditLine } = await import("../src/audit.ts");
  const id = "95cf0640-bac7-4141-b269-587803a288ff";
  expect(auditLine({ action: "presence.joined", actor: { kind: "star", id }, room: "engineering", clientsInRoom: 2, result: "ok" }))
    .toBe(`audit action=presence.joined actor=star:${id} room=engineering clients_in_room=2 result=ok`);
  expect(auditLine({ action: "state.broadcast", actor: { kind: "anonymous" }, room: "common", change: "star.moved", scope: "all", recipients: 3, result: "sent" }))
    .toBe("audit action=state.broadcast actor=anonymous room=common change=star.moved scope=all recipients=3 result=sent");
  const hostile = "203.0.113.7";
  const line = auditLine({
    action: "presence.left",
    actor: { kind: "anonymous" },
    room: hostile as never,
    reason: `${hostile} {"x":1}`,
    change: "2026-10-18T09:00:00.000Z",
    scope: "all; rm",
    recipients: -1,
    stars: 1.5,
    clientsInRoom: Number.NaN,
    result: "rejected",
  });
  expect(line).toBe("audit action=presence.left actor=anonymous room=invalid reason=invalid change=invalid scope=invalid recipients=invalid stars=invalid clients_in_room=invalid result=rejected");
});
