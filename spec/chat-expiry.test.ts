import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createMessage, openDb, setCallsign } from "../src/db.ts";
import type { Room } from "../src/audit.ts";

// Expiry's remaining two guarantees (the first — exclusion from every read
// path — is already covered directly in spec/message-storage.test.ts):
// eventual deletion, and a live message.expired event for connected
// visitors. Each test spawns its own server against a fresh DB file with a
// short EXPIRY_SWEEP_INTERVAL_MS, so the sweep fires within the test's own
// timeout rather than the real 60s default. Messages are always created
// with the server's fixed 24h expiry, so an already-expired row is seeded
// directly via src/db.ts against the same file the server reads — the same
// technique spec/stars.test.ts's restart test uses.

let server: ChildProcess | undefined;
let dir: string;
let dbPath: string;
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

async function startServer(sweepIntervalMs: number): Promise<void> {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  output = "";
  server = spawn(process.execPath, ["src/server.ts"], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, NODE_ENV: "test", EXPIRY_SWEEP_INTERVAL_MS: String(sweepIntervalMs) },
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
  throw new Error(`chat expiry test server did not start:\n${output}`);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "overlap-chat-expiry-"));
  dbPath = join(dir, "stars.db");
});

afterEach(() => {
  server?.kill();
  server = undefined;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function cookieFrom(res: Response): string {
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

function post(path: string, cookie: string | undefined, body: unknown): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// A real identity with a callsign and a star settled straight into a
// constellation, the same way spec/chat-subject-rooms.test.ts settles one.
async function settledIdentity(callsign: string, constellation: string): Promise<{ cookie: string }> {
  const callsignRes = await post("/api/callsign", undefined, { callsign });
  if (!callsignRes.ok) throw new Error(`setup: could not set callsign ${callsign}: ${callsignRes.status} ${await callsignRes.text()}`);
  const cookie = cookieFrom(callsignRes);
  const starRes = await post("/api/star", cookie, { constellation });
  if (!starRes.ok) throw new Error(`setup: could not settle star in ${constellation}: ${starRes.status} ${await starRes.text()}`);
  return { cookie };
}

type StreamEvent = { type: string; data: Record<string, unknown>; raw: string };

async function openStream(cookie?: string) {
  const controller = new AbortController();
  const res = await fetch(new URL("/events", baseUrl), { headers: cookie ? { Cookie: cookie } : {}, signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: StreamEvent[] = [];
  const next = async (): Promise<StreamEvent> => {
    for (;;) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary >= 0) {
        const message = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (message.startsWith(":")) continue;
        const type = message.match(/^event: (.+)$/m)![1]!;
        const e = { type, data: JSON.parse(message.match(/^data: (.+)$/m)![1]!), raw: message };
        events.push(e);
        return e;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timed out waiting for an SSE event")), 5000); }),
      ]).finally(() => clearTimeout(timer));
      if (chunk.done) throw new Error("stream ended");
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
  return {
    next,
    events,
    async until(match: (e: StreamEvent) => boolean): Promise<StreamEvent> {
      for (let i = 0; i < 100; i++) {
        const e = await next();
        if (match(e)) return e;
      }
      throw new Error("expected event never arrived");
    },
    // Drains whatever arrives within a short window, for proving absence:
    // the same technique spec/chat-subject-rooms.test.ts's gate test uses.
    async drain(ms: number): Promise<StreamEvent[]> {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        try {
          await Promise.race([
            next(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("drain timeout")), remaining)),
          ]);
        } catch {
          break;
        }
      }
      return events;
    },
    async close() {
      await reader.cancel().catch(() => {});
      controller.abort();
    },
  };
}

// Writes a callsign and an already-expired message directly into the DB
// file the (not-yet-started, or stopped) server will read — the same
// technique spec/stars.test.ts's restart-survival test uses for stars.
function seedExpiredMessage(tokenHash: string, callsign: string, id: string, room: Room = "common"): void {
  const db = openDb(dbPath);
  const past = new Date(Date.now() - 1000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  setCallsign(db, tokenHash, callsign, callsign, past, future);
  createMessage(db, { id, room, tokenHash, callsignSnapshot: callsign, body: "already expired before this server ever started", now: past, expiresAt: past });
  db.close();
}

it("guarantee 2: the periodic sweep actually deletes an expired message from storage", async () => {
  await startServer(200); // fast sweep for this test only
  seedExpiredMessage("a".repeat(64), "pre-expired-a", "pre-expired-msg-1");

  // The row exists in storage right after seeding (checked independently of
  // the server, direct against the file) but is already unreadable through
  // the API (guarantee 1, proven elsewhere) — this test is specifically
  // about the row being *deleted*, not merely filtered.
  await new Promise((r) => setTimeout(r, 600)); // let at least one sweep tick pass
  const db = openDb(dbPath);
  const row = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE id = ?").get("pre-expired-msg-1") as { n: number };
  db.close();
  expect(row.n).toBe(0);
});

it("guarantee 3: a connected visitor is told live when their room's message expires", async () => {
  await startServer(200);
  const res = await post("/api/callsign", undefined, { callsign: "live-watcher" });
  const cookie = cookieFrom(res);

  // Seed an expired message directly, bypassing the API (which can only
  // ever create a message with a fresh 24h expiry) so there is something
  // for the next sweep tick to find and announce.
  seedExpiredMessage("b".repeat(64), "pre-expired-b", "pre-expired-msg-2");

  const stream = await openStream(cookie);
  try {
    await stream.until((e) => e.type === "sync");
    const expired = await stream.until((e) => e.type === "message.expired" && (e.data.room as string) === "common");
    expect((expired.data.ids as string[]).includes("pre-expired-msg-2")).toBe(true);
  } finally {
    await stream.close();
  }
});

it("an expired Engineering message is announced only to eligible Engineering streams, never to Science", async () => {
  await startServer(200);
  const engineer = await settledIdentity("eng-watcher", "engineering");
  const scientist = await settledIdentity("sci-watcher", "science");

  seedExpiredMessage("d".repeat(64), "pre-expired-eng", "pre-expired-eng-msg", "engineering");

  const engineeringStream = await openStream(engineer.cookie);
  const scienceStream = await openStream(scientist.cookie);
  try {
    await engineeringStream.until((e) => e.type === "sync");
    await scienceStream.until((e) => e.type === "sync");

    // Positive: the Engineering stream is told.
    const expired = await engineeringStream.until((e) => e.type === "message.expired" && (e.data.room as string) === "engineering");
    expect((expired.data.ids as string[]).includes("pre-expired-eng-msg")).toBe(true);

    // Negative: the Science stream, given a generous real window to prove
    // absence rather than just not waiting long enough, must never receive
    // this event or the expired message's id anywhere in its raw frames.
    const scienceEvents = await scienceStream.drain(800);
    expect(scienceEvents.some((e) => e.type === "message.expired")).toBe(false);
    expect(scienceEvents.map((e) => e.raw).join("\n")).not.toContain("pre-expired-eng-msg");
  } finally {
    await engineeringStream.close();
    await scienceStream.close();
  }
});

it("expiry survives a restart: an expired message seeded before the server starts is absent from the very first snapshot", async () => {
  // No server running yet: seed directly against the file.
  seedExpiredMessage("c".repeat(64), "restart-survivor", "restart-expired-msg");

  await startServer(60_000); // sweep timing is irrelevant here: guarantee 1 (the read filter) is what this test proves
  const stream = await openStream();
  try {
    const sync = await stream.until((e) => e.type === "sync");
    const chat = sync.data.chat as Array<{ room: string; messages: Array<{ id: string }> }>;
    const common = chat.find((c) => c.room === "common");
    expect(common?.messages.some((m) => m.id === "restart-expired-msg")).toBe(false);
  } finally {
    await stream.close();
  }
});
