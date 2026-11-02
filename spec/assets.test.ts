import { readFileSync, statSync } from "node:fs";
import { expect, inject, it } from "vitest";

// Static files are streamed from disk, never read whole into memory per
// request: the 15 MB film is fetched by Safari in many byte ranges, and a
// whole-file synchronous read for each one stalls the one event loop that
// also serves /api and /events. These pin the HTTP contract the streaming
// must keep (ranges, 206, 416, types, caching), and that the handler no
// longer reads files synchronously.
const baseUrl = inject("baseUrl");
const FILM = "/assets/arrival-film-1080.mp4";
const filmPath = new URL(`../public${FILM}`, import.meta.url);
const size = statSync(filmPath).size;
const bytes = (start: number, end: number) => readFileSync(filmPath).subarray(start, end + 1);

it("the asset handler streams files instead of reading them whole and synchronously", () => {
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  const handler = server.slice(server.indexOf("Object.hasOwn(ASSETS, path)"), server.indexOf('path === "/events"'));
  expect(handler).not.toMatch(/readFileSync/);
  expect(server).toMatch(/createReadStream/);
});

it("a whole file comes back 200 with its length, type and immutable caching", async () => {
  const res = await fetch(new URL(FILM, baseUrl));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("video/mp4");
  expect(res.headers.get("accept-ranges")).toBe("bytes");
  expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect(Number(res.headers.get("content-length"))).toBe(size);
  expect((await res.arrayBuffer()).byteLength).toBe(size);
});

for (const [range, start, end] of [
  ["bytes=0-99", 0, 99],
  ["bytes=1000000-1999999", 1_000_000, 1_999_999],
  [`bytes=${size - 500}-`, size - 500, size - 1],
  ["bytes=-500", size - 500, size - 1],
  [`bytes=${size - 10}-${size + 5000}`, size - 10, size - 1],
] as const) {
  it(`range ${range} comes back 206 with exactly those bytes`, async () => {
    const res = await fetch(new URL(FILM, baseUrl), { headers: { Range: range } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes ${start}-${end}/${size}`);
    expect(Number(res.headers.get("content-length"))).toBe(end - start + 1);
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes(start, end))).toBe(true);
  });
}

it("a range past the end is 416 with the real size", async () => {
  const res = await fetch(new URL(FILM, baseUrl), { headers: { Range: `bytes=${size}-` } });
  expect(res.status).toBe(416);
  expect(res.headers.get("content-range")).toBe(`bytes */${size}`);
});

it("an unknown asset path is still not found, never a file outside public/assets", async () => {
  expect((await fetch(new URL("/assets/../src/server.ts", baseUrl))).status).toBe(404);
  expect((await fetch(new URL("/assets/nope.mp4", baseUrl))).status).toBe(404);
});
