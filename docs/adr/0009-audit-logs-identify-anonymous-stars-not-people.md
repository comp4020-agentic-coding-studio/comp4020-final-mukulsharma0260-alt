# Title

Audit logs identify anonymous stars, not people

# Status: Accepted (amended 19 October 2026: presence, snapshot, broadcast and every refusal are logged)

Note (27 October 2026): "no names" below predates ADR 0012's optional
callsigns. Callsigns and message bodies are never logged; the actor is
still only a public star id or `anonymous` (see docs/audit-logging.md).

# Context

Overlap promises anonymity: a person is one browser, known to the server
only by an HttpOnly cookie whose SHA-256 hash is stored
([ADR 0001](0001-durable-anonymous-stars.md),
[ADR 0003](0003-a-person-is-a-browser.md)). There are no names or accounts.

Several people now act on the same lounge at once, and the server enforces
what each may change: anyone can see every star, but a browser can move only
the star its own cookie resolves to. To check that this holds, in a crit and
long after it, someone has to be able to read from the server's own logs who
did what. Until now the server logged nothing about actions, so neither the
permission rule nor any bug in it could be seen in production.

# Options

1. **Log the raw cookie token or its hash.** It would identify each browser
   exactly. But the token is the credential itself, and the hash is the key
   that links a browser to its row in the database. Either in a log would
   make every log reader able to impersonate or track a visitor. Rejected.
2. **Log nothing.** Safest for privacy, but the permission rule cannot be
   shown working, and a production bug cannot be traced to the action that
   caused it. Rejected.
3. **Log the public star id as an anonymous actor label (chosen).** Every
   star already has a random UUID that is shared with connected browsers as
   public star state. It is stable for a browser, different between
   browsers, and grants no authority.

# Decision

Option 3. Each meaningful action writes one line through `src/audit.ts`:

    audit action=star.moved actor=star:<uuid> target=star:<uuid> result=ok

The actor is the star the server resolved from the cookie, and so is a move's
target: a star id sent in a request body is never trusted, and never logged.
A move by a browser with no star logs `actor=anonymous`. Only these are
logged: a star created, a star moved, a move refused, and a check-in. Page
loads, live streams and keep-alives are not. The helper accepts only fixed
fields whose values match narrow patterns, so a token, hash, cookie, IP,
request body or timestamp cannot be printed even by mistake.

# Consequences

- The log tells two browsers apart and shows which one did each thing, but
  cannot say which human it was. Two tabs in one browser are one actor; an
  incognito window is a new one.
- It stays useful after the crit: a reported bug can be followed through the
  actions of the stars involved.
- A log reader learns that a particular public star acted at a given time.
  The star id is already public, so this adds no new identifier, but it does
  connect an action to a visible star. That is the intended privacy
  trade-off.
- Refusals that fail validation (bad coordinates, invalid JSON) were not
  logged at first; the amendment below now logs every refusal.
- Fly keeps logs for a limited time; this is a debugging trail, not a
  permanent record.

# Amendment (19 October 2026): enough to narrate a multi-user test

The tutor's multi-user tests are narrated from `flyctl logs` alone, so the
log must show a user connecting and leaving, an action received, its
broadcast, a refusal, and a snapshot sent. The original decision logged only
actions and left live streams and failed validation out. It is widened, with
the same safe helper:

- `state.snapshot` when any stream opens (actor, room, star count);
  `presence.joined` when a star's first visible stream opens, and
  `presence.left reason=stream_closed` when its last one closes, each with
  `clients_in_room` (glowing stars in that room). The server cannot tell a
  hidden tab from a closed one or a dropped network, so the reason says only
  what it saw. Leaving is presence: the star stays in SQLite.
- `state.broadcast` after every broadcast, with `change`, `scope=all` and
  `recipients`. Every stream receives every star event by design, because
  the Common Room shows every star; the log says so rather than implying a
  per-room channel.
- Every refusal is logged as `result=rejected reason=<word>`: no star,
  invalid position, invalid JSON, invalid constellation or mode, a
  cross-origin request, or listening without a glowing tab. The body is
  never logged, and a forged star id is still never named, because the
  server never trusts or reads it.
- Accepted actions now say `result=accepted` and carry the star's `room`.

Still never logged: page loads, keep-alives, stream contents, cookies,
tokens, hashes, IPs, locations, bodies and timestamps (the platform stamps
each line). Checks: `spec/logging.test.ts`.
