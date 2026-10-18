// One structured line per meaningful action, readable aloud from `flyctl
// logs`:
//
//   audit action=star.moved actor=star:<uuid> target=star:<uuid> result=ok
//
// Safe by construction, not by convention. Only the fields below can be
// written, and each value must match a narrow pattern: an action or result
// is a short lower-case word, and an actor or target is either a public star
// id or "anonymous". A token, hash, cookie, IP, request body or timestamp
// cannot pass those patterns, so it is dropped rather than printed. The
// platform stamps each line with its own time, so none is written here.

export type Actor = { kind: "star"; id: string } | { kind: "anonymous" };

export type AuditEvent = {
  action: string;
  actor: Actor;
  target?: Actor;
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

export function auditLine(event: AuditEvent): string {
  const parts = [
    `action=${WORD.test(event.action) ? event.action : "invalid"}`,
    `actor=${label(event.actor)}`,
  ];
  if (event.target) parts.push(`target=${label(event.target)}`);
  parts.push(`result=${WORD.test(event.result) ? event.result : "invalid"}`);
  return `audit ${parts.join(" ")}`;
}

export function audit(event: AuditEvent): void {
  console.log(auditLine(event));
}
