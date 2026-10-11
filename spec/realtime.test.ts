import { expect, inject, it } from "vitest";
import { COOKIE_NAME, hashToken } from "../src/cookies.ts";

const baseUrl = inject("baseUrl");
// Other spec files create stars against the same server in parallel, and
// each creation is broadcast, so a stream can see unrelated events first.
const MAX_EVENTS = 50;
const READ_TIMEOUT_MS = 2000;

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie");
  if (!raw) throw new Error("expected a Set-Cookie header");
  return raw.split(";")[0]!;
}

type Identity = {
  cookie: string;
  star: { id: string; createdAt: string; updatedAt: string; lastSeenAt: string };
};

async function createIdentity(): Promise<Identity> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const { star } = await res.json();
  return { cookie: cookieFrom(res), star };
}

type StreamEvent = { type: string; data: Record<string, unknown>; raw: string };

async function openEventStream(cookie?: string): Promise<{
  response: Response;
  next: () => Promise<StreamEvent>;
  close: () => Promise<void>;
}> {
  const controller = new AbortController();
  const res = await fetch(new URL("/events", baseUrl), {
    headers: cookie ? { Cookie: cookie } : {},
    signal: controller.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return {
    response: res,
    async next(): Promise<StreamEvent> {
      for (;;) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary >= 0) {
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (message.startsWith(":")) continue;
          const type = message.match(/^event: (.+)$/m)?.[1];
          const json = message.match(/^data: (.+)$/m)?.[1];
          if (!type || !json) throw new Error(`malformed SSE event: ${message}`);
          return { type, data: JSON.parse(json) as Record<string, unknown>, raw: message };
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("timed out waiting for an SSE event")), READ_TIMEOUT_MS);
          }),
        ]).finally(() => clearTimeout(timer));
        if (chunk.done) throw new Error("SSE stream ended before its expected event");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    },
    async close(): Promise<void> {
      await reader.cancel();
      controller.abort();
    },
  };
}

async function nextMatching(
  stream: Awaited<ReturnType<typeof openEventStream>>,
  matches: (event: StreamEvent) => boolean,
): Promise<StreamEvent> {
  for (let i = 0; i < MAX_EVENTS; i++) {
    const event = await stream.next();
    if (matches(event)) return event;
  }
  throw new Error("did not receive the expected SSE event");
}

it("sends another browser's moved star over SSE within a second, without exposing timestamps", async () => {
  const a = await createIdentity();
  const b = await createIdentity();
  const bStream = await openEventStream(b.cookie);

  try {
    await nextMatching(bStream, (event) => event.type === "sync");
    const started = Date.now();
    const move = await fetch(new URL("/api/star/move", baseUrl), {
      method: "POST",
      headers: { Cookie: a.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ x: 0.77, y: 0.33 }),
    });
    expect(move.status).toBe(200);

    const event = await nextMatching(
      bStream,
      (received) => received.type === "star"
        && received.data.change === "moved"
        && (received.data.star as { id?: string }).id === a.star.id,
    );
    expect(Date.now() - started).toBeLessThan(1000);

    const star = event.data.star as Record<string, unknown>;
    expect(star).toMatchObject({ id: a.star.id, x: 0.77, y: 0.33 });
    expect(star).not.toHaveProperty("createdAt");
    expect(star).not.toHaveProperty("lastSeenAt");
  } finally {
    await bStream.close();
  }
});

it("shows a star as live only while one of its browser connections remains open", async () => {
  const a = await createIdentity();
  const b = await createIdentity();
  const aStream = await openEventStream(a.cookie);
  const bStream = await openEventStream(b.cookie);

  try {
    const joined = await nextMatching(
      bStream,
      (event) => event.type === "live"
        && Array.isArray(event.data.starIds)
        && event.data.starIds.includes(a.star.id)
        && event.data.starIds.includes(b.star.id),
    );
    expect(joined.data.starIds).toEqual(expect.arrayContaining([a.star.id, b.star.id]));

    await aStream.close();
    const left = await nextMatching(
      bStream,
      (event) => event.type === "live"
        && Array.isArray(event.data.starIds)
        && !event.data.starIds.includes(a.star.id)
        && event.data.starIds.includes(b.star.id),
    );
    expect(left.data.starIds).not.toContain(a.star.id);
  } finally {
    await aStream.close().catch(() => {});
    await bStream.close();
  }
});

