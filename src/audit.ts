// One structured line per meaningful action, readable aloud from `flyctl
// logs`:
//
//   audit action=star.moved actor=star:<uuid> target=star:<uuid> result=ok
//
// Safe by construction, not by convention. Only the fields below can be
// written, and each value must match a narrow pattern: an action or result
// is a short lower-case word, an actor or target is either a public star id
// or "anonymous", a room is one of six fixed names, and a count is a whole
// number. A token, hash, cookie, IP, request body or timestamp
// cannot pass those patterns, so it is dropped rather than printed. The
// platform stamps each line with its own time, so none is written here.

export type Actor = { kind: "star"; id: string } | { kind: "anonymous" };

// The rooms a log line can name: the Common Room or one of the five
// constellations. A star's room is its stored constellation (or "common");
// which view a browser is looking at is never known to the server.
export const ROOMS = ["common", "science", "engineering", "business", "health", "arts"] as const;
export type Room = (typeof ROOMS)[number];

export type AuditEvent = {
  action: string;
  actor: Actor;
  target?: Actor;
  room?: Room;
  reason?: string;
  change?: string;
  scope?: string;
  recipients?: number;
  stars?: number;
  clientsInRoom?: number;
  result: string;
};

const WORD = /^[a-z][a-z0-9_.]{0,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function label(who: Actor): string {
  if (who.kind === "star" && UUID.test(who.id)) return `star:${who.id}`;
  return "anonymous";
}

export function starActor(id: string): Actor {
  return { kind: "star", id };
}

export const ANONYMOUS: Actor = { kind: "anonymous" };

const word = (value: string) => (WORD.test(value) ? value : "invalid");
const count = (value: number) => (Number.isInteger(value) && value >= 0 ? String(value) : "invalid");

export function auditLine(event: AuditEvent): string {
  const parts = [`action=${word(event.action)}`, `actor=${label(event.actor)}`];
  if (event.target) parts.push(`target=${label(event.target)}`);
  if (event.room !== undefined) parts.push(`room=${(ROOMS as readonly string[]).includes(event.room) ? event.room : "invalid"}`);
  if (event.reason !== undefined) parts.push(`reason=${word(event.reason)}`);
  if (event.change !== undefined) parts.push(`change=${word(event.change)}`);
  if (event.scope !== undefined) parts.push(`scope=${word(event.scope)}`);
  if (event.recipients !== undefined) parts.push(`recipients=${count(event.recipients)}`);
  if (event.stars !== undefined) parts.push(`stars=${count(event.stars)}`);
  if (event.clientsInRoom !== undefined) parts.push(`clients_in_room=${count(event.clientsInRoom)}`);
  parts.push(`result=${word(event.result)}`);
  return `audit ${parts.join(" ")}`;
}

export function audit(event: AuditEvent): void {
  console.log(auditLine(event));
}
