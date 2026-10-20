# Title

A visitor may choose an anonymous callsign, independent of any star

# Status: Accepted (amended: Common Room chat)

# Context

Live chat is coming (Common Room and per-constellation conversations), and a
message needs something to show as its speaker that is not a real name, an
account or a star id. CLAUDE.md's standing rule — "the app accepts no free
text from visitors" — exists because every visitor-facing value up to now has
been either fixed (a constellation id, a Break mode) or server-computed (a
brightness bucket, a count). A callsign is the first value a visitor writes
themselves. This ADR replaces that rule with a narrower one, scoped to what a
callsign actually is, before any chat message body (a second, separate kind
of free text) is accepted in a later change.

Constraints carried over unchanged: identity comes only from the HttpOnly
cookie; a request body never proves ownership of anything; the database
stores only a SHA-256 hash of the identity token, never the raw token;
presence lives in memory only; old stars and old data must stay valid
history and must not be rewritten.

# Options

1. **A column on `stars`.** Keeps one table, but forces "has a star" to be a
   precondition for "has a callsign," which is false: a visitor should be
   able to choose a callsign before ever placing a star, and an old star
   should be able to exist with no callsign, forever, with neither state
   gating the other. Rejected.
2. **`localStorage` only, no server record.** No migration, but the server
   could not enforce uniqueness, a cooldown, or a reserved-word list, and a
   different browser (or cleared storage) would see no name at all, even
   for messages that visitor already sent. Rejected for the same reason
   ADR 0001 rejected unverified client identity for stars.
3. **A separate `callsigns` table keyed by the existing identity's token
   hash (chosen).**

# Decision

Option 3. Migration `005_create_callsigns.sql`:

```sql
CREATE TABLE callsigns (
  token_hash TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  callsign_normalized TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  change_available_at TEXT NOT NULL
);
```

- **Independent of stars.** `token_hash` is the same SHA-256 hash
  `stars.token_hash` already uses, so a callsign describes the anonymous
  identity itself, not a star. A visitor may have a callsign with no star, a
  star with no callsign, or both, in either order. Choosing a callsign never
  creates a star, and placing a star never requires one.
- **One shared identity cookie, however it is first acquired.**
  `POST /api/callsign` and `POST /api/star` both reuse an existing
  `overlap_id` cookie if the request already has one, and mint a fresh one
  only if it has none. Without this, a visitor who chose a callsign first
  and placed a star second would get two different tokens for the same
  browser, orphaning the callsign from the star that visitor goes on to use.
- **Format**: 3-16 characters, letters, digits, spaces, hyphens and
  underscores only (`src/callsign.ts`). This allowlist alone rejects line
  breaks, emoji, HTML, control characters, other invisible characters, and
  anything URL-like, since none of those can be built from it. Checked
  against the raw, merely-trimmed value, before any whitespace-collapsing —
  collapsing first would launder a line break into an accepted space.
- **Uniqueness is permanent in this version.** `callsign_normalized` (trimmed,
  whitespace-collapsed, lower-cased) is `UNIQUE`, enforced by SQLite itself,
  not only by the server's own pre-check — a race between two simultaneous
  claims is decided by the database, never silently won by whichever request
  happened to answer last. Once claimed, a normalized form is never freed or
  recycled; there is no stale-name release in this version. If one is wanted
  later, it ships as its own migration with its own documented policy and
  tests, not as an unused column held in reserve now.
- **Reserved words** (`admin`, `administrator`, `system`, `moderator`,
  `overlap`, `support`, `staff`) are rejected case- and
  whitespace-insensitively, so a visitor can never appear to speak for the
  system or for moderation this project does not have.
- **Cooldown**: `change_available_at` is a watermark, not a duration. Every
  successful set — a first choice or a later rename — writes
  `now + 24h`; a rename succeeds only once `now() >= change_available_at`. A
  first-ever choice always succeeds, since there is no row to compare
  against. Re-submitting the exact name already held is a no-op, not a
  rename, and costs nothing against the cooldown.
