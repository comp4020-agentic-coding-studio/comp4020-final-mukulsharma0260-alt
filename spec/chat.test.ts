import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { COOKIE_NAME } from "../src/cookies.ts";

// Common Room chat (Phase 2 of ADR 0012's follow-on). Subject-room chat and
// its cross-room content-isolation gate are Phase 3; the room-scoping
// primitive itself is unit-tested directly in spec/chat-rooms.test.ts with
// real room keys (common, engineering), not exercised end to end here since
// only "common" is reachable through the API yet.

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
  dir = mkdtempSync(join(tmpdir(), "overlap-chat-"));
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
  throw new Error(`chat test server did not start:\n${output}`);
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

function cookieFrom(res: Response): string {
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

async function identityWithCallsign(callsign: string): Promise<{ cookie: string }> {
  const res = await fetch(new URL("/api/callsign", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callsign }),
  });
  if (!res.ok) throw new Error(`setup: could not set callsign ${callsign}: ${res.status} ${await res.text()}`);
  return { cookie: cookieFrom(res) };
}

function post(path: string, cookie: string | undefined, body: unknown): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function sendMessage(cookie: string | undefined, text: string, idempotencyKey = randomUUID()): Promise<Response> {
  return post("/api/message", cookie, { room: "common", body: text, idempotencyKey });
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

it("posting with no identity at all (no cookie) is refused", async () => {
  const res = await sendMessage(undefined, "hello");
  expect(res.status).toBe(400);
  const [line] = await auditLines((l) => l.includes("action=message.denied") && l.includes("reason=no_identity"));
  expect(field(line!, "result")).toBe("rejected");
});

it("posting with an identity but no callsign is refused with an honest reason", async () => {
  // An identity cookie with no callsign at all: created via /api/star, never
  // through /api/callsign, so this identity genuinely has none.
  const starRes = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = cookieFrom(starRes);
  const res = await sendMessage(cookie, "hello");
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/callsign/i);
  const [line] = await auditLines((l) => l.includes("action=message.denied") && l.includes("reason=no_callsign"));
  expect(field(line!, "result")).toBe("rejected");
});

it("a posted message persists and reaches a late-joining stream's sync snapshot", async () => {
  const { cookie } = await identityWithCallsign("persist-checker");
  const text = `hello-${randomUUID()}`;
  const res = await sendMessage(cookie, text);
  expect(res.status).toBe(201);

  const s = await openStream();
  try {
    const sync = await s.until((e) => e.type === "sync");
    const chat = sync.data.chat as Array<{ room: string; messages: Array<{ body: string; callsign: string }> }>;
    const common = chat.find((c) => c.room === "common");
    expect(common?.messages.some((m) => m.body === text && m.callsign === "persist-checker")).toBe(true);
  } finally {
    await s.close();
  }
});

it("a message posted by one identity reaches a second open stream live, without reload", async () => {
  const sender = await identityWithCallsign("live-sender");
  const watcher = await openStream();
  try {
    await watcher.until((e) => e.type === "sync");
    const text = `live-${randomUUID()}`;
    const res = await sendMessage(sender.cookie, text);
    expect(res.status).toBe(201);

    const created = await watcher.until((e) => e.type === "message.created");
    const message = created.data.message as { body: string; callsign: string };
    expect(message.body).toBe(text);
    expect(message.callsign).toBe("live-sender");
    expect(created.data.room).toBe("common");
  } finally {
    await watcher.close();
  }
});

it("message.created never carries an authorStarId or any other identity-linking field beyond the callsign", async () => {
  const sender = await identityWithCallsign("minimal-payload");
  const watcher = await openStream();
  try {
    await watcher.until((e) => e.type === "sync");
    await sendMessage(sender.cookie, "checking the payload shape");
    const created = await watcher.until((e) => e.type === "message.created");
    const message = created.data.message as Record<string, unknown>;
    expect(Object.keys(message).sort()).toEqual(["body", "callsign", "createdAt", "id"]);
  } finally {
    await watcher.close();
  }
});

it("a client cannot spoof another callsign: the server always uses its own lookup, never a callsign field in the body", async () => {
  const sender = await identityWithCallsign("real-sender");
  const res = await fetch(new URL("/api/message", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sender.cookie },
    body: JSON.stringify({ room: "common", body: "spoof attempt", idempotencyKey: randomUUID(), callsign: "someone-else" }),
  });
  expect(res.status).toBe(201);
  const { message } = await res.json();
  expect(message.callsign).toBe("real-sender");
  expect(output).not.toContain("someone-else");
});

it("rejects an empty body, a body over 280 characters, and an invalid room key", async () => {
  const { cookie } = await identityWithCallsign("validation-check");
  const empty = await sendMessage(cookie, "   ");
  expect(empty.status).toBe(400);

  const tooLong = await sendMessage(cookie, "a".repeat(281));
  expect(tooLong.status).toBe(400);

  const badRoom = await post("/api/message", cookie, { room: "not-a-real-room", body: "hi", idempotencyKey: randomUUID() });
  expect(badRoom.status).toBe(400);
});

