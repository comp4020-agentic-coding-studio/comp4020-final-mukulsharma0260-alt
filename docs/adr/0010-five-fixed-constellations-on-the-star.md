# Title

A star settles in one of five fixed constellations

# Status: Accepted (amended twice: the Common Room is the default view; each constellation is its own view)

# Context

The lounge used to be one column of every star ever placed, more than 400
equal dots. A visitor could not tell where to go or who was studying near
their subject. The Observatory proposal (docs/observatory-proposal.md) and a
simulated prototype tested the idea of five study constellations. This ADR
makes membership real, so counts come from the database and live presence,
not from invented numbers.

Constraints: the app accepts no free text from visitors; identity comes only
from the HttpOnly cookie; presence lives in memory only; old stars must stay
valid history and must not be rewritten.

# Options

1. **A `constellations` table with a join table.** Flexible, but there are
   exactly five fixed areas and a star belongs to at most one. Two tables
   add joins and no honesty. Rejected.
2. **Keep the choice in localStorage.** No migration, but the server could
   not count it, it would vanish with site data, and another browser could
   never see it. Rejected.
3. **Randomly assign existing stars an area.** Makes the counts look fuller,
   but invents history. Rejected.
4. **One nullable column on `stars`, checked against a fixed list
   (chosen).**

# Decision

Option 4. Migration `004_add_constellation.sql`:

```sql
ALTER TABLE stars ADD COLUMN constellation TEXT
  CHECK (constellation IN ('science', 'engineering', 'business', 'health', 'arts'));
```

- `NULL` means a **Common Room star**: not settled in any constellation.
  Every existing star stays `NULL` and stays exactly where it was on the
  Common Room map until its owner chooses. Nothing is backfilled or moved.
- The allowlist lives twice, on purpose: `CONSTELLATIONS` in `src/db.ts`
  (requests are validated against it) and the CHECK (the database refuses
  anything else even if code is wrong).
- `POST /api/star/constellation` with `{"constellation":"<id>"}` or
  `{"leave":true}`. The star is the one the cookie resolves to; any star id in
  the body is ignored. The same-origin check applies, as for every POST.
- **Live count** per constellation = glowing stars (an open, visible-tab
  `/events` stream, ADR 0005/0006) grouped by the stored constellation. It is
  computed on demand and never stored.
- **Trace count** per constellation = `COUNT(*)` of stars with that value.
  Exact timestamps never leave the server.
- Live events gain the star's `constellation`, a fixed category. The rule
  "live events expose only a star id, normalised coordinates and a
  brightness bucket" now also allows this one fixed field.
- The visitor-facing names (Science, Engineering, Business, Health, Arts &
  Society) are copy in `src/render.ts`; ids are what is stored.

# Amendment: the Common Room is the default (supersedes the Observatory)

The first build of this ADR made an "Observatory" the default view: only
glowing students were drawn, inside constellation figures, and every other
star became a number. That hid the shared place and made a new visitor pick
a subject before they could be anywhere. It is replaced:

- **The Common Room is the default view.** After the arrival film every
  visitor lands on one shared map (`svg#sky`, a 1000-unit viewBox) that draws
  every real star: glowing, recent and old, each at its stored x and y. A
  visitor can place and move their own star there without choosing anything.
- **A constellation is a region of that same map**, not a separate page.
  The regions are fixed rectangles in `src/regions.ts`, the single source of
  truth, sent to the browser as `data-regions`. Choosing one is optional.
- **Settling moves the star into the region on the server.** If the star is
  already inside, it keeps its exact position; otherwise
  `settlePosition()` picks a deterministic spot inside from the star id. The
  new x and y are written in the same UPDATE as the constellation and sent to
  every browser in the `star` event.
- **A settled star stays inside its region.** `POST /api/star/move` clamps
  the position to the region before storing it, so no client (or forged
  request) can drag a settled star out. The browser mirrors the clamp only
  for smooth dragging. Leaving a constellation keeps the position and frees
  movement across the whole map again.
- **Viewing a constellation** (`#science`, `#engineering`, `#business`,
  `#health`, `#arts-society`, alias `#arts`) focuses its region in the same
  Common Room: other stars dim, never disappear, and the visitor's own star
  is never dimmed. An unknown hash shows the whole Common Room.
- Constellation figures are drawn as lines and hollow diamonds, never
  circles or soft points, so every point of light on the map is a real star.
- No discussion or chat UI exists, not even a disabled one.

# Second amendment: each constellation is its own full-screen view

Focusing a region of the Common Room map did not feel like going anywhere:
the side panel changed and the rest of the map dimmed. It is replaced:

- **One full-screen lounge.** A top bar (wordmark, Common Room, the five
  constellations, Break) and a stage of stars that fills the screen. The
  view's title and live line sit over the stage; one dock holds the
  visitor's star, its one action, and a legend.
- **Each constellation is its own view.** `#engineering` (and the other
  four, with `#arts-society` and the `#arts` alias) shows only that
  constellation's stars, spread across the whole stage, with its own name,
  line, live count ("N studying in Engineering now") and trace count. Other
  stars are kept in memory and fade out; nothing is deleted or duplicated.
- **The data model is unchanged.** One star per visitor, one nullable
  `constellation` column, the same regions in `src/regions.ts`, the same
  server clamp. The Common Room still draws every star at its stored place.
- **Joining.** In a constellation's view the one action is "Place your star
  in X" (no star yet: `POST /api/star` with `{"constellation":"x"}`, which
  creates it straight into the region at its own spot from its id), "Study
  in X" (a Common Room star), or "Move my star to X" (a star elsewhere),
  each through the same allowlist. A visitor whose star is here sees "Leave
  X" instead.
- **Light.** Three levels a visitor can tell apart, with a legend in words:
  studying now (bright core, halo, slow breathing), recent (smaller, no
  halo) and past trace (faint dust, can be hidden with "Past traces").

# Consequences

- Every star in SQLite is drawn on the default map; "N traces in the Common
  Room" counts them. A constellation's trace count is the stars settled in
  it.
- A constellation is a named part of the one lounge, never a room or
  channel in visitor-facing text (docs/terms.md).
- Changing the list of areas needs a new migration (SQLite cannot alter a
  CHECK in place, so it would be a table rebuild) and a code change together.
- A glowing visitor with no star, or a Common Room star, counts toward the
  Common Room's "studying now" but toward no constellation.
- Audit: `star.constellation_changed`, `star.constellation_left` and
  `star.constellation_denied`, under the public star id only (ADR 0009).
