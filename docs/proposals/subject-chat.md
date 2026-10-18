# Recommendation: anonymous subject chat (not built)

Status: deferred (option B). No chat UI, disabled card or placeholder exists.

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
