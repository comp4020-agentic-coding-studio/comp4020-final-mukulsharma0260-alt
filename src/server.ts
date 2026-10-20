import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  COOKIE_NAME,
  generateToken,
  hashToken,
  parseCookies,
  serializeIdentityCookie,
} from "./cookies.ts";
import {
  CONSTELLATIONS,
  createStar,
  getByHash,
  getById,
  isConstellation,
  setConstellation,
  traceCounts,
  idsSeenSince,
  listAll,
  moveStar,
  openDb,
  touchSeen,
} from "./db.ts";
import type { Constellation, Star } from "./db.ts";
import { renderHomePage } from "./render.ts";
import { clampToRegion, settlePosition, spotInRegion } from "./regions.ts";
import { renderMarkdown } from "./markdown.ts";
import { oldLight } from "./brightness.ts";
import { ANONYMOUS, audit, starActor, type Room } from "./audit.ts";
import { BREAK_MODES, isBreakMode, type BreakMode } from "./break.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DB_PATH = process.env.DB_PATH ?? "/data/stars.db";
const IS_PROD = process.env.NODE_ENV === "production";
const MAX_BODY_BYTES = 10_000;

// The arrival artwork, served from an explicit allowlist rather than a
// directory, so a crafted path can never reach any other file. The PNG is
// only the fallback for browsers without WebP.
const ASSETS: Record<string, string> = {
  "/assets/arrival-galaxy-960.webp": "image/webp",
  "/assets/arrival-galaxy-1920.webp": "image/webp",
  "/assets/arrival-galaxy-v3.png": "image/png",
  "/assets/arrival-nebula-720.webm": "video/webm",
  "/assets/arrival-nebula-720.mp4": "video/mp4",
  "/assets/arrival-film-music.mp3": "audio/mpeg",
  "/assets/arrival-film-1080.webm": "video/webm",
  "/assets/arrival-film-1080.mp4": "video/mp4",
  ...Object.fromEntries(BREAK_MODES.map((m) => [m.src, "audio/mpeg"])),
};

const db = openDb(DB_PATH);

// The night sky has two kinds of state. Stars belong in SQLite because they
// are old light and must outlive a deploy. An open SSE connection belongs only
// in this process: it says that this browser is looking at the sky *now*, not
// that a human is physically present. A restart intentionally clears it.
const eventStreams = new Set<ServerResponse>();
const eventStreamsByStarId = new Map<string, Set<ServerResponse>>();
// Which Break mode a glowing star has pressed Play on. Memory only, like
// glowing itself: a star stops counting the moment its last visible stream
// closes, and a restart forgets everyone.
const listeningByStarId = new Map<string, BreakMode>();

function isUnitInterval(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
}

function randomUnit(): number {
  return Math.random();
}

// Same-origin check for state-changing requests: a cross-site page can still
// cause the browser to send the identity cookie, so a mismatched Origin is
// rejected before it reaches any handler. Requests with no Origin header
// (same-origin navigations and most non-browser clients) are allowed through.
function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined; // signals invalid JSON to the caller
  }
}

// Public shape of a star: the token hash never leaves the server.
// Safe to send to another browser. In particular, this leaves out exact
// timestamps: they are not needed to draw a star and would make the quiet sky
// unexpectedly reveal another visitor's history.
function publicStar(star: Star) {
  return {
    id: star.id,
    x: star.x,
    y: star.y,
    brightness: oldLight(new Date(star.lastSeenAt)),
    constellation: star.constellation,
  };
}

// A caller can receive their own timestamps; this keeps the existing welcome
// and persistence behaviour without making that data public to other clients.
function ownStar(star: Star) {
  return {
    id: star.id,
    x: star.x,
    y: star.y,
    constellation: star.constellation,
    createdAt: star.createdAt,
    updatedAt: star.updatedAt,
    lastSeenAt: star.lastSeenAt,
  };
}

function sendEvent(res: ServerResponse, event: string, body: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
}

