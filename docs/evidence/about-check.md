# About page check

Results of `scripts/check-about.ts`, the browser check for the About page at
`/about/`, run against a local throwaway server (a fresh `/tmp` database),
never production. It runs in Chromium and WebKit at the seven sizes in the
About brief: 1920x1080, 1440x900, 1280x800, 390x844, 360x844, 414x896 and
844x390. The page's design is described in `docs/about-design.md`.

## What it checks, at every size, in both engines

- **First screen**: the kicker, "How Overlap works" and the cue to scroll
  are inside the view, below the header, and fully shown 400ms after load.
  No link in the story is on the first screen: there is no call to action.
- **One thought at a time, each fitting**: each of the five thoughts, brought
  to the middle of the screen, is the only one lit (opacity 1). The whole
  thought, its line and its note, sits between the header and the chapter
  dots (a bottom row on a phone) and clear of the rail on the right.
- **No sideways scroll**, at every scroll position.
- **Contrast**: every text run a reader can see, measured against the pixels
  really behind it (a screenshot with the text made transparent), at every
  scroll position. At least 4.5:1. A dimmed waiting thought, and words
  passing under the opaque header or dot row, are measured once they are
  lit and clear. The check scrolls in steps small enough that every run is
  measured somewhere, and names any run it never measured.
- **Targets**: every link at least 44px each way.
- **Keyboard**: Tab reaches the eight links in reading order (wordmark, Back
  to lounge, the four chapter dots, Return to the lounge, Read the technical
  notes), each with a 2px ring. Story links come to rest clear of the header
  and the dot row. (WebKit is driven with Option+Tab, as Safari reaches
  links.)
- **Back and forward**: a chapter dot adds `#focus`; Back returns to the top
  of `/about/`. Back to lounge, then Back, shows the About page again.
- **Stays out of the lounge**: until the visitor chooses Back to lounge, the
  only requests are GETs for `/about/` and the galaxy artwork. No `/events`,
  no `/api/`, no POST, no cookie.
- **One stream after entering**: the page counts its own open streams. On
  the arrival screen 0; after Enter 1; Back on About 0; forward and Enter
  again 1.
- **Glows only while in the lounge**: a second browser in the lounge watches
  the visitor's star. It is not glowing on the arrival screen, glows after
  Enter, stops when the visitor goes Back to About, and glows again after
  re-entering.
- **No console errors.**
- Chromium only (WebKit reports none of these entries): **no long task over
  50ms**, **no layout shift**, **largest paint within 1s**, read before any
  scrolling.

And once per engine, at 390x844:

- **Lazy video**: the page ships an empty video slot. The check hands it a
  stand-in address that it answers itself. Opened straight at `#return`,
  nothing is made or fetched. Back at the top, the video is made and
  fetched once.
- **Unplayable video**: the stand-in is an empty response. The video is
  dropped, the slot stays hidden, the galaxy stays, and there is no error.
- **Reduced motion, Save-Data, 2g, slow-2g**: no video element, no video
  request, and the galaxy shown. Under reduced motion every thought is shown
  at once (no teleprompter dimming).
- **With a real file** (only when `PREVIEW_VIDEO` is given): the file is
  served by the check from outside the repository. Muted, looped and
  inline. In Chromium it is shown and playing at the top and while still in
  How it works, hidden and paused at Focus, and shown and playing again back
  at the top. Headless WebKit refuses a page's own `play()` without a
  gesture, so there the check requires that the galaxy stays with no error.
  Contrast over the moving frames is measured at every thought.
- **No JavaScript**: all four chapters and five thoughts are there, none
  dimmed, all selectable.

## Results (2 November 2026, committed at 6f2474c)

This is the evidence for the page as shipped.

- Application: commit `6f2474c`, the commit that adds this About page, with
  the video slot empty.
- Checker: `scripts/check-about.ts` as committed with this file (blob
  `41425f1`), with Playwright 1.64.1, Chromium 156.0.8078.4 and WebKit 27.2,
  on Node 24.21.0.
- Server: a local throwaway server and a fresh `/tmp` database. No
  `PREVIEW_VIDEO`, and no video file anywhere.
- Mac awake throughout (`caffeinate -i`; `pmset -g log` shows no sleep or
  wake from 23:29 to 23:36).

**219 of 219**, exit code 0, 6m34s.

Every lowest-contrast value matches the earlier uncommitted run of the same
page to the hundredth. Only Chromium's largest paint differs: 136ms against
80ms at 1920x1080, and within 12ms at four other sizes. All are within 1s.

