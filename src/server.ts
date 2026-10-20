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
  CallsignTakenError,
  createMessage,
  createStar,
  getByHash,
  getById,
  getCallsignByHash,
  getCallsignByNormalized,
  isConstellation,
  isRoomKey,
  listRoomMessages,
  publicMessage,
  setCallsign,
  setConstellation,
  traceCounts,
  idsSeenSince,
  listAll,
  moveStar,
  openDb,
  touchSeen,
} from "./db.ts";
import type { Callsign, Constellation, Star } from "./db.ts";
import { isReservedCallsign, isValidCallsignFormat, normalizeCallsign, trimCallsign, CALLSIGN_RULES } from "./callsign.ts";
import { ChatRoomRegistry } from "./chat-rooms.ts";
import { IdempotencyCache, RateLimiter, isValidIdempotencyKey } from "./message-limits.ts";
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
// Keyed by token hash rather than star id, so a stream opened before any
// star exists (e.g. right after choosing a callsign) can still be found
// when that identity's first star is created — see handleCreateStar, which
// is the one place this index is read.
const eventStreamsByTokenHash = new Map<string, Set<ServerResponse>>();
// Which Break mode a glowing star has pressed Play on. Memory only, like
// glowing itself: a star stops counting the moment its last visible stream
// closes, and a restart forgets everyone.
const listeningByStarId = new Map<string, BreakMode>();

// Which rooms' chat each open stream should receive. Membership is always
// recomputed from stored data (a star's own constellation, plus "common"
// for everyone), never asserted by the client: see handleEvents,
// handleChooseConstellation and handleCreateStar for the three points that
// write to this. The scoped broadcaster (broadcastMessage) is the only
// thing allowed to send a chat event to a stream, and it only ever consults
// this registry — there is no path that falls back to every open stream.
const chatRooms = new ChatRoomRegistry<ServerResponse>();

const messageRateLimiter = new RateLimiter();
const messageIdempotency = new IdempotencyCache();
const MESSAGE_MAX_LENGTH = 280;
const MESSAGE_EXPIRY_MS = 24 * 60 * 60 * 1000;

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

// Every glowing stream is a Common Room member; a stream whose star has
// settled into a constellation is a member of that room too. This is the
// only membership rule chat uses — never which view is currently on
// screen, which the server has no way to know (see ADR, Phase 2 plan).
function chatRoomsFor(star: { constellation: Constellation | null } | undefined): Room[] {
  return star?.constellation ? ["common", star.constellation] : ["common"];
}