it("rejects a missing or malformed idempotency key", async () => {
  const { cookie } = await identityWithCallsign("idempot-check");
  const missing = await post("/api/message", cookie, { room: "common", body: "hi" });
  expect(missing.status).toBe(400);

  const malformed = await post("/api/message", cookie, { room: "common", body: "hi", idempotencyKey: "has a space" });
  expect(malformed.status).toBe(400);

  const tooLong = await post("/api/message", cookie, { room: "common", body: "hi", idempotencyKey: "a".repeat(65) });
  expect(tooLong.status).toBe(400);
});

it("the server-side rate limit refuses a 4th send within 10 seconds", async () => {
  const { cookie } = await identityWithCallsign("rate-limit-check");
  for (let i = 0; i < 3; i++) {
    const res = await sendMessage(cookie, `message ${i}`);
    expect(res.status).toBe(201);
  }
  const fourth = await sendMessage(cookie, "message 4");
  expect(fourth.status).toBe(429);
  const [line] = await auditLines((l) => l.includes("action=message.denied") && l.includes("reason=rate_limited"));
  expect(field(line!, "result")).toBe("rejected");
});

it("the same idempotency key sent twice creates only one message", async () => {
  const { cookie } = await identityWithCallsign("duplicate-check");
  const key = randomUUID();
  const first = await sendMessage(cookie, "only once", key);
  expect(first.status).toBe(201);
  const { message: firstMessage } = await first.json();

  const second = await sendMessage(cookie, "only once", key);
  expect(second.status).toBe(200);
  const { message: secondMessage } = await second.json();
  expect(secondMessage.id).toBe(firstMessage.id);
});

it("a script-like body is stored and delivered verbatim, never interpreted or stripped server-side", async () => {
  const { cookie } = await identityWithCallsign("xss-checker");
  const payload = "<script>window.xssFired=true</script>";
  const res = await sendMessage(cookie, payload);
  expect(res.status).toBe(201);
  const { message } = await res.json();
  expect(message.body).toBe(payload);
  // Rendering it as text, never HTML, is the client's job (public/sky.js
  // uses .textContent, never innerHTML, for every dynamic value already);
  // this only proves the server does not mangle or reject it, since safety
  // here comes from render-time escaping, not server-side filtering.
});

it("no message body or secret ever appears in an audit line", async () => {
  const { cookie } = await identityWithCallsign("audit-secret");
  const token = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  const secretBody = "body-marker-must-not-be-logged";
  await sendMessage(cookie, secretBody);
  await auditLines((l) => l.includes("action=message.created"));
  expect(output).not.toContain(secretBody);
  expect(output).not.toContain(token);
});

it("a chat message's own broadcast is logged as a room-scoped send, not scope=all", async () => {
  const { cookie } = await identityWithCallsign("scope-check");
  await sendMessage(cookie, "checking scope");
  const [line] = await auditLines((l) => l.includes("action=state.broadcast") && l.includes("change=message.created"));
  expect(field(line!, "scope")).toBe("room");
  expect(field(line!, "room")).toBe("common");
});

it("two real browser identities exchange a live Common Room message end to end", async () => {
  const a = await identityWithCallsign("end-to-end-a");
  const b = await identityWithCallsign("end-to-end-b");
  const streamA = await openStream(a.cookie);
  const streamB = await openStream(b.cookie);
  try {
    await streamA.until((e) => e.type === "sync");
    await streamB.until((e) => e.type === "sync");

    const text = `e2e-${randomUUID()}`;
    const sent = await sendMessage(a.cookie, text);
    expect(sent.status).toBe(201);

    const seenByB = await streamB.until((e) => e.type === "message.created");
    expect((seenByB.data.message as { body: string }).body).toBe(text);
    expect((seenByB.data.message as { callsign: string }).callsign).toBe("end-to-end-a");
  } finally {
    await streamA.close();
    await streamB.close();
  }
});

it("a stream opened before any star exists still receives Common Room chat (a callsign alone is enough)", async () => {
  const { cookie } = await identityWithCallsign("no-star-listener");
  const s = await openStream(cookie);
  try {
    const sync = await s.until((e) => e.type === "sync");
    const chat = sync.data.chat as Array<{ room: string }>;
    expect(chat.some((c) => c.room === "common")).toBe(true);

    const sender = await identityWithCallsign("no-star-sender");
    const text = `no-star-${randomUUID()}`;
    await sendMessage(sender.cookie, text);
    const created = await s.until((e) => e.type === "message.created");
    expect((created.data.message as { body: string }).body).toBe(text);
  } finally {
    await s.close();
  }
});
