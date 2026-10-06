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
  createStar,
  getByHash,
  idsCreatedAfter,
  listAll,
  moveStar,
  openDb,
  touchSeen,
} from "./db.ts";
import type { Star } from "./db.ts";
import { renderHomePage } from "./render.ts";
import { renderMarkdown } from "./markdown.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DB_PATH = process.env.DB_PATH ?? "/data/stars.db";
const IS_PROD = process.env.NODE_ENV === "production";
const MAX_BODY_BYTES = 10_000;

const db = openDb(DB_PATH);

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
function publicStar(star: Star) {
  return {
    id: star.id,
    x: star.x,
    y: star.y,
    createdAt: star.createdAt,
    updatedAt: star.updatedAt,
    lastSeenAt: star.lastSeenAt,
  };
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
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Overlap</title><style>body{max-width:40rem;margin:2rem auto;padding:0 1rem;font-family:system-ui,sans-serif;line-height:1.5}</style></head><body><main>${body}</main><p><a href="/">Back to the sky</a></p></body></html>`;
}

async function handleCreateStar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const existing = identityFromRequest(req);
  if (existing) {
    sendJson(res, 200, { star: publicStar(existing.star) });
    return;
  }

  const body = await readJsonBody(req);
  if (body === undefined) {
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  const b = body as Record<string, unknown>;

  let x: number;
  let y: number;
  if (b.x === undefined && b.y === undefined) {
    x = randomUnit();
    y = randomUnit();
  } else if (isUnitInterval(b.x) && isUnitInterval(b.y)) {
    x = b.x;
    y = b.y;
  } else {
    sendJson(res, 400, { error: "x and y must be numbers between 0 and 1" });
    return;
  }

  const token = generateToken();
  const now = new Date().toISOString();
  const star = createStar(db, { id: randomUUID(), tokenHash: hashToken(token), x, y, now });

  res.setHeader("Set-Cookie", serializeIdentityCookie(token, IS_PROD));
  sendJson(res, 201, { star: publicStar(star) });
}

async function handleMoveStar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const identity = identityFromRequest(req);
  if (!identity) {
    sendJson(res, 400, { error: "no star to move" });
    return;
  }

  const body = await readJsonBody(req);
  if (body === undefined) {
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  const b = body as Record<string, unknown>;

  if (!isUnitInterval(b.x) || !isUnitInterval(b.y)) {
    sendJson(res, 400, { error: "x and y must be numbers between 0 and 1" });
    return;
  }

  const now = new Date().toISOString();
  const star = moveStar(db, hashToken(identity.token), b.x, b.y, now)!;
  sendJson(res, 200, { star: publicStar(star) });
}

function handleHere(req: IncomingMessage, res: ServerResponse): void {
  const identity = identityFromRequest(req);
  if (!identity) {
    sendJson(res, 200, { hasStar: false });
    return;
  }

  const now = new Date().toISOString();
  const result = touchSeen(db, hashToken(identity.token), now)!;
  const newStarIds = idsCreatedAfter(db, result.previousLastSeenAt, result.star.id);
  sendJson(res, 200, {
    hasStar: true,
    newStarIds,
    newCount: newStarIds.length,
    // The caller's own previous visit time — not another visitor's — so this
    // is not the "other people's exact timestamps" the rules forbid exposing.
    previousLastSeenAt: result.previousLastSeenAt,
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (req.method === "GET" && path === "/") {
      const identity = identityFromRequest(req);
      const stars = listAll(db);
      sendHtml(res, 200, renderHomePage(stars, identity?.star.id));
    } else if (req.method === "GET" && path === "/readme/") {
      sendHtml(res, 200, renderReadmePage());
    } else if (req.method === "GET" && path === "/sky.js") {
      const js = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      res.end(js);
    } else if (req.method === "POST" && path.startsWith("/api/") && !isSameOrigin(req)) {
      sendJson(res, 403, { error: "cross-origin request rejected" });
    } else if (req.method === "POST" && path === "/api/star") {
      await handleCreateStar(req, res);
    } else if (req.method === "POST" && path === "/api/star/move") {
      await handleMoveStar(req, res);
    } else if (req.method === "POST" && path === "/api/here") {
      handleHere(req, res);
    } else {
      sendJson(res, 404, { error: "not found" });
    }
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "internal error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${PORT}, db at ${DB_PATH}`);
});
