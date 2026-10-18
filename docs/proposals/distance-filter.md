# Proposal: "Study nearby" distance filter (not built)

Status: deferred. Nothing location-related is built, stored, logged or sent.

## What was asked

An optional control (Anywhere / within 10 km / 100 km / 1000 km) that asks
for browser geolocation only after an explicit click, never shows anyone's
location, and stores no coordinates.

## Why it is not built in this iteration

A filter needs to compare the viewer's location with every other star's.
There are only two places that comparison can happen, and both leak:

1. **In the viewer's browser.** The browser would need every other star's
   location (or bucket) over `/events`. Anyone could read them from the
   stream, so location would be public. This breaks "every live event
   follows the same privacy rules as the page".
2. **On the server.** The server would store a location bucket per star and
   answer "which stars are within 10 km of me". A visitor can claim any
   location, so by asking from many claimed points they can triangulate
   another star to roughly the bucket size (10 km is a suburb or a campus).
   Coarser buckets (100 km+) reduce that, but then "nearby" means "same
   city", which is what the Common Room already is for most users.

A coarse, irreversible bucket (for example a hashed ~100 km grid cell with
no neighbour queries) narrows the risk but does not remove it, and it is new
personal data that would need retention, deletion and an ADR replacing the
current rule that nothing about a visitor but their star is kept.

## What would be needed to build it safely

- An ADR that names the data (one coarse cell id per star, never
  coordinates), how long it lives (in memory only, like glowing, is the
  safest), and who can query it.
- Server-side matching only, returning counts, never star ids, with a
  minimum group size (for example, hide any count under 3) so one person
  cannot be isolated.
- Rate limits on changing your claimed cell.
- Tests that no coordinate or cell id ever appears in HTML, SSE, logs or the
  database file.

Until then the lounge shows no location control at all, rather than a
disabled one.