// The only function allowed to deliver a chat event: it consults chatRooms
// and nothing else, so a stream never receives a room's messages for any
// reason other than being a genuine, currently-recomputed member of it.
function broadcastMessage(room: Room, event: string, body: unknown): void {
  const recipients = chatRooms.streamsFor(room, eventStreams);
  for (const stream of recipients) sendEvent(stream, event, body);
  audit({ action: "state.broadcast", actor: ANONYMOUS, room, change: event, scope: "room", recipients: recipients.length, result: "sent" });
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

// The cookie token alone, with no requirement that a star exists yet: a
// callsign belongs to the identity, not to a star (see
// migrations/005_create_callsigns.sql), so this is the one place besides
// identityFromRequest that reads the cookie, used wherever a callsign must
// be found or set independently of star ownership.
function tokenFromRequest(req: IncomingMessage): string | undefined {
  return parseCookies(req.headers.cookie)[COOKIE_NAME];
}

// Returns the request's existing identity cookie token, or mints and sets a
// fresh one. A callsign may be the very first thing a visitor does, before
// any star exists, so whichever of /api/callsign or /api/star happens first
// must not orphan the other by minting a second token for the same browser.
function issuedToken(req: IncomingMessage, res: ServerResponse): string {
  const existing = tokenFromRequest(req);
  if (existing) return existing;
  const token = generateToken();
  res.setHeader("Set-Cookie", serializeIdentityCookie(token, IS_PROD));
  return token;
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

  // Reuses a token this browser already has (from choosing a callsign before
  // ever placing a star) rather than minting a second one, so a callsign and
  // a star chosen in either order end up on the same identity.
  const token = issuedToken(req, res);
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const id = randomUUID();
  // A tap inside the region keeps its place; with no tap, the star gets its
  // own spot there, so newcomers never stack on one point.
  if (constellation) ({ x, y } = placed ? settlePosition(constellation, id, x, y) : spotInRegion(constellation, id));
  const star = createStar(db, { id, tokenHash, x, y, now, constellation });

  // A visitor may have opened /events (and chosen a callsign) before this,
  // its first star, existed. Any such stream is found by token hash, not
  // star id (this star had no id to be keyed under until the line above),
  // and is given both its star-id membership and its chat-room membership
  // right now, in this same request — never requiring a reconnect.
  const myStreams = eventStreamsByTokenHash.get(tokenHash);
  if (myStreams && myStreams.size > 0) {
    eventStreamsByStarId.set(id, new Set(myStreams));
    const myRooms = chatRoomsFor(star);
    for (const stream of myStreams) chatRooms.subscribe(stream, myRooms);
  }

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
  // Every one of this star's open streams now belongs to its new room, not
  // the old one: recomputed in full (never added to), so leaving a
  // constellation actually drops it, not just gains the new one alongside.
  const myRooms = chatRoomsFor(star);
  for (const stream of eventStreamsByStarId.get(star.id) ?? []) chatRooms.subscribe(stream, myRooms);
  broadcastStar("constellation", star);
  broadcastLiveStars();
}

function publicCallsign(c: Callsign) {
  return { callsign: c.callsign, changeAvailableAt: c.changeAvailableAt };
}

// Sets the caller's callsign: a first choice if none exists yet, or a
// rename otherwise. This never requires a star — a callsign belongs to the
// anonymous identity itself (migrations/005_create_callsigns.sql) — and
// never trusts anything but the format/uniqueness/cooldown rules computed
// here against the request's own cookie identity.
async function handleSetCallsign(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  if (body === undefined) {
    deny("callsign.denied", undefined, "invalid_json");
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  const b = body as Record<string, unknown>;

  if (!isValidCallsignFormat(b.callsign)) {
    deny("callsign.denied", undefined, "invalid_format");
    sendJson(res, 400, { error: `invalid callsign. ${CALLSIGN_RULES}` });
    return;
  }
  const display = trimCallsign(b.callsign);
  const normalized = normalizeCallsign(display);

  if (isReservedCallsign(normalized)) {
    deny("callsign.denied", undefined, "reserved");
    sendJson(res, 400, { error: "that callsign is reserved. Try another." });
    return;
  }

  const token = issuedToken(req, res);
  const tokenHash = hashToken(token);
  const existing = getCallsignByHash(db, tokenHash);
  const now = new Date();
  const nowIso = now.toISOString();

  let saved: Callsign;
  let status: number;
  if (existing && existing.callsignNormalized === normalized) {
    // Setting the same name again is a no-op, not a rename: it costs
    // nothing against the cooldown, and nothing is rewritten.
    saved = existing;
    status = 200;
  } else {
    if (existing && new Date(existing.changeAvailableAt) > now) {
      deny("callsign.denied", undefined, "cooldown");
      sendJson(res, 429, { error: "you can change your callsign again later.", changeAvailableAt: existing.changeAvailableAt });
      return;
    }
    const collision = getCallsignByNormalized(db, normalized);
    if (collision && collision.tokenHash !== tokenHash) {
      deny("callsign.denied", undefined, "taken");
      sendJson(res, 409, { error: "that callsign is already taken. Try another." });
      return;
    }
    const changeAvailableAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    try {
      saved = setCallsign(db, tokenHash, display, normalized, nowIso, changeAvailableAt);
    } catch (err) {
      if (err instanceof CallsignTakenError) {
        deny("callsign.denied", undefined, "taken");
        sendJson(res, 409, { error: "that callsign is already taken. Try another." });
        return;
      }
      throw err;
    }
    status = existing ? 200 : 201;
  }

  sendJson(res, status, { callsign: publicCallsign(saved) });
  // A bare identity hash is never a safe audit actor (ADR 0009); only a
  // star id is. An identity with no star yet logs as anonymous, exactly
  // like any other identity-less action today — a direct, intended
  // consequence of callsigns living independently of stars, not a gap.
  const star = getByHash(db, tokenHash);
  audit({
    action: existing ? "callsign.changed" : "callsign.created",
    actor: star ? starActor(star.id) : ANONYMOUS,
    result: "accepted",
  });
}

// Posts a chat message. Phase 2 accepts only "common": a non-common room key
// is a valid Room (isRoomKey passes it) but is refused here with its own
// reason, since nothing else yet exists to deliver it to (Phase 3 lifts
// this). Posting needs a callsign but never a star — Common Room membership
// is "any entered visitor", not "a settled star" (that rule is Phase 3's,
// for subject rooms only). The callsign in the stored/broadcast message is
// always the server's own lookup; a callsign field in the request body, if
// sent, is never read.
async function handleCreateMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = tokenFromRequest(req);
  if (!token) {
    deny("message.denied", undefined, "no_identity");
    sendJson(res, 400, { error: "no identity" });
    return;
  }
  const tokenHash = hashToken(token);
  const callsign = getCallsignByHash(db, tokenHash);
  if (!callsign) {
    deny("message.denied", undefined, "no_callsign");
    sendJson(res, 400, { error: "choose a callsign before sending a message" });
    return;
  }

  const body = await readJsonBody(req);
  if (body === undefined) {
    deny("message.denied", undefined, "invalid_json");
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  const b = body as Record<string, unknown>;

  if (!isRoomKey(b.room)) {
    deny("message.denied", undefined, "invalid_room");
    sendJson(res, 400, { error: "room must be a valid room key" });
    return;
  }
  if (b.room !== "common") {
    // Not yet reachable through the UI; refused explicitly rather than
    // silently accepted and never delivered anywhere.
    deny("message.denied", undefined, "room_not_available");
    sendJson(res, 400, { error: "that room does not accept messages yet" });
    return;
  }
  const room = b.room;

  if (!isValidIdempotencyKey(b.idempotencyKey)) {
    deny("message.denied", undefined, "invalid_idempotency_key");
    sendJson(res, 400, { error: "a valid idempotencyKey is required" });
    return;
  }
  const idempotencyKey = b.idempotencyKey;

  if (typeof b.body !== "string") {
    deny("message.denied", undefined, "invalid_body");
    sendJson(res, 400, { error: "body must be a string" });
    return;
  }
  const text = b.body.trim();
  if (text.length < 1 || text.length > MESSAGE_MAX_LENGTH) {
    deny("message.denied", undefined, "invalid_length");
    sendJson(res, 400, { error: `body must be 1-${MESSAGE_MAX_LENGTH} characters` });
    return;
  }

  const existingId = messageIdempotency.get(tokenHash, idempotencyKey);
  if (existingId) {
    sendJson(res, 200, { message: { id: existingId, callsign: callsign.callsign, body: text } });
    return;
  }

  const now = Date.now();
  if (!messageRateLimiter.recordAndCheck(tokenHash, now)) {
    deny("message.denied", undefined, "rate_limited");
    sendJson(res, 429, { error: "slow down a little before sending another message" });
    return;
  }

  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + MESSAGE_EXPIRY_MS).toISOString();
  const id = randomUUID();
  const message = createMessage(db, { id, room, tokenHash, callsignSnapshot: callsign.callsign, body: text, now: nowIso, expiresAt });
  messageIdempotency.record(tokenHash, idempotencyKey, id, now);

  const star = getByHash(db, tokenHash);
  sendJson(res, 201, { message: publicMessage(message) });
  audit({
    action: "message.created",
    actor: star ? starActor(star.id) : ANONYMOUS,
    room,
    result: "accepted",
  });
  broadcastMessage(room, "message.created", { v: 1, room, message: publicMessage(message) });
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
  // Read regardless of whether a star exists yet: this is the only way
  // handleCreateStar can later find this same stream once a star is
  // created, if the visitor opened /events before placing one.
  const token = tokenFromRequest(req);
  const tokenHash = token ? hashToken(token) : undefined;

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
  if (tokenHash) {
    const streams = eventStreamsByTokenHash.get(tokenHash) ?? new Set<ServerResponse>();
    streams.add(res);
    eventStreamsByTokenHash.set(tokenHash, streams);
  }

  // This stream's chat membership: Common Room always, plus its own star's
  // settled constellation if it has one. Registered before the snapshot
  // below is built, so the snapshot's own chat section already reflects it.
  const myRooms = chatRoomsFor(identity?.star);
  chatRooms.subscribe(res, myRooms);

  // The snapshot goes out first, then this stream joins the broadcast set.
  // All of this is synchronous, so no event can fall between the two, and
  // the snapshot already includes the live state this stream contributes.
  const { starIds, ...counts } = liveState();
  const stars = listAll(db).map(publicStar);
  const now = new Date().toISOString();
  const chat = myRooms.map((room) => ({ room, messages: listRoomMessages(db, room, now).map(publicMessage) }));
  sendEvent(res, "sync", {
    stars,
    liveStarIds: starIds,
    ...counts,
    chat,
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
    chatRooms.unsubscribe(res);
    if (tokenHash) {
      const byToken = eventStreamsByTokenHash.get(tokenHash);
      if (byToken) {
        byToken.delete(res);
        if (byToken.size === 0) eventStreamsByTokenHash.delete(tokenHash);
      }
    }
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
      // Independent of identity.star: a callsign may exist with no star, or
      // a star with no callsign (migrations/005_create_callsigns.sql).
      const token = tokenFromRequest(req);
      const ownCallsign = token ? getCallsignByHash(db, hashToken(token)) : undefined;
      sendHtml(
        res,
        200,
        renderHomePage(stars, identity?.star.id, new Date(), traceCounts(db), liveStarIds(), ownCallsign?.callsign),
      );
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
    } else if (req.method === "POST" && path === "/api/callsign") {
      await handleSetCallsign(req, res);
    } else if (req.method === "POST" && path === "/api/message") {
      await handleCreateMessage(req, res);
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
    const route = ["/", "/readme/", "/sky.js", "/events", "/api/star", "/api/star/move", "/api/star/constellation", "/api/callsign", "/api/message", "/api/here", "/api/listening"]
      .find((r) => req.url?.split("?")[0] === r) ?? "other";
    const kind = err instanceof Error ? err.constructor.name : "unknown";
    console.error(`error method=${req.method ?? "?"} route=${route} kind=${kind}`);
    sendJson(res, 500, { error: "internal error" });
  }
});

// Bounds the rate-limiter and idempotency maps so a one-time poster's state
// does not sit in memory forever; same style as the existing SSE heartbeat.
setInterval(() => {
  const now = Date.now();
  messageRateLimiter.sweep(now);
  messageIdempotency.sweep(now);
}, 60_000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${PORT}, db at ${DB_PATH}`);
});