| Engine | Size | Checks | Lowest contrast | Largest paint | Long tasks | Layout shift |
|---|---|---|---|---|---|---|
| chromium | 1920x1080 | 16 of 16 | 8.58:1 | 136ms | 0 | 0.0000 |
| chromium | 1440x900 | 16 of 16 | 6.56:1 | 76ms | 0 | 0.0000 |
| chromium | 1280x800 | 16 of 16 | 7.44:1 | 68ms | 0 | 0.0000 |
| chromium | 390x844 | 16 of 16 | 6.00:1 | 44ms | 0 | 0.0000 |
| chromium | 360x844 | 16 of 16 | 6.08:1 | 40ms | 0 | 0.0000 |
| chromium | 414x896 | 16 of 16 | 6.14:1 | 44ms | 0 | 0.0000 |
| chromium | 844x390 | 16 of 16 | 6.31:1 | 44ms | 0 | 0.0000 |
| webkit | 1920x1080 | 13 of 13 | 8.53:1 | n/a | n/a | n/a |
| webkit | 1440x900 | 13 of 13 | 6.65:1 | n/a | n/a | n/a |
| webkit | 1280x800 | 13 of 13 | 7.49:1 | n/a | n/a | n/a |
| webkit | 390x844 | 13 of 13 | 5.38:1 | n/a | n/a | n/a |
| webkit | 360x844 | 13 of 13 | 5.94:1 | n/a | n/a | n/a |
| webkit | 414x896 | 13 of 13 | 6.31:1 | n/a | n/a | n/a |
| webkit | 844x390 | 13 of 13 | 6.26:1 | n/a | n/a | n/a |

Guards and no-JavaScript, at 390x844:

```
PASS  chromium 390x844 lazy video  made only near its chapter: at Return: 0 video, 0 requests; back at the top: 1 requests
PASS  chromium 390x844 unplayable video  galaxy stays, no error: video elements 0, slot on false, slot opacity 0, galaxy true, errors none
PASS  chromium 390x844 reduced motion  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  chromium 390x844 reduced motion  every thought shown at once: teleprompter false, dimmed thoughts 0
PASS  chromium 390x844 Save-Data  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  chromium 390x844 2g  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  chromium 390x844 slow-2g  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  chromium 390x844 no JavaScript  readable: 4 chapters, 5 thoughts, dimmed 0, selectable true
PASS  webkit 390x844 lazy video  made only near its chapter: at Return: 0 video, 0 requests; back at the top: 1 requests
PASS  webkit 390x844 unplayable video  galaxy stays, no error: video elements 0, slot on false, slot opacity 0, galaxy true, errors none
PASS  webkit 390x844 reduced motion  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  webkit 390x844 reduced motion  every thought shown at once: teleprompter false, dimmed thoughts 0
PASS  webkit 390x844 Save-Data  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  webkit 390x844 2g  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  webkit 390x844 slow-2g  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  webkit 390x844 no JavaScript  readable: 4 chapters, 5 thoughts, dimmed 0, selectable true
```

The video checks above use the check's own empty stand-in response, never
a real video file.

### Historical: an earlier local video preview

Not evidence for the shipped page. Before this commit, one uncommitted run
on top of `59b8f3b` also set `PREVIEW_VIDEO` to the supplied preview clip,
served to the check's own browser from outside the repository, and passed
225 of 225, including contrast over the moving frames. That clip is pending
source verification (`docs/about-design.md`) and is not used, copied or
credited, and the page ships no video, so none of those results are relied
on here.

## Lounge unchanged

Recorded before this commit, with the About change in place on a local
throwaway server: `scripts/check-mobile.ts` 112 of 112 and
`scripts/check-views.ts` 54 of 54.

## The new checks, seen failing

Each new check was made to fail on purpose, on a copy of the check run at
390x844 in Chromium, with the page altered through a request route:

- A thought set at 4rem no longer fits: "thought 4: -42-843 between 64 and
  784".
- The video made at once, without the wait near its chapter: "at Return: 0
  video, 1 requests".

## What the first runs found

Found by the check, then fixed in the page:

- The lit chapter label sat over the bright core of the galaxy on the right
  (2.6-2.9:1 at 1440x900 and 1280x800). The scrim now darkens the right edge
  too.
- On a phone the chapter labels were `display: none`, which left the dots
  with no name for a screen reader. They are now visually hidden instead.
- At 844x390 words scrolling down passed behind the lit gold dot (1.44:1).
  The dot row now sits on an opaque shade across the full width, like the
  header, so words go under it.
- Opened at `#return`, the page scrolls there after `load`, so the first
  chapter was briefly "near" and the video was fetched. It now has to stay
  near for 600ms.

The check's own faults, fixed in the check:

- It counted the visually hidden phone labels as visible text that was never
  measured.
- Half-screen scroll steps never left the Talking note wholly clear of both
  bars at 844x390, so it was never measured. The step now follows the space
  between the bars, and unmeasured runs are named.

Earlier faults, kept from the first version of this check: contrast keyed by
document order (identical words are measured separately); streams counted
inside the page, because Playwright misses an EventSource that the
back-forward cache closes; focus judged only once scrolling stops.
