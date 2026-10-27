# Title

A visitor may choose an anonymous callsign, independent of any star

# Status: Accepted (amended: Common Room chat; amended again: subject-room chat; amended again: expiry enforcement)

Reading order: each amendment below supersedes the rule wording before it.
The current free-text rule is in CLAUDE.md (a callsign and a 1-280
character message body, in the Common Room and in constellations). As of
27 October 2026 the expiry-enforcement amendment (the deletion sweep and
`message.expired`) is committed locally but not yet deployed; production
already hides expired messages through the read-path filter.

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

- A restart clears the rate limiter and idempotency cache, the same
  accepted cost as every other in-memory-only state in this app.
- `docs/terms.md` gains **callsign** and **conversation**; "Common Room" and
  "constellation" keep their existing meanings and existing rule (a
  constellation is never called a room) unchanged.

# Amendment: subject-room (constellation) chat

Each constellation gets its own conversation, reusing the room-scoped
delivery mechanism the Common Room amendment already built — no new
transport, no new schema.

- **Posting rule.** `POST /api/message` for a non-`common` room now succeeds
  only when the poster's own star is, right now, settled in that exact
  constellation (`star.constellation === room`), re-checked from the
  database on every request — never from a client-asserted "I am looking at
  this room." There is no read-only or preview posting state: a visitor
  with no star there sees the same honest refusal
  (`reason=not_settled`, *"settle your star in `<room>` to join this
  conversation"*) whether they have a star elsewhere, no star at all, or a
  callsign but nothing settled. This replaces the Phase-2 placeholder
  refusal (`reason=room_not_available`, which existed only because nothing
  could yet be posted to a non-`common` room).
- **No new SSE mechanism.** `chatRoomsFor` already computed `["common",
  star.constellation]` for a settled star (built, unused until now, in the
  Common Room amendment); a constellation's messages were always only ever
  going to reach a stream through the same `ChatRoomRegistry` the Common
  Room already uses. Reading a constellation's conversation was therefore
  already correctly gated by the existing membership mechanism before this
  amendment touched anything — only the *posting* rule needed to change.
- **The gate, proven directly.** Two real, separately settled identities —
  one in Engineering, one in Science — exchange messages while both keep an
  open `/events` stream. The Engineering message's `message.created` event,
  and the text itself, are asserted absent from every raw SSE frame the
  Science stream receives, not merely absent from its rendered UI
  (`spec/chat-subject-rooms.test.ts`). Demonstrated red/green: reverting
  `chatRoomsFor` to return every room makes this test (and a second one,
  checking an unsettled visitor's `sync` snapshot) fail immediately.
- **Membership recompute, already built, now exercised.** Settling into a
  constellation, leaving one, and moving between two are all covered:
  leaving immediately revokes posting there; moving from Engineering to
  Science revokes the old room and grants the new one on the *same*,
  never-reconnected stream (both already implemented in the Common Room
  amendment for the general case; this amendment is the first time a
  non-`common` room exercises them end to end).
- **Client**: the drawer is now room-aware. Its title, composer
  enabled/disabled state, and message list all reflect `view` — the
  constellation currently open, or the Common Room. Each room keeps its own
  in-memory message history on the client, so switching views never loses
  or mixes another room's messages; switching to an unsettled constellation
  shows the same honest *"Settle your star in `<room>` to join this
  conversation"* copy the server would give if posting were attempted
  anyway, kept in sync with it word-for-word. This is UI-only reflection:
  the server is re-checked on every post regardless of what the client
  currently shows as enabled.

## Consequences (subject-room chat)

- A visitor cannot read or post a constellation's conversation by merely
  viewing it — only by actually settling a star there, matching the
  product's existing "a constellation is a place your star goes, not a tab
  you browse" posture.
- Moving constellations costs a visitor nothing extra: their messages in
  the old room stay (never deleted), and they can post in the new room
  immediately, including on an already-open stream.
- `docs/audit-logging.md`'s `message.denied` reasons gain `not_settled` and
  drop the now-unreachable `room_not_available`.

# Amendment: expiry enforcement (the two remaining guarantees)

The Common Room amendment already made exclusion from every read path
structural (`listRoomMessages`'s `expires_at > ?` filter), so an expired
message was never readable even before this amendment. The two guarantees
explicitly deferred at the time — eventual deletion, and telling connected
visitors live — are built now.

- **`deleteExpiredMessages(db, nowIso)`** (`src/db.ts`) deletes every row
  past its expiry and reports exactly which ids, grouped by room, so the
  server knows what to announce without a second query. It is the only
  thing that frees storage; the read-path filter already made those rows
  unreadable regardless of whether or when this runs.
- **A dedicated sweep**, `setInterval(sweepExpiredMessages,
  EXPIRY_SWEEP_INTERVAL_MS)`, separate from the existing rate-limiter/
  idempotency sweep: a different store (SQLite, not an in-memory map) and a
  different purpose. `EXPIRY_SWEEP_INTERVAL_MS` defaults to 60 seconds in
  production, overridable by environment variable — the same convention
  `PORT`/`DB_PATH` already use — so a test can make the sweep fire within
  its own timeout instead of waiting a real minute.
- **`message.expired { v: 1, room, ids }`**, broadcast once per affected
  room through the existing `broadcastMessage` (room-scoped, never
  `scope=all`), whenever a sweep tick actually deletes something for that
  room. The client (`public/sky.js`) drops those ids from both its stored
  per-room history and, if that room is the one currently shown, the
  visible list — a message disappears live, not only on the next reload.
- **Tested directly** (`spec/chat-expiry.test.ts`): an already-expired
  message is seeded straight into the database file (bypassing the API,
  which can only ever create a message with a fresh 24-hour expiry) to
  prove deletion and the live event independently of waiting a real 24
  hours; a third test seeds an expired message *before the server starts*
  and asserts it is absent from the very first `sync` snapshot, proving
  expiry survives a restart. Demonstrated red/green: disabling the sweep
  interval makes the deletion and live-event tests fail immediately, while
  the restart-survival test (which exercises only the read-path filter)
  keeps passing — confirming the two guarantees are genuinely independent,
  not accidentally coupled.

## Consequences (expiry enforcement)

- A sweep tick that finds nothing to delete sends no broadcast and touches
  no stream — connected visitors are never told about an empty sweep.
- The sweep interval is a storage/freshness knob only: no correctness or
  privacy property depends on how often it runs, including the degenerate
  case of it never running (the read-path filter alone is already
  sufficient for guarantee 1).
