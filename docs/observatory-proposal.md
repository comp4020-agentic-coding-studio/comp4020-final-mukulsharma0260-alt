# Proposal: real constellations

Status: superseded by [ADR 0010](adr/0010-five-fixed-constellations-on-the-star.md),
which built it. The simulated prototype route has been removed. Kept as the
record of the proposal.

## The smallest honest model

### Five fixed study areas

A constant in code, not a table: `science`, `engineering`, `business`,
`health`, `arts`. Visitors choose from these; they never type one. That keeps
the rule that the app accepts no free text from visitors.

### One column on a star

```sql
ALTER TABLE stars ADD COLUMN constellation TEXT
  CHECK (constellation IN ('science','engineering','business','health','arts'));
```

`NULL` means "not settled anywhere yet". Existing stars stay `NULL`, so no
star moves and no history is rewritten. This is a new migration step in
`src/migrate.ts`, taken with a WAL checkpoint and a backup first (the
existing rule).

A star's x and y stay as they are, fractions from 0 to 1. Inside a
constellation view the client places stars near the figure from the star id,
so no new coordinates are stored.

### Changing your own constellation

`POST /api/star/constellation` with body `{ "constellation": "engineering" }`.

- The star is found only from the HttpOnly cookie, like `/api/star/move`. A
  star id in the body is ignored.
- The value must be one of the five, otherwise it gets a 400.
- No star: a 400 and an audit of `star.constellation_denied` with actor
  `anonymous`.
- Same-origin check, as for every POST.

### Live counts per constellation

This stays in memory, like presence today. An open, visible `/events` stream
for a star counts toward that star's constellation. Nothing about the stream
is written to SQLite.

- The `sync` event gains `liveByConstellation: { science: 3, ... }`.
- A new `live` payload carries the same counts whenever they change.
- `star` events gain the star's `constellation`. That is a fixed category,
  not a timestamp or anything typed by a person, so it fits the rule that live
  events expose only an id, normalised coordinates and a brightness bucket.
  The rule has to be amended to name it.

### Glowing, quiet focus and short breaks

"Quiet focus" and "Taking a short break" would be presence state, held in
memory only and sent with the live counts. It is not stored. It is not
"physically present". Its wording stays "studying now" / "on a short break"
while a tab is open, never "here".

### Traces

"325 traces across past nights" is `COUNT(*)` of stars, grouped by
constellation where set. Exact timestamps of others never leave the server.
The old-light view of every star moves to an optional archive page, not the
default.

### Audit (Crit 10)

| Action | Actor | Target | Result |
|---|---|---|---|
| `star.constellation_changed` | the star id | the star id | the new constellation |
| `star.constellation_denied` | `anonymous` | none | `no_owned_star` / `invalid_area` |

There is no cookie, token, hash, IP address or raw body in any of these. Page
loads and streams stay unlogged.

## Tests to write first

1. A POST without a cookie is refused and audited as anonymous.
2. A star id in the body is ignored, so another visitor's star never changes.
3. An unknown constellation is refused with a 400 and stores nothing.
4. The constellation persists across a server restart (SQLite), while live
   counts reset to zero on restart.
5. A second browser sees a constellation's live count change within about a
   second, through `/events`, without a reload.
6. Hiding the tab drops that star from its constellation's live count.
7. No event or HTML contains another visitor's exact timestamp.
8. GET requests still never write.
9. Migration: an old database gains the column and keeps every star.

## ADRs to write

- **0010:** the lounge has five fixed constellations. This says why the set
  is fixed, with no visitor text, and records that `docs/terms.md` gains
  "constellation" as a part of the lounge, not a separate room or channel.
- **0011:** the default view shows only glowing stars, and past stars become
  traces.
- **Later, if chat comes:** a new ADR that replaces "the app accepts no free
  text", with length limits, rate limits, escaping, expiry, moderation and
  audit logs without content. CLAUDE.md changes with it.

## Where this conflicts with today's rules

- `docs/terms.md` says the place is not a room. The constellations are named
  parts of the one lounge, and the copy must never call them rooms. The ADR
  must add the word "constellation".
- CLAUDE.md says "inside the lounge, every point of light is a visitor". The
  Observatory keeps that: the constellation figures are drawn as lines and
  grey nodes, not as visitors, and they need a visible difference from
  student lights. The prototype uses grey nodes against gold students.
- Crit 9 glowing stays the same definition. Constellation counts are glowing
  stars grouped by area, nothing more.
- Break Orbit and chat are not part of this proposal.
