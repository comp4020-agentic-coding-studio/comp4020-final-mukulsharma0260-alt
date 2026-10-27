# Database migrations

Migrations are `migrations/NNN_*.sql`, applied in order by `src/db.ts` on
start-up, each once and inside a transaction, recorded in
`schema_migrations`. The Dockerfile copies `migrations/`, so a deploy applies
new ones automatically on the next boot.

Before deploying a migration to production: take a WAL checkpoint, then back
up the database file (a copy of the main file alone misses recent writes).

A push to `main` is a deploy: once CI is green it deploys automatically. So
the checkpoint and backup come before the push, not after it.

| File | What it does |
|---|---|
| 001–003 | stars table, last-seen tracking, sequence numbers |
| 004_add_constellation.sql | adds nullable `stars.constellation`, CHECKed against the five ids. Existing rows stay `NULL` (unsettled). No data is rewritten. See ADR 0010. |
| 005_create_callsigns.sql | adds `callsigns`, keyed by the identity's token hash, not by a star; `callsign_normalized` is UNIQUE. No existing row changes. See ADR 0012. |
| 006_create_messages.sql | adds `messages` (room-CHECKed, `expires_at`, author by token hash, never by star) and its two indexes. No existing row changes. See ADR 0012. |

Checks: `spec/constellations.test.ts` builds a database at migration 003
with stars in it, applies the real migrations directory, and asserts every
star survives with its id, position and a `NULL` constellation; and that the
CHECK refuses a value outside the list.
