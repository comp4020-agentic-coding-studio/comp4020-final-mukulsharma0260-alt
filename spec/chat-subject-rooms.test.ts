import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

// Subject-room (constellation) chat, Phase 3 of ADR 0012's follow-on. The
// non-negotiable gate for this phase: two real settled identities, one in
// Engineering and one in Science, proving an Engineering message's content
// never reaches the Science stream's payload at all — not merely hidden in
// a UI. Server-side posting *permission* (HTTP only, no SSE) is covered in
// spec/chat-subject-permissions.test.ts; this file is specifically the
// real-SSE-stream-level checks. This file spawns its own server, like
// spec/chat.test.ts and spec/constellations.test.ts.

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
  dir = mkdtempSync(join(tmpdir(), "overlap-chat-subject-"));
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
  throw new Error(`chat subject-room test server did not start:\n${output}`);
});

afterAll(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  output = "";
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
// constellation, the same way a real visitor joining that constellation's
// view and placing a star there for the first time would.
async function settledIdentity(callsign: string, constellation: string): Promise<{ cookie: string; starId: string }> {
  const callsignRes = await post("/api/callsign", undefined, { callsign });
  if (!callsignRes.ok) throw new Error(`setup: could not set callsign ${callsign}: ${callsignRes.status} ${await callsignRes.text()}`);
  const cookie = cookieFrom(callsignRes);
  const starRes = await post("/api/star", cookie, { constellation });
  if (!starRes.ok) throw new Error(`setup: could not settle star in ${constellation}: ${starRes.status} ${await starRes.text()}`);
  const { star } = await starRes.json();
  return { cookie, starId: star.id };
}

function sendMessage(cookie: string | undefined, room: string, text: string, idempotencyKey = randomUUID()): Promise<Response> {
  return post("/api/message", cookie, { room, body: text, idempotencyKey });
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
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timed out waiting for an SSE event")), 2000); }),
      ]).finally(() => clearTimeout(timer));
      if (chunk.done) throw new Error("stream ended");
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
  return {
    next,
    events,
    async until(match: (e: StreamEvent) => boolean): Promise<StreamEvent> {
      for (let i = 0; i < 50; i++) {
        const e = await next();
        if (match(e)) return e;
      }
      throw new Error("expected event never arrived");
    },
    // Drains whatever arrives within a short window, for proving absence:
    // a positive "it arrived" check can use `until`, but proving something
    // never arrives needs a bounded wait instead of waiting forever.
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

it("THE GATE: an Engineering message's content never reaches a Science stream's payload at all", async () => {
  const engineer = await settledIdentity("engineer-x", "engineering");
  const scientist = await settledIdentity("scientist-y", "science");
  const scienceStream = await openStream(scientist.cookie);
  const engineeringStream = await openStream(engineer.cookie);
  try {
    await scienceStream.until((e) => e.type === "sync");
    await engineeringStream.until((e) => e.type === "sync");

    const secretText = `engineering-only-${randomUUID()}`;
    const sent = await sendMessage(engineer.cookie, "engineering", secretText);
    expect(sent.status).toBe(201);

    // Positive: the Engineering stream receives it.
    const seenByEngineer = await engineeringStream.until((e) => e.type === "message.created");
    expect((seenByEngineer.data.message as { body: string }).body).toBe(secretText);

    // Negative: the Science stream, given a generous real window to prove
    // absence rather than just not waiting long enough, must never receive
    // this event, and the text must never appear anywhere in its raw
    // frames — not filtered client-side, never sent to the wire at all.
    const scienceEvents = await scienceStream.drain(800);
    expect(scienceEvents.some((e) => e.type === "message.created")).toBe(false);
    expect(scienceEvents.map((e) => e.raw).join("\n")).not.toContain(secretText);
  } finally {
    await scienceStream.close();
    await engineeringStream.close();
  }
});

it("a visitor whose star is not settled anywhere receives no constellation chat in their sync snapshot", async () => {
  const unsettledRes = await post("/api/callsign", undefined, { callsign: "unsettled-x" });
  const cookie = cookieFrom(unsettledRes);
  const engineer = await settledIdentity("engineer-z", "engineering");
  await sendMessage(engineer.cookie, "engineering", "should not be visible");

  const stream = await openStream(cookie);
  try {
    const sync = await stream.until((e) => e.type === "sync");
    const chat = sync.data.chat as Array<{ room: string }>;
    expect(chat.map((c) => c.room)).toEqual(["common"]);
  } finally {
    await stream.close();
  }
});

it("a visitor settled in Engineering can post and read the Engineering conversation", async () => {
  const engineer = await settledIdentity("engineer-a", "engineering");
  const text = `hello-engineering-${randomUUID()}`;
  const sent = await sendMessage(engineer.cookie, "engineering", text);
  expect(sent.status).toBe(201);

  const stream = await openStream(engineer.cookie);
  try {
    const sync = await stream.until((e) => e.type === "sync");
    const chat = sync.data.chat as Array<{ room: string; messages: Array<{ body: string }> }>;
    const engineering = chat.find((c) => c.room === "engineering");
    expect(engineering?.messages.some((m) => m.body === text)).toBe(true);
  } finally {
    await stream.close();
  }
});

it("moving from Engineering to Science revokes Engineering posting and grants Science posting, without reconnecting", async () => {
  const visitor = await settledIdentity("mover-x", "engineering");
  const stream = await openStream(visitor.cookie);
  try {
    await stream.until((e) => e.type === "sync");

    await post("/api/star/constellation", visitor.cookie, { constellation: "science" });

    const deniedInEngineering = await sendMessage(visitor.cookie, "engineering", "no longer allowed");
    expect(deniedInEngineering.status).toBe(400);

    const text = `now-in-science-${randomUUID()}`;
    const allowedInScience = await sendMessage(visitor.cookie, "science", text);
    expect(allowedInScience.status).toBe(201);

    // The same, never-reconnected stream must now receive Science chat,
    // proving the membership recompute reached its already-open stream.
    const seen = await stream.until((e) => e.type === "message.created" && (e.data.room as string) === "science");
    expect((seen.data.message as { body: string }).body).toBe(text);
  } finally {
    await stream.close();
  }
});