- **Audit** (ADR 0009): `callsign.created` and `callsign.changed` on
  success, `callsign.denied` with a safe `reason` (`invalid_format`,
  `reserved`, `taken`, `cooldown`, `invalid_json`) on refusal. The audit
  `Actor` type only ever safely names a star or `anonymous` — never a bare
  identity hash, which would be exactly the kind of value ADR 0009 forbids.
  A callsign action from an identity with no star yet is logged as
  `actor=anonymous`, the same bucket every other identity-less action
  already uses; once that identity also owns a star, later callsign actions
  log under `actor=star:<id>`. This is a direct, intended consequence of
  keeping callsigns independent of stars, not a gap.
- **No new SSE event in this phase.** A callsign is read back only on the
  page that set it (`GET /`) and through the `/api/callsign` response
  itself; it is not yet broadcast to other browsers, since nothing reads it
  live until chat exists. That wiring is explicitly deferred to the chat
  change this ADR anticipates, not shipped speculatively here.

# Rule amendment (supersedes part of CLAUDE.md)

CLAUDE.md said: "The app accepts no free text from visitors." That is now:

> The app accepts one kind of free text: a callsign, 3-16 characters,
> letters/digits/spaces/hyphens/underscores only, format- and
> uniqueness-checked server-side (`src/callsign.ts`, ADR 0012). No other
> free text is accepted yet.

`README.md`'s "there are no visitor names or free-text messages" (line 31)
and its design-philosophy framing (line 15, "deliberately leaves out names
and messages") are now inaccurate. Per explicit instruction, neither is
rewritten here — the contradiction is reported, not silently fixed, pending
the user's own sign-off on how they should read once chat (the second piece
of this change) exists.

# Consequences

- A visitor can choose a callsign the moment they enter, before placing a
  star, and it is restored on return by the same cookie, with no account.
- An old star with no callsign is unaffected and stays usable; nothing is
  backfilled.
- A vacated or never-chosen name is never recycled or released in this
  version, which means a callsign, once taken, is taken for the life of the
  database — an accepted trade-off for a small, calm product with no
  moderation team, re-examined only if a real need for release appears.
- `docs/proposals/subject-chat.md`'s earlier idea (anonymous, server-generated
  per-day labels like "Star 4F") is superseded by this user-chosen,
  persistent callsign; that document should be read as historical context
  for the message-shape ideas it still contributes (280 characters, 24-hour
  expiry, SSE-filtered delivery), not as the naming approach actually taken.
- Reserving a short, fixed word list means a legitimate word on that list
  (e.g. a visitor who happens to study "support" systems) cannot use it
  verbatim; this is judged an acceptable, narrow cost against the
  impersonation risk it closes.

# Amendment: Common Room chat

The second kind of free text this ADR anticipated: a message body, bounded
and validated, in the Common Room only (subject-room conversations are a
later change, gated on proving they cannot leak into each other).

- **Rule amendment, again.** CLAUDE.md's rule from the decision above is
  widened: *"The app accepts two kinds of free text: a callsign (as above),
  and a chat message body, 1-280 characters, in the Common Room only.
  Subject-room conversations do not exist yet."*
- **Schema**: `migrations/006_create_messages.sql` — `messages(id, room,
  author_token_hash, callsign_snapshot, body, created_at, expires_at)`.
  `author_token_hash` references `callsigns(token_hash)`, not a star: posting
  the Common Room needs only a callsign, never a star, so a `NOT NULL`
  foreign key to `stars` would have been wrong. `room` is CHECKed against the
  same six values `stars.constellation` and `src/audit.ts`'s `ROOMS` already
  use (`common` plus the five constellation ids, `arts` not
  `arts-society` — the existing URL slug split in `public/sky.js` stays the
  only place that distinction is made, so no shipped migration or stored
  value is touched). `callsign_snapshot` is written once and never updated,
  so a later rename never rewrites an already-sent message.