it("the first event on a new stream is a sync snapshot, with or without a star", async () => {
  const a = await createIdentity();
  const withStar = await openEventStream(a.cookie);
  const anonymous = await openEventStream();
  try {
    expect((await withStar.next()).type).toBe("sync");
    expect((await anonymous.next()).type).toBe("sync");
  } finally {
    await withStar.close();
    await anonymous.close();
  }
});

it("a viewer without a star receives another browser's move within a second", async () => {
  const a = await createIdentity();
  const watcher = await openEventStream();
  try {
    await nextMatching(watcher, (event) => event.type === "sync");
    const started = Date.now();
    const move = await fetch(new URL("/api/star/move", baseUrl), {
      method: "POST",
      headers: { Cookie: a.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ x: 0.21, y: 0.64 }),
    });
    expect(move.status).toBe(200);

    const event = await nextMatching(
      watcher,
      (received) => received.type === "star"
        && received.data.change === "moved"
        && (received.data.star as { id?: string }).id === a.star.id,
    );
    expect(Date.now() - started).toBeLessThan(1000);
    expect(event.data.star).toMatchObject({ id: a.star.id, x: 0.21, y: 0.64 });
  } finally {
    await watcher.close();
  }
});

it("opening a stream writes nothing: no identity is minted and last_seen_at does not move", async () => {
  const anonymous = await openEventStream();
  try {
    expect(anonymous.response.headers.get("set-cookie")).toBeNull();
    await nextMatching(anonymous, (event) => event.type === "sync");
  } finally {
    await anonymous.close();
  }

  const a = await createIdentity();
  const stream = await openEventStream(a.cookie);
  try {
    await nextMatching(stream, (event) => event.type === "sync");
  } finally {
    await stream.close();
  }
  // /api/here reports last_seen_at as it was before this call. If opening
  // the stream had touched it, it would no longer equal createdAt.
  const here = await fetch(new URL("/api/here", baseUrl), {
    method: "POST",
    headers: { Cookie: a.cookie },
    body: "{}",
  });
  expect((await here.json()).previousLastSeenAt).toBe(a.star.createdAt);
});

it("no live event carries a cookie token, token hash, or exact timestamp", async () => {
  const a = await createIdentity();
  const token = a.cookie.slice(COOKIE_NAME.length + 1);
  const forbidden = [token, hashToken(token), a.star.createdAt, a.star.lastSeenAt];

  const watcher = await openEventStream();
  const own = await openEventStream(a.cookie);
  const seen: StreamEvent[] = [];
  const record = (event: StreamEvent) => {
    seen.push(event);
    return event;
  };
  try {
    record(await nextMatching(watcher, (e) => record(e).type === "sync"));
    record(await nextMatching(own, (e) => record(e).type === "sync"));

    const move = await fetch(new URL("/api/star/move", baseUrl), {
      method: "POST",
      headers: { Cookie: a.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ x: 0.5, y: 0.5 }),
    });
    forbidden.push((await move.json()).star.updatedAt);

    const isOwnMove = (e: StreamEvent) => record(e).type === "star"
      && e.data.change === "moved"
      && (e.data.star as { id?: string }).id === a.star.id;
    await nextMatching(watcher, isOwnMove);
    await nextMatching(own, isOwnMove);
  } finally {
    await watcher.close();
    await own.close();
  }

  expect(seen.map((e) => e.type)).toEqual(expect.arrayContaining(["sync", "star"]));
  for (const event of seen) {
    for (const secret of forbidden) expect(event.raw).not.toContain(secret);
    expect(event.raw).not.toMatch(/createdAt|updatedAt|lastSeenAt|token/i);
  }
});
