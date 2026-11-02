# About page check

Results of `scripts/check-about.ts`, the browser check for the About page at
`/about/`, run against a local throwaway server (a fresh `/tmp` database),
never production. It runs in Chromium and WebKit at the seven sizes in the
About brief: 1920x1080, 1440x900, 1280x800, 390x844, 360x844, 414x896 and
844x390.

## What it checks, at every size, in both engines

- **First screen**: the title, the short line and ENTER THE LOUNGE are inside
  the view, below the top bar, and fully shown 400ms after load (the first
  chapter has no reveal; later chapters do).
- **No sideways scroll**, at every scroll position.
- **Contrast**: every visible text run, measured against the pixels really
  behind it (a screenshot with the text made transparent), at every scroll
  position. At least 4.5:1.
- **Targets**: every link at least 44px each way.
- **Keyboard**: Tab reaches the seven links in reading order, each with a 2px
  ring, each coming to rest outside the sticky top bar. (WebKit is driven with
  Option+Tab, as Safari reaches links.)
- **Back and forward**: "Read how it works" adds `#company`; Back returns to
  the top of `/about/`. Into the lounge and Back shows the About page again.
- **Stays out of the lounge**: until the visitor presses ENTER, the only
  requests are GETs for `/about/` and one artwork file. No `/events`, no
  `/api/`, no POST, no cookie.
- **One stream after entering**: the page counts its own open streams. On
  the arrival screen 0; after Enter 1; Back on About 0; forward and Enter
  again 1.
- **Glows only while in the lounge**: a second browser in the lounge watches
  the visitor's star. It is not glowing on the arrival screen, glows after
  Enter, stops when the visitor goes Back to About, and glows again after
  re-entering. This is the server's own count, so a stream left open by the
  back-forward cache would show here.
- **No console errors.**
- Chromium only (WebKit reports none of these entries): **no long task over
  50ms**, **no layout shift**, **largest paint within 1s**, read before any
  scrolling.

And once per engine, at 390x844:

- **Reduced motion, Save-Data, 2g, slow-2g**: no video element, no video
  request, and under reduced motion every word is shown at once. To prove
  the guards, the check hands the empty video slot a stand-in address that
  it answers itself with an empty response. No video file exists, and the
  shipped page's slot is empty. With motion allowed, the same stand-in
  creates one video element, so the guard is shown to be what stops it.
- **No JavaScript**: all five chapters are there, every word visible and
  selectable.

## Results (2 November 2026, uncommitted, on top of 176232c)

| Engine | Size | Checks | Lowest contrast | Largest paint | Long tasks | Layout shift |
|---|---|---|---|---|---|---|
| chromium | 1920x1080 | 15 of 15 | 8.70:1 | 164ms | 0 long tasks | 0.0000 |
| chromium | 1440x900 | 15 of 15 | 8.58:1 | 44ms | 0 long tasks | 0.0000 |
| chromium | 1280x800 | 15 of 15 | 8.54:1 | 44ms | 0 long tasks | 0.0000 |
| chromium | 390x844 | 22 of 22 | 8.26:1 | 60ms | 0 long tasks | 0.0000 |
| chromium | 360x844 | 15 of 15 | 8.25:1 | 60ms | 0 long tasks | 0.0000 |
| chromium | 414x896 | 15 of 15 | 8.37:1 | 60ms | 0 long tasks | 0.0000 |
| chromium | 844x390 | 15 of 15 | 8.33:1 | 32ms | 0 long tasks | 0.0000 |
| webkit | 1920x1080 | 12 of 12 | 8.69:1 | n/a | n/a | n/a |
| webkit | 1440x900 | 12 of 12 | 8.58:1 | n/a | n/a | n/a |
| webkit | 1280x800 | 12 of 12 | 8.54:1 | n/a | n/a | n/a |
| webkit | 390x844 | 19 of 19 | 8.25:1 | n/a | n/a | n/a |
| webkit | 360x844 | 12 of 12 | 8.20:1 | n/a | n/a | n/a |
| webkit | 414x896 | 12 of 12 | 8.34:1 | n/a | n/a | n/a |
| webkit | 844x390 | 12 of 12 | 8.31:1 | n/a | n/a | n/a |

Guards and no-JavaScript, at 390x844:

```
PASS  chromium 390x844 motion allowed  a set video would start: video elements 1, video requests 1
PASS  chromium 390x844 reduced motion  still artwork, no video: video elements 0, video requests 0
PASS  chromium 390x844 reduced motion  every word shown at once: motion class false, hidden reveals 0
PASS  chromium 390x844 Save-Data  still artwork, no video: video elements 0, video requests 0
PASS  chromium 390x844 2g  still artwork, no video: video elements 0, video requests 0
PASS  chromium 390x844 slow-2g  still artwork, no video: video elements 0, video requests 0
PASS  chromium 390x844 no JavaScript  readable: 5 chapters, hidden reveals 0, selectable true
PASS  webkit 390x844 motion allowed  a set video would start: video elements 1, video requests 0
PASS  webkit 390x844 reduced motion  still artwork, no video: video elements 0, video requests 0
PASS  webkit 390x844 reduced motion  every word shown at once: motion class false, hidden reveals 0
PASS  webkit 390x844 Save-Data  still artwork, no video: video elements 0, video requests 0
PASS  webkit 390x844 2g  still artwork, no video: video elements 0, video requests 0
PASS  webkit 390x844 slow-2g  still artwork, no video: video elements 0, video requests 0
PASS  webkit 390x844 no JavaScript  readable: 5 chapters, hidden reveals 0, selectable true
```

Total: 203 of 203, in each of two runs in a row (Mac awake throughout,
about 3m40s each). The same check before the first-screen fix, without its
opacity and largest-paint lines, passed 196 of 196 twice.

## Lounge unchanged

On the same server, with the About change in place:

- `scripts/check-mobile.ts`: 112 of 112.
- `scripts/check-views.ts`: 54 of 54.

## What the check got wrong first

Each of these was the check's fault, not the page's; each was found by
measuring, then fixed in the check:

- Contrast results were keyed by text, so the two identical ENTER links
  counted as one (34 of 35); keying by page position then double-counted the
  sticky bar. Now keyed by order in the document.
- Playwright's request events never see an EventSource that Chromium's
  back-forward cache closes, so a closed stream looked open. The server log
  showed `presence.left` at once. The check now counts streams inside the
  page and asks a second browser whether the star glows.
- Focus was judged mid-scroll: `waitForFunction` given a function returning a
  Promise treats the Promise as truthy and returns at once. Now it waits
  until scrolling stops. Seen failing on purpose with a 600px top bar
  covering the end links.

## What the check found in the page

The first chapter faded in like the rest, so the title painted about 700ms
after load on a laptop (Chromium, largest-contentful-paint 716-728ms; 32-52ms
with reduced motion). The first chapter no longer has reveals.
