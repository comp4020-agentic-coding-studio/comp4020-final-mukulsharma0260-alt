import { expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie");
  if (!raw) throw new Error("expected a Set-Cookie header");
  return raw.split(";")[0]!;
}

async function createIdentity(): Promise<{ cookie: string; star: { id: string } }> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const { star } = await res.json();
  return { cookie: cookieFrom(res), star };
}

type StreamEvent = { type: string; data: Record<string, unknown> };

async function openEventStream(cookie: string): Promise<{
  next: () => Promise<StreamEvent>;
  close: () => Promise<void>;
}> {
  const controller = new AbortController();
  const res = await fetch(new URL("/events", baseUrl), {
    headers: { Cookie: cookie },
    signal: controller.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return {
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
          return { type, data: JSON.parse(json) as Record<string, unknown> };
        }
        const chunk = await reader.read();
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
  for (let i = 0; i < 8; i++) {
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
