import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

// Server-side posting permission for a constellation's conversation: the
// poster's own star must be genuinely, currently settled in that exact
// room. Pure HTTP, no SSE — the cross-room content-isolation gate (proven
// over real SSE streams) lives in spec/chat-subject-rooms.test.ts. This file
// spawns its own server, like spec/chat.test.ts and spec/constellations.test.ts.

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
  dir = mkdtempSync(join(tmpdir(), "overlap-chat-subject-perm-"));
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
  throw new Error(`chat subject-room permission test server did not start:\n${output}`);
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

it("a visitor settled in Science cannot post to Engineering", async () => {
  const scientist = await settledIdentity("scientist-b", "science");
  const res = await sendMessage(scientist.cookie, "engineering", "trying to post elsewhere");
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/settle your star in engineering/i);
  const [line] = await auditLines((l) => l.includes("action=message.denied") && l.includes("reason=not_settled"));
  expect(field(line!, "result")).toBe("rejected");
});

it("a visitor with a callsign but no star at all cannot post to any constellation", async () => {
  const res = await post("/api/callsign", undefined, { callsign: "no-star-at-all" });
  const cookie = cookieFrom(res);
  const posted = await sendMessage(cookie, "science", "no star yet");
  expect(posted.status).toBe(400);
  const body = await posted.json();
  expect(body.error).toMatch(/settle your star/i);
});

it("leaving a constellation immediately revokes posting permission for that room", async () => {
  const visitor = await settledIdentity("leaver-x", "engineering");
  const stillIn = await sendMessage(visitor.cookie, "engineering", "still here");
  expect(stillIn.status).toBe(201);

  const left = await post("/api/star/constellation", visitor.cookie, { leave: true });
  expect(left.status).toBe(200);

  const afterLeaving = await sendMessage(visitor.cookie, "engineering", "should be refused now");
  expect(afterLeaving.status).toBe(400);
});

it("invalid room keys and the non-existent slug-form key are rejected", async () => {
  const visitor = await settledIdentity("checker-x", "engineering");
  const badRoom = await sendMessage(visitor.cookie, "arts-society", "wrong key form");
  expect(badRoom.status).toBe(400);
  const notARoom = await sendMessage(visitor.cookie, "not-a-real-room", "nonsense");
  expect(notARoom.status).toBe(400);
});
