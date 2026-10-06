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
import { createStar, getByHash, idsCreatedAfter, moveStar, openDb, touchSeen } from "./db.ts";
import type { Star } from "./db.ts";

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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

// Interim /readme/ render: verbatim, HTML-escaped, in a <pre> — swapped for a
// real Markdown render once src/markdown.ts lands.
function renderReadmePage(): string {
  const md = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>About Overlap</title></head><body><main><pre>${escapeHtml(md)}</pre></main></body></html>`;
}

function renderHomePage(): string {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>Overlap</title></head><body><main><h1>Overlap</h1><p>Under construction.</p><p><a href="/readme/">About this app</a></p></main></body></html>`;
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
  sendJson(res, 200, { hasStar: true, newStarIds, newCount: newStarIds.length });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (req.method === "GET" && path === "/") {
      sendHtml(res, 200, renderHomePage());
    } else if (req.method === "GET" && path === "/readme/") {
      sendHtml(res, 200, renderReadmePage());
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
