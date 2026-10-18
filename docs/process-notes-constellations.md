# Process notes: constellations inside the Common Room

Short notes for PROCESS.md, to be merged once the work is approved.

- The simulated Observatory prototype answered "does this layout read?" but
  had nothing behind it. It was deleted rather than wired up, so no route
  can show invented numbers.
- Tests first: `spec/constellations.test.ts` (17 tests) ran red against the
  old server (no column, 404 route) before any implementation.
- The one surprise: the two-browser SSE test failed after implementation
  because it waited for `live` before `star`, but the server sends `star`
  first. The server was right; the test's event order was fixed, then the
  file ran green three times in a row.
- Old stars (459 locally) stay unsettled rather than being shuffled into
  areas: they stay Common Room stars, so constellation counts are honestly small.
- Real browser check: two isolated Chrome contexts (normal and
  incognito-equivalent) chose Engineering and Health. Each saw the other's
  count change in under 60 ms without reloading. Hiding, closing and
  reopening tabs moved the counts. A forged star id in the body changed only
  the sender's own star.

- Correction after review: the first build made the Observatory the default
  and hid old stars as numbers. The user rejected that: the shared map comes
  first. It became the Common Room (every real star drawn), with the five
  constellations as optional regions of the same map, enforced by the server
  (settle position and move clamp). ADR 0010 carries the amendment.
- A user saw a blank light-blue Engineering page. It never reproduced in
  Chrome, WebKit or Firefox, but one mechanism did in a test page: the old
  chart used a 1-unit viewBox with `vector-effect: non-scaling-stroke`, so a
  stroke that lost that property became chart-wide and painted over the page.
  The new map uses a 1000-unit viewBox, no `vector-effect`, and is clipped
  (`overflow: hidden; contain: paint`). `spec/routes.test.ts` holds this.
- Performance: 630+ stars made the first lounge render take 3.7 s in jsdom
  (one `querySelector` per star). A Map of star nodes brought it to 0.5 s.

- Second redesign (full-screen lounge): a top bar, a full-screen stage, and
  each constellation as its own view, with the same one-column data model.
  38 new tests (spec/shell.test.ts, spec/break.test.ts and new server tests)
  were run red against the old build first. One real bug was found only by
  looking at a populated screenshot: every newcomer who pressed "Place your
  star in Engineering" landed on the same point, because the client sent the
  region's centre and the server keeps an inside position. The server now
  gives such a star its own spot from its id; a test reproduces the stack.
- The Break drawer uses five owner-supplied tracks. They were measured first
  (one clipped at +4.1 dBTP and loudness ranged from -10 to -15 LUFS), so
  each was normalised to -16 LUFS with a true-peak limiter. "N listening"
  is in-memory presence (ADR 0011).
- Distance filter and chat were not built; docs/proposals/ says why.

## Contradictions to resolve in PROCESS.md and README.md (not yet edited)

- README and PROCESS.md describe the lounge as one night sky of stars. The
  default view is now named the Common Room (still every real star on one
  map), with optional constellation regions; the old Observatory wording in
  any draft must go.
- PROCESS.md's Crit 10 section lists the audited actions; the three
  constellation actions are new (see docs/audit-logging.md).
