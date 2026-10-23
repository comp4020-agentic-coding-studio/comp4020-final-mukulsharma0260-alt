# Recommendation: anonymous subject chat (not built)

Status: built. Both Common Room chat and subject (per-constellation) chat —
this proposal's original scope — now ship, under ADR 0012's two amendments.
Cross-room content isolation was proven directly before subject rooms became
postable: two real settled identities, Engineering and Science, with the
Engineering message's content asserted absent from the Science stream's raw
SSE frames (`spec/chat-subject-rooms.test.ts`), not merely hidden by the UI.

**Update**: the naming idea below (an anonymous, server-generated per-day
label such as "Star 4F") is superseded by a user-chosen, persistent callsign
— see ADR 0012. The message-shape ideas below (280 characters, 24-hour
expiry, SSE-filtered delivery, the audit vocabulary) were carried forward
into Common Room chat as built, and still apply to subject chat once it
ships: filtered delivery is already implemented generically
(`src/chat-rooms.ts`), reusable for a second room without rework.

## Recommendation

Defer chat until the Common Room and constellation views are approved, and
build it then as its own change with its own ADR.

## Why not now

- **It replaces a standing rule.** CLAUDE.md says "the app accepts no free
  text from visitors". Chat is the first free text, so it needs an ADR that
  replaces that rule explicitly, not a quiet exception.
- **Abuse handling is the real work.** An anonymous room with no accounts
  can be flooded or used to harass. Rate limits per star and per IP-free
  bucket, a length limit, a profanity/slur filter, a report path and a way
  for the owner to remove messages all need designing and testing first.
- **Retention must be decided.** Messages are about people; a 24-hour expiry
  with a scheduled delete (and a test proving it) is the minimum.
- **Crit risk.** The Crit 8-10 behaviour (persistence, live updates,
  ownership, audit) is stable and tested now. Adding a large new write path
  late risks it.

## What a safe first version would contain

- One conversation per constellation, persisted in a new `messages` table
  (id, constellation, author star id, text, created_at), deleted after 24 h.
- No names: messages show a server-generated, per-day label (for example
  "Star 4F"), never the star id.
- 280 characters, trimmed, rejected if empty; rendered with `textContent`
  only (no HTML), and escaped on the server too.
- Rate limit (for example 1 message per 10 s and 30 per hour per star).
- Live delivery over the existing `/events` stream, filtered by
  constellation.
- Audit: `message.created` / `message.rejected` with the constellation and
  the public star id, never the text.
- Tests for ownership, validation, escaping, rate limits, expiry,
  persistence across restart, and SSE delivery to a second browser.
