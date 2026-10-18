import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { COOKIE_NAME, hashToken } from "../src/cookies.ts";

// The audit trail is what the server prints, so these checks start their own
// throwaway server (temporary database, free port) and read its real stdout.
// The other spec files run against an app started elsewhere, whose output a
// test cannot see.

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
  dir = mkdtempSync(join(tmpdir(), "overlap-audit-"));
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
  throw new Error(`audit test server did not start:\n${output}`);
});

afterAll(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  output = "";
});

// Lines are written asynchronously to the pipe; wait for a match.
async function auditLines(match: (line: string) => boolean, count = 1): Promise<string[]> {
  for (let i = 0; i < 50; i++) {
    const lines = output.split("\n").filter((l) => l.startsWith("audit ") && match(l));
    if (lines.length >= count) return lines;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`expected ${count} matching audit line(s), got:\n${output}`);
}

// Server output arrives asynchronously, so a setup star's own "created" line
// can land after a naive reset and look like a stray log. Wait until every
// setup star has been logged, then start counting afresh.
async function settledReset(...ids: string[]): Promise<void> {
  await auditLines((l) => l.includes("action=star.created") && ids.some((id) => l.includes(id)), ids.length);
  output = "";
}

function field(line: string, key: string): string | undefined {
  return line.match(new RegExp(`(?:^| )${key}=(\\S+)`))?.[1];
}

async function createIdentity(): Promise<{ cookie: string; token: string; star: { id: string; x: number; y: number } }> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const { star } = await res.json();
  return { cookie, token: decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1)), star };
}

async function move(cookie: string | undefined, body: unknown): Promise<Response> {
  return fetch(new URL("/api/star/move", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

it("two cookies create two stars, each audited under its own public star id", async () => {
  const a = await createIdentity();
  const b = await createIdentity();
  expect(a.star.id).not.toBe(b.star.id);

  const lines = await auditLines((l) => l.includes("action=star.created"), 2);
  const actors = lines.map((l) => field(l, "actor"));
  expect(actors).toEqual(expect.arrayContaining([`star:${a.star.id}`, `star:${b.star.id}`]));
  for (const line of lines) expect(field(line, "result")).toBe("created");
});

it("B sending A's star id moves only B's star, and the log names B as actor and target", async () => {
  const a = await createIdentity();
  const b = await createIdentity();
  await settledReset(a.star.id, b.star.id);

  const res = await move(b.cookie, { x: 0.11, y: 0.22, starId: a.star.id, id: a.star.id, target: a.star.id });
  expect(res.status).toBe(200);
  const { star: moved } = await res.json();
  expect(moved.id).toBe(b.star.id);

  // A's stored position is untouched: re-read it as A.
  const again = await fetch(new URL("/api/star", baseUrl), { method: "POST", headers: { Cookie: a.cookie }, body: "{}" });
  const { star: aAfter } = await again.json();
  expect([aAfter.x, aAfter.y]).toEqual([a.star.x, a.star.y]);

  const [line] = await auditLines((l) => l.includes("action=star.moved"));
  expect(field(line!, "actor")).toBe(`star:${b.star.id}`);
  expect(field(line!, "target")).toBe(`star:${b.star.id}`);
  expect(field(line!, "result")).toBe("ok");
  // The untrusted body id appears nowhere in the audit trail.
  expect(output).not.toContain(a.star.id);
});

it("a move with no star of its own is denied, and logged as an anonymous denial", async () => {
  const a = await createIdentity();
  await settledReset(a.star.id);

  const res = await move(undefined, { x: 0.5, y: 0.5, starId: a.star.id });
  expect(res.status).toBe(400);

  const [line] = await auditLines((l) => l.includes("action=star.move_denied"));
  expect(field(line!, "actor")).toBe("anonymous");
  expect(field(line!, "result")).toBe("no_owned_star");
  expect(line).not.toContain(a.star.id);
});

it("a check-in is audited under the checking-in star", async () => {
  const a = await createIdentity();
  await settledReset(a.star.id);
  await fetch(new URL("/api/here", baseUrl), { method: "POST", headers: { Cookie: a.cookie }, body: "{}" });
  const [line] = await auditLines((l) => l.includes("action=presence.checked_in"));
  expect(field(line!, "actor")).toBe(`star:${a.star.id}`);
  expect(field(line!, "result")).toBe("ok");
});

it("audit output never contains a token, token hash, cookie, IP, body or timestamp", async () => {
  const a = await createIdentity();
  const b = await createIdentity();
  const marker = "body-marker-must-not-be-logged";
  await move(a.cookie, { x: 0.3, y: 0.4, note: marker });
  await move(b.cookie, { x: 0.6, y: 0.7, starId: a.star.id, note: marker });
  await move(undefined, { x: 0.1, y: 0.1, note: marker });
  await fetch(new URL("/api/here", baseUrl), { method: "POST", headers: { Cookie: a.cookie }, body: "{}" });
  await auditLines((l) => l.includes("action="), 6);

  for (const secret of [a.token, b.token, hashToken(a.token), hashToken(b.token), a.cookie, b.cookie]) {
    expect(output).not.toContain(secret);
  }
  expect(output).not.toMatch(/set-cookie|overlap_id|token|hash|cookie/i);
  expect(output).not.toContain(marker);
  expect(output).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b|::1|::ffff/);
  // No exact times either: the platform stamps each log line itself.
  expect(output).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
});

it("audit lines are single short key=value lines, one per action", async () => {
  await createIdentity();
  const [line] = await auditLines((l) => l.includes("action=star.created"));
  expect(line).toMatch(/^audit( [a-z_]+=[^\s=]+)+$/);
  expect(line!.length).toBeLessThan(160);
});

it("ordinary page loads and live streams write no audit lines", async () => {
  const a = await createIdentity();
  await settledReset(a.star.id);
  await (await fetch(new URL("/", baseUrl), { headers: { Cookie: a.cookie } })).text();
  await (await fetch(new URL("/readme/", baseUrl))).text();
  const controller = new AbortController();
  const stream = await fetch(new URL("/events", baseUrl), { headers: { Cookie: a.cookie }, signal: controller.signal });
  const reader = stream.body!.getReader();
  await reader.read();
  await reader.cancel();
  controller.abort();
  await new Promise((r) => setTimeout(r, 200));
  expect(output.split("\n").filter((l) => l.startsWith("audit "))).toEqual([]);
});

it("the audit helper refuses to print anything but safe labels, whatever it is handed", async () => {
  const { auditLine } = await import("../src/audit.ts");
  const token = "s3cr3t-Token_abc123";
  const hostile = [
    token,
    hashToken(token),
    `overlap_id=${token}`,
    "203.0.113.7",
    '{"x":0.5,"note":"body"}',
    "2026-10-18T09:00:00.000Z",
    "star:../../etc",
  ];
  for (const value of hostile) {
    const line = auditLine({
      action: value,
      actor: { kind: "star", id: value },
      target: { kind: "anonymous", ...({ id: value } as object) } as never,
      result: value,
    });
    expect(line).not.toContain(value);
    expect(line).toBe("audit action=invalid actor=anonymous target=anonymous result=invalid");
  }
  // A real public star id passes through unchanged.
  const id = "95cf0640-bac7-4141-b269-587803a288ff";
  expect(auditLine({ action: "star.moved", actor: { kind: "star", id }, target: { kind: "star", id }, result: "ok" }))
    .toBe(`audit action=star.moved actor=star:${id} target=star:${id} result=ok`);
});