- **Posting rule**: an entered visitor with a callsign may post to `common`;
  no star is required. A non-`common` room key is a real, valid room (the
  CHECK and `isRoomKey` both accept it) but is explicitly refused with
  `reason=room_not_available`, rather than silently accepted and never
  delivered anywhere — a visible, honest gap until subject-room chat ships,
  not a quiet dead end.
- **The server always derives the callsign from its own `callsigns` lookup**,
  never from a `callsign` field in the request body, so a message can never
  be posted under a name its sender does not own (tested explicitly:
  `spec/chat.test.ts`'s spoofing check).
- **Room-scoped delivery, not a global broadcast.** `src/chat-rooms.ts`'s
  `ChatRoomRegistry` tracks which rooms each open SSE stream belongs to
  (`common` always, plus a settled star's own constellation); a message is
  sent only to `streamsFor(room, ...)`, never to every open stream. A room
  with no subscribers returns no recipients — there is no code path that
  falls back to "everyone." This is unit-tested directly
  (`spec/chat-rooms.test.ts`) against real room keys (`common`,
  `engineering`), including the no-fallback case, independent of there being
  a second room reachable through the API yet. The stronger, real-product
  proof — two settled visitors, Engineering and Science, an Engineering
  message never reaching the Science stream's payload — is the gate for the
  change that makes subject rooms postable, not this one.
- **Membership is recomputed, not just set once**, at exactly the two points
  it can change: a star's constellation changing, and an identity's first
  star being created after its `/events` stream was already open (a visitor
  may choose a callsign, start listening, and only then place a star). Both
  are covered by dedicated tests.
- **No `authorStarId` in `message.created`.** The event carries only `{ id,
  callsign, body, createdAt }` — enough to render a chat bubble and mark a
  visitor's own messages (by comparing callsign, not star id), with no
  reason to link a public star id to chat content at all.
- **Rate limiting and duplicate suppression, in memory only** (same
  precedent as Break's `listeningByStarId`): 3 sends per 10 seconds per
  identity (`src/message-limits.ts`'s `RateLimiter`), and a required,
  format-validated idempotency key (`^[A-Za-z0-9_-]{1,64}$`) suppresses a
  retried send for 60 seconds (`IdempotencyCache`). Both are swept
  periodically so an identity's entry does not sit in memory forever once
  idle, the same bounding discipline already used for the rate limiter
  itself.
- **Expiry is declared but not yet enforced by a sweep.** `expires_at` is
  written at post time (`created_at + 24h`); the read path already filters
  on it (`listRoomMessages`), so an expired message cannot be read back
  starting the instant this ships — but the periodic deletion of expired
  rows, and a live `message.expired` event for connected visitors, are
  explicitly a later change, not silently assumed here.
- **XSS**: a message body is stored and delivered verbatim; safety comes
  entirely from the client rendering it with `.textContent`
  (`renderChatMessage` in `public/sky.js`), never `innerHTML` or a
  template string, matching the discipline already used for every other
  visitor-facing value in this codebase. Tested directly, including a
  red/green demonstration that a reversion to `innerHTML` is caught.
- **No message deletion in this change.** Deferred to keep this change's
  write-surface smaller, consistent with the "smallest honest schema"
  approach the callsign decision already took.

## Consequences (chat)

- A message posted to a non-`common` room key is refused outright today,
  not silently accepted; the UI never offers one, since no subject-room
  conversation exists to send it to yet.
- A restart clears the rate limiter and idempotency cache, the same
  accepted cost as every other in-memory-only state in this app.
- `docs/terms.md` gains **callsign** and **conversation**; "Common Room" and
  "constellation" keep their existing meanings and existing rule (a
  constellation is never called a room) unchanged.
