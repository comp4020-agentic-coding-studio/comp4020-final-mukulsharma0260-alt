# Performance

Measured on 2 November 2026, on the author's laptop (Apple Silicon, on
battery, kept awake with `caffeinate -i`; the power log was checked after
each run, see CLAUDE.md). Every run is against a local server on a fresh
throwaway database, never production. Loopback hides network cost, so the
server and download numbers are the ones that carry over to Fly; the
client numbers mostly show where time is *not* going.

"Before" is `bcb5009` (the last commit before this pass), "after" is
`0123b06`.

## Server: the page while the film downloads

Script: four clients pull the film in 1 MB byte ranges, as Safari does,
while 25 requests each time `GET /` and `GET /sky.js`. Medians and 95th
percentiles.

| | GET / p50 | GET / p95 | sky.js p50 | sky.js p95 |
|---|---|---|---|---|
| Idle, before | 0.9 ms | 1.6 ms | 0.7 ms | 1.2 ms |
| Film load, before (whole-file `readFileSync` per range, 1080p film) | **8.8 ms** | **13.8 ms** | 6.3 ms | 17.8 ms |
| Film load, after streaming, 1080p film | 1.0 ms | 2.2 ms | 0.7 ms | 1.8 ms |
| Film load, after streaming, 720p film (two runs) | 0.7-0.8 ms | 2.2 ms | 0.6-0.7 ms | 1.7 ms |

The cause was the asset handler: every request, including each byte range,
read the whole file synchronously on the one process that also serves
`/api` and `/events` (`perf: stream static assets…`, ADR 0002 note).

## The film download

| | MP4 (H.264) | WebM (VP9) | Resolution | SSIM vs 1080p master |
|---|---|---|---|---|
| Before | 14.9 MB | 9.7 MB | 1920x1080 (upscaled from 720p) | 1.000 |
| After | 5.4 MB | 3.8 MB | 1280x720 | 0.987 (both) |

Every visitor downloads it on every visit (ADR 0008), so this is the
largest saving for a phone on mobile data: about 6 MB less for Chrome
and Firefox (WebM), 9.5 MB less for Safari (MP4). Both play in Chromium and
WebKit through the streaming server; the flash-limit check passes.

## Client (Chromium, local)

| | 1440x900 before | 1440x900 after | 390x844 before | 390x844 after |
|---|---|---|---|---|
| Time to first byte | 7 ms | 18 ms | 2 ms | 2 ms |
| Largest contentful paint | 164 ms | 136 ms | 68 ms | 56 ms |
| Enter → first film frame | 168 ms | 143 ms | 32 ms | 14 ms |
| Skip → usable lounge | 8 ms | 6 ms | 4 ms | 3 ms |
| Common Room ↔ constellation, to next frame | 6-17 ms | 14-23 ms | 8-17 ms | 5-17 ms |

TTFB at this size is noise (a few milliseconds either way on loopback).

Long tasks over 50 ms: none on a view switch, none after Skip. One at load
(55-79 ms, 1440x900 only) and one on Enter (113-117 ms). The Enter task is
the browser decoding the film's first frames in a fresh context: in three
runs it appeared only in the first, as 111 ms of script, and was 3 ms in the
other two. It is media decode behind the film, not Overlap's code, and the
lounge's own work stays inside one frame, so no client code was changed
for speed.

## Correctness checks run with this pass

- `scripts/check-views.ts`: six ways into a constellation (direct address,
  top bar or place chooser, a name in the field, back and forward, reload,
  rotate) at 1440x900, 390x844 and 844x390, in Chromium and WebKit: 36 of
  36 pass. On `e5b85f7`'s parent it failed 8 of 36.
- `scripts/check-mobile.ts`: 112 of 112 (table in mobile-check.md).
- Film captions sampled every 50 ms in both engines at three sizes: at every
  change of line the old line's opacity was 0.00-0.01, the band stayed one
  height of at most two lines, and never met Skip, Mute or the progress bar.

## Final run (5aee4c2, 2 November 2026, 19:02-19:13, laptop awake)

| Check | Result |
|---|---|
| `pnpm check` | 374 of 374 tests, 36.0 s |
| `pnpm check:evidence` | pass (crit 8-10 reflections; 20 PROCESS.md commits resolve) |
| `scripts/check-mobile.ts` | 112 of 112 |
| `scripts/check-views.ts`, 10 runs in a row | 10 of 10, 54 checks each (Chromium and WebKit, 1440x900, 390x844, 844x390) |
| Size matrix (1440x900, 1280x800, 390x844, 844x390; 10 states; Chromium and WebKit) | 80 of 80 cells: no sideways scroll, no overlapping text, no target under 44px, no unnamed control, no console error |

`check-views.ts` had failed on some runs before 5aee4c2. Logged at the
moment of failure, each tap on a name had landed 14-19 px from the
visitor's own star, inside its 44px target, which wins over a name by
design; the check now taps only where a name can really be reached.