function liveStarIds(): string[] {
  return [...eventStreamsByStarId.entries()]
    .filter(([, streams]) => streams.size > 0)
    .map(([starId]) => starId);
}

function broadcast(event: string, body: unknown): void {
  for (const stream of eventStreams) sendEvent(stream, event, body);
}

// The room a star belongs to, for the logs: its constellation, or the
// Common Room.
function roomOf(star: { constellation: Constellation | null } | undefined): Room {
  return star?.constellation ?? "common";
}

// Glowing stars in one room, counted from the open streams and each star's
// stored constellation, at the moment of logging.
function glowingIn(room: Room): number {
  const ids = liveStarIds();
  if (ids.length === 0) return 0;
  const rows = db
    .prepare(`SELECT constellation FROM stars WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as Array<{ constellation: string | null }>;
  return rows.filter((r) => (r.constellation ?? "common") === room).length;
}

// Live counts per constellation: the glowing stars (an open, visible stream)
// grouped by the area each has chosen. Each star's area is read from SQLite
// at the moment of counting, so a change of area is reflected at once, and
// a star that has chosen none glows without counting toward any area.
function liveByConstellation(): Record<Constellation, number> {
  const counts = Object.fromEntries(CONSTELLATIONS.map((c) => [c, 0])) as Record<Constellation, number>;
  const ids = liveStarIds();
  if (ids.length === 0) return counts;
  const rows = db
    .prepare(`SELECT constellation FROM stars WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as Array<{ constellation: string | null }>;
  for (const row of rows) if (isConstellation(row.constellation)) counts[row.constellation]++;
  return counts;
}

// Listeners per Break mode: only glowing stars can be counted, because a
// star leaves this map when its last visible stream closes.
function listeningByMode(): Record<BreakMode, number> {
  const counts = Object.fromEntries(BREAK_MODES.map((m) => [m.id, 0])) as Record<BreakMode, number>;
  for (const mode of listeningByStarId.values()) counts[mode]++;
  return counts;
}

function liveState() {
  const traces = traceCounts(db);
  return {
    starIds: liveStarIds(),
    liveByConstellation: liveByConstellation(),
    tracesByConstellation: traces.byConstellation,
    unsettledTraces: traces.unsettled,
    listeningByMode: listeningByMode(),
  };
}

// Every broadcast goes to every open stream, because the Common Room shows
// every star; the log says so (scope=all) and how many streams it reached.
function broadcastLiveStars(): void {
  broadcast("live", liveState());
  audit({ action: "state.broadcast", actor: ANONYMOUS, change: "presence", scope: "all", recipients: eventStreams.size, result: "sent" });
}

function broadcastStar(change: "created" | "moved" | "constellation", star: Star): void {
  broadcast("star", { change, star: publicStar(star) });
  audit({ action: "state.broadcast", actor: starActor(star.id), room: roomOf(star), change: `star.${change}`, scope: "all", recipients: eventStreams.size, result: "sent" });
}

// A refused request, logged with why and never with what it carried.
function deny(action: string, actor: string | undefined, reason: string): void {
  audit({ action, actor: actor ? starActor(actor) : ANONYMOUS, result: "rejected", reason });
}

function identityFromRequest(req: IncomingMessage): { token: string; star: Star } | undefined {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return undefined;
  const star = getByHash(db, hashToken(token));
  if (!star) return undefined;
  return { token, star };
}

function renderReadmePage(): string {
  const md = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const body = renderMarkdown(md);
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Overlap</title><style>body{max-width:40rem;margin:2rem auto;padding:0 1rem;font-family:system-ui,sans-serif;line-height:1.5}</style></head><body><main>${body}</main><p><a href="/">Back to the lounge</a></p></body></html>`;
}

async function handleCreateStar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const existing = identityFromRequest(req);
  if (existing) {
    sendJson(res, 200, { star: ownStar(existing.star) });
    return;
  }

  const body = await readJsonBody(req);
  if (body === undefined) {
    deny("star.create_denied", undefined, "invalid_json");
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  const b = body as Record<string, unknown>;

  let x: number;
  let y: number;
  const placed = !(b.x === undefined && b.y === undefined);
  if (!placed) {
    x = randomUnit();
    y = randomUnit();
  } else if (isUnitInterval(b.x) && isUnitInterval(b.y)) {
    x = b.x;
    y = b.y;
  } else {
    deny("star.create_denied", undefined, "invalid_position");
    sendJson(res, 400, { error: "x and y must be numbers between 0 and 1" });
    return;
  }
  // A first star may be placed straight into a constellation: the same
  // allowlist as choosing one later, and the same region rule.
  let constellation: Constellation | null = null;
  if (b.constellation !== undefined) {
    if (!isConstellation(b.constellation)) {
      deny("star.create_denied", undefined, "invalid_constellation");
      sendJson(res, 400, { error: `constellation must be one of: ${CONSTELLATIONS.join(", ")}` });
      return;
    }
    constellation = b.constellation;
  }

  const token = generateToken();
  const now = new Date().toISOString();
  const id = randomUUID();
  // A tap inside the region keeps its place; with no tap, the star gets its
  // own spot there, so newcomers never stack on one point.
  if (constellation) ({ x, y } = placed ? settlePosition(constellation, id, x, y) : spotInRegion(constellation, id));
  const star = createStar(db, { id, tokenHash: hashToken(token), x, y, now, constellation });

  res.setHeader("Set-Cookie", serializeIdentityCookie(token, IS_PROD));
  sendJson(res, 201, { star: ownStar(star) });
  audit({ action: "star.created", actor: starActor(star.id), room: roomOf(star), result: "accepted" });
  broadcastStar("created", star);
  if (constellation) broadcastLiveStars();
}

async function handleMoveStar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const identity = identityFromRequest(req);
  if (!identity) {
    deny("star.move_denied", undefined, "no_owned_star");
    sendJson(res, 400, { error: "no star to move" });
    return;
  }

  const body = await readJsonBody(req);
  if (body === undefined) {
    deny("star.move_denied", identity.star.id, "invalid_json");
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  const b = body as Record<string, unknown>;

  if (!isUnitInterval(b.x) || !isUnitInterval(b.y)) {
    deny("star.move_denied", identity.star.id, "invalid_position");
    sendJson(res, 400, { error: "x and y must be numbers between 0 and 1" });
    return;
  }

  // A settled star stays inside its constellation's region on the shared
  // map; an unsettled star may go anywhere in the Common Room.
  const area = identity.star.constellation;
  const { x, y } = area ? clampToRegion(area, b.x, b.y) : { x: b.x, y: b.y };
  const now = new Date().toISOString();
  const star = moveStar(db, hashToken(identity.token), x, y, now)!;
  sendJson(res, 200, { star: ownStar(star) });
  // Actor and target are both the star the cookie resolved to. Any star id
  // in the body is ignored, so it can never appear here.
  audit({ action: "star.moved", actor: starActor(star.id), target: starActor(star.id), room: roomOf(star), result: "accepted" });
  broadcastStar("moved", star);
}

// A visitor settles their own star into a constellation, or leaves it with
// { leave: true }. Like a move, the star comes only from the cookie: any star
// id in the body is ignored. The value must be one of the five; anything else
// is refused and stores nothing.
async function handleChooseConstellation(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const identity = identityFromRequest(req);
  if (!identity) {
    deny("star.constellation_denied", undefined, "no_owned_star");
    sendJson(res, 400, { error: "no star to settle" });
    return;
  }

  const body = await readJsonBody(req);
  if (body === undefined) {
    deny("star.constellation_denied", identity.star.id, "invalid_json");
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  const b = body as Record<string, unknown>;

  let next: Constellation | null;
  if (b.leave === true) {
    next = null;
  } else if (isConstellation(b.constellation)) {
    next = b.constellation;
  } else {
    deny("star.constellation_denied", identity.star.id, "invalid_constellation");
    sendJson(res, 400, { error: `constellation must be one of: ${CONSTELLATIONS.join(", ")}` });
    return;
  }

  // Settling moves the star into that constellation's region (keeping its
  // place if it is already inside). Leaving keeps it where it stands, now
  // free in the Common Room.
  const current = identity.star;
  const position = next ? settlePosition(next, current.id, current.x, current.y) : undefined;
  const star = setConstellation(db, hashToken(identity.token), next, new Date().toISOString(), position)!;
  sendJson(res, 200, { star: ownStar(star) });
  audit({
    action: next ? "star.constellation_changed" : "star.constellation_left",
    actor: starActor(star.id),
    target: starActor(star.id),
    room: roomOf(star),
    result: "accepted",
  });
  broadcastStar("constellation", star);
  broadcastLiveStars();
}

// A glowing star says which Break mode it pressed Play on, or { mode: null }
// when it pauses or stops. Only a star with an open, visible stream can be
// counted, so the count is never more than the glowing stars. Nothing is
// written to SQLite.
async function handleListening(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const identity = identityFromRequest(req);
  if (!identity) {
    deny("break.listening_denied", undefined, "no_owned_star");
    sendJson(res, 400, { error: "no star" });
    return;
  }
  const body = await readJsonBody(req);
  if (body === undefined) {
    deny("break.listening_denied", identity.star.id, "invalid_json");
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  const b = body as Record<string, unknown>;
  if (b.mode !== null && !isBreakMode(b.mode)) {
    deny("break.listening_denied", identity.star.id, "invalid_mode");
    sendJson(res, 400, { error: `mode must be null or one of: ${BREAK_MODES.map((m) => m.id).join(", ")}` });
    return;
  }
  const id = identity.star.id;
  if (b.mode !== null && !(eventStreamsByStarId.get(id)?.size)) {
    deny("break.listening_denied", id, "not_glowing");
    sendJson(res, 409, { error: "only a glowing star can listen" });
    return;
  }
  const before = listeningByStarId.get(id) ?? null;
  if (b.mode === null) listeningByStarId.delete(id);
  else listeningByStarId.set(id, b.mode);
  sendJson(res, 200, { mode: b.mode });
  if (before !== b.mode) {
    audit({ action: b.mode ? "break.listening" : "break.stopped", actor: starActor(id), room: roomOf(identity.star), reason: b.mode ?? "stopped", result: "accepted" });
    broadcastLiveStars();
  }
}

function handleHere(req: IncomingMessage, res: ServerResponse): void {
  const identity = identityFromRequest(req);
  if (!identity) {
    sendJson(res, 200, { hasStar: false });
    return;
  }

  const now = new Date().toISOString();
  const result = touchSeen(db, hashToken(identity.token), now)!;
  const newStarIds = idsSeenSince(db, result.previousLastSeenSeq, result.star.id);
  audit({ action: "presence.checked_in", actor: starActor(result.star.id), result: "ok" });
  sendJson(res, 200, {
    hasStar: true,
    newStarIds,
    newCount: newStarIds.length,
    // The caller's own previous visit time — not another visitor's — so this
    // is not the "other people's exact timestamps" the rules forbid exposing.
    previousLastSeenAt: result.previousLastSeenAt,
  });
}

function handleEvents(req: IncomingMessage, res: ServerResponse): void {
  const identity = identityFromRequest(req);
  const starId = identity?.star.id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let wasOffline = false;
  if (starId) {
    const streams = eventStreamsByStarId.get(starId) ?? new Set<ServerResponse>();
    wasOffline = streams.size === 0;
    streams.add(res);
    eventStreamsByStarId.set(starId, streams);
  }

  // The snapshot goes out first, then this stream joins the broadcast set.
  // All of this is synchronous, so no event can fall between the two, and
  // the snapshot already includes the live state this stream contributes.
  const { starIds, ...counts } = liveState();
  const stars = listAll(db).map(publicStar);
  sendEvent(res, "sync", {
    stars,
    liveStarIds: starIds,
    ...counts,
  });
  const room = roomOf(identity?.star);
  audit({ action: "state.snapshot", actor: starId ? starActor(starId) : ANONYMOUS, room, stars: stars.length, result: "sent" });
  eventStreams.add(res);
  if (wasOffline && starId) {
    audit({ action: "presence.joined", actor: starActor(starId), room, clientsInRoom: glowingIn(room), result: "ok" });
    broadcastLiveStars();
  }

  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(": keep-alive\n\n");
  }, 15_000);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    eventStreams.delete(res);
    if (!starId) return;
    const streams = eventStreamsByStarId.get(starId);
    if (!streams) return;
    streams.delete(res);
    if (streams.size > 0) return;
    eventStreamsByStarId.delete(starId);
    listeningByStarId.delete(starId);
    // The star's room now, which may differ from when it joined. The server
    // only sees the stream close: a hidden tab, a closed tab, a dropped
    // network and a restart all look the same. The star itself stays.
    const leftRoom = roomOf(getById(db, starId));
    audit({ action: "presence.left", actor: starActor(starId), room: leftRoom, reason: "stream_closed", clientsInRoom: glowingIn(leftRoom), result: "ok" });
    broadcastLiveStars();
  };
  req.on("close", close);
  res.on("close", close);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (req.method === "GET" && path === "/") {
      const identity = identityFromRequest(req);
      const stars = listAll(db);
      sendHtml(res, 200, renderHomePage(stars, identity?.star.id, new Date(), traceCounts(db), liveStarIds()));
    } else if (req.method === "GET" && path === "/readme/") {
      sendHtml(res, 200, renderReadmePage());
    } else if (req.method === "GET" && path === "/sky.js") {
      const js = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      res.end(js);
    } else if (req.method === "GET" && Object.hasOwn(ASSETS, path)) {
      const asset = readFileSync(new URL(`../public${path}`, import.meta.url));
      const headers = {
        "Content-Type": ASSETS[path]!,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
      };
      // Safari will not play video or audio from a server that ignores byte
      // ranges, so a single "bytes=a-b" range is honoured; anything else gets
      // the whole file.
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
      if (range && (range[1] || range[2])) {
        const size = asset.length;
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start > end || start >= size) {
          res.writeHead(416, { "Content-Range": `bytes */${size}` });
          res.end();
        } else {
          res.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` });
          res.end(asset.subarray(start, end + 1));
        }
      } else {
        res.writeHead(200, { ...headers, "Content-Length": asset.length });
        res.end(asset);
      }
    } else if (req.method === "GET" && path === "/events") {
      handleEvents(req, res);
    } else if (req.method === "POST" && path.startsWith("/api/") && !isSameOrigin(req)) {
      deny("request.denied", undefined, "cross_origin");
      sendJson(res, 403, { error: "cross-origin request rejected" });
    } else if (req.method === "POST" && path === "/api/star") {
      await handleCreateStar(req, res);
    } else if (req.method === "POST" && path === "/api/star/move") {
      await handleMoveStar(req, res);
    } else if (req.method === "POST" && path === "/api/star/constellation") {
      await handleChooseConstellation(req, res);
    } else if (req.method === "POST" && path === "/api/here") {
      handleHere(req, res);
    } else if (req.method === "POST" && path === "/api/listening") {
      await handleListening(req, res);
    } else {
      sendJson(res, 404, { error: "not found" });
    }
  } catch (err) {
    // Enough to debug, nothing more: the method, which known route failed,
    // and the error's class. Never the message, stack, URL, headers or body,
    // any of which could carry something private.
    const route = ["/", "/readme/", "/sky.js", "/events", "/api/star", "/api/star/move", "/api/star/constellation", "/api/here", "/api/listening"]
      .find((r) => req.url?.split("?")[0] === r) ?? "other";
    const kind = err instanceof Error ? err.constructor.name : "unknown";
    console.error(`error method=${req.method ?? "?"} route=${route} kind=${kind}`);
    sendJson(res, 500, { error: "internal error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${PORT}, db at ${DB_PATH}`);
});
