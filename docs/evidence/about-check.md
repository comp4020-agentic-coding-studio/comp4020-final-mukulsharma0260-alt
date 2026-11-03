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
  only requests are GETs for `/about/`, the galaxy artwork and the first
  chapter's video. No `/events`, no `/api/`, no POST, no other file, no
  cookie.
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

And once per engine, at 390x844, for the first chapter's NASA background
video as shipped (failures are made inside the test browser, never on the
server):

- **Lazy**: at load there is no video element and no video request. The
  video is made only once its chapter has stayed near for at least 550ms.
  Opened straight at `#return`, nothing is made or fetched until the first
  chapter comes back.
- **Silent and decorative**: muted, looped, `playsinline`, no controls, not
  focusable, no audio decoded.
- **First chapter only**: in Chromium it is shown and playing at the top;
  hidden and paused at Focus, Talking and Return; and shown and playing
  again back at the top. Headless WebKit refuses a page's own first
  `play()`, so there the galaxy must stay. If WebKit later allows it on
  coming back, the video must be shown and playing, never shown paused.
- **Paused when unseen**: a hidden tab pauses it, showing the tab resumes
  it, and `pagehide` pauses and hides it.
- **Undecodable file, refused play**: either way the galaxy stays, the slot
  is hidden, and there is no error.
- **Reduced motion, Save-Data, 2g, slow-2g**: no video element, no video
  request, and the galaxy shown. Under reduced motion every thought is shown
  at once (no teleprompter dimming).
- **Contrast over the moving footage**, at 1920x1080, 390x844, 360x844 and
  414x896: every first-chapter thought, measured three times 400ms apart
  while the video plays.
- **Performance** (Chromium): the largest paint, long tasks and layout shift
  over the first 4 seconds with the video, against the same page under
  reduced motion (no video).
- **No JavaScript**: all four chapters and five thoughts are there, none
  dimmed, all selectable.

## Results (3 November 2026, with the NASA background video)

- Application: `dc97849` with this change uncommitted on top, so the page
  ships `about-moon-576.mp4` and `about-moon-576.webm`.
- Checker: `scripts/check-about.ts` as changed with this file, Playwright
  1.64.1, on Node 24.21.0.
- Server: a local throwaway server and a fresh `/tmp` database each run.
- Mac awake throughout (`caffeinate -i`; `pmset -g log` shows no sleep or
  wake from 12:27 to 12:47).

Two runs in a row: **242 of 242** in 8m41s, and **242 of 242** in 8m37s.
Contrast over the video differed by at most 0.11 between them, because the
footage moves.

| Engine | Size | Checks | Lowest contrast | Largest paint | Long tasks | Layout shift |
|---|---|---|---|---|---|---|
| chromium | 1920x1080 | 16 of 16 | 7.99:1 | 124ms | 0 | 0.0000 |
| chromium | 1440x900 | 16 of 16 | 6.56:1 | 76ms | 0 | 0.0000 |
| chromium | 1280x800 | 16 of 16 | 7.44:1 | 76ms | 0 | 0.0000 |
| chromium | 390x844 | 16 of 16 | 6.00:1 | 48ms | 0 | 0.0000 |
| chromium | 360x844 | 16 of 16 | 6.08:1 | 44ms | 0 | 0.0000 |
| chromium | 414x896 | 16 of 16 | 6.58:1 | 44ms | 0 | 0.0000 |
| chromium | 844x390 | 16 of 16 | 6.31:1 | 40ms | 0 | 0.0000 |
| webkit | 1920x1080 | 13 of 13 | 7.44:1 | n/a | n/a | n/a |
| webkit | 1440x900 | 13 of 13 | 6.65:1 | n/a | n/a | n/a |
| webkit | 1280x800 | 13 of 13 | 7.49:1 | n/a | n/a | n/a |
| webkit | 390x844 | 13 of 13 | 5.38:1 | n/a | n/a | n/a |
| webkit | 360x844 | 13 of 13 | 5.97:1 | n/a | n/a | n/a |
| webkit | 414x896 | 13 of 13 | 6.32:1 | n/a | n/a | n/a |
| webkit | 844x390 | 13 of 13 | 6.26:1 | n/a | n/a | n/a |

The per-size runs scroll the whole page, so at the first chapter the video
is behind the words. The phone and landscape lows are in later chapters,
over the galaxy, and match the page before the video to the hundredth.

The video, its failures and the guards (run 1):

```
PASS  chromium 390x844 lazy video  nothing made or fetched at load: at load 0 video, 0 requests; made 622ms after load; 1 requests by 2s
PASS  chromium 390x844 lazy video  made only near its chapter: at Return: 0 video, 0 requests; back at the top: 1 video, 1 requests, /assets/about-moon-576.mp4
PASS  chromium 390x844 lazy video  no console errors: none
PASS  chromium 390x844 video  silent, looped, inline, no controls, not focusable: muted true, loop true, playsinline true, controls false, focusable false, audio false, /assets/about-moon-576.mp4
PASS  chromium 390x844 video  plays behind How it works only: top shown/playing; later chapters all hidden and paused; back at top shown/playing
PASS  chromium 390x844 video  pauses when hidden or left: hidden tab paused, shown again playing, after pagehide paused/hidden
PASS  chromium 390x844 video  no console errors: none
PASS  chromium 390x844 undecodable video  galaxy stays, no error: requests 1, video elements 0, slot on false, opacity 0, galaxy true, errors none
PASS  chromium 390x844 play refused  galaxy stays, no error: requests 0, video elements 1, slot on false, opacity 0, galaxy true, errors none
PASS  chromium 390x844 reduced motion  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  chromium 390x844 reduced motion  every thought shown at once: teleprompter false, dimmed thoughts 0
PASS  chromium 390x844 Save-Data  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  chromium 390x844 2g  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  chromium 390x844 slow-2g  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  chromium 1920x1080 over the video  contrast >= 4.5:1: playing true, 13 text runs, lowest 7.87:1
PASS  chromium 390x844 over the video  contrast >= 4.5:1: playing true, 12 text runs, lowest 7.31:1
PASS  chromium 360x844 over the video  contrast >= 4.5:1: playing true, 12 text runs, lowest 7.31:1
PASS  chromium 414x896 over the video  contrast >= 4.5:1: playing true, 12 text runs, lowest 7.40:1
PASS  chromium 1920x1080 performance  video adds no long task, no shift, no slower paint: with video: LCP 96ms, load 10ms, long tasks 0, CLS 0.0000, video playing, 1 video requests, 1.90 MB of video in 4s | without: LCP 120ms, load 9ms, long tasks 0, CLS 0.0000, video none, 0 video requests, 0.00 MB of video in 4s
PASS  chromium 390x844 performance  video adds no long task, no shift, no slower paint: with video: LCP 40ms, load 8ms, long tasks 0, CLS 0.0000, video playing, 1 video requests, 1.90 MB of video in 4s | without: LCP 40ms, load 8ms, long tasks 0, CLS 0.0000, video none, 0 video requests, 0.00 MB of video in 4s
PASS  chromium 390x844 no JavaScript  readable: 4 chapters, 5 thoughts, dimmed 0, selectable true
PASS  webkit 390x844 lazy video  nothing made or fetched at load: at load 0 video, 0 requests; made 605ms after load; 2 requests by 2s
PASS  webkit 390x844 lazy video  made only near its chapter: at Return: 0 video, 0 requests; back at the top: 1 video, 2 requests, /assets/about-moon-576.mp4
PASS  webkit 390x844 lazy video  no console errors: none
PASS  webkit 390x844 video  silent, looped, inline, no controls, not focusable: muted true, loop true, playsinline true, controls false, focusable false, audio false, /assets/about-moon-576.mp4
PASS  webkit 390x844 video, autoplay refused  galaxy stays: slot on false, opacity 0, galaxy true; later chapters all hidden; back at top on true, opacity 1
PASS  webkit 390x844 video  no console errors: none
PASS  webkit 390x844 undecodable video  galaxy stays, no error: requests 0, video elements 1, slot on false, opacity 0, galaxy true, errors none
PASS  webkit 390x844 play refused  galaxy stays, no error: requests 0, video elements 1, slot on false, opacity 0, galaxy true, errors none
PASS  webkit 390x844 reduced motion  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  webkit 390x844 reduced motion  every thought shown at once: teleprompter false, dimmed thoughts 0
PASS  webkit 390x844 Save-Data  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  webkit 390x844 2g  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  webkit 390x844 slow-2g  still galaxy, no video: video elements 0, video requests 0, galaxy true
PASS  webkit 390x844 no JavaScript  readable: 4 chapters, 5 thoughts, dimmed 0, selectable true
```

Performance, in short: with the video the largest paint stayed at 96ms
(1920x1080) and 40ms (390x844), against 120ms and 40ms without it. There
were no long tasks and no layout shift. The video was first made about
600ms after load, and about 1.9 MB of it had arrived by 4 seconds.

## Lounge unchanged

On the same server with this change: `scripts/check-mobile.ts` 112 of 112,
`scripts/check-views.ts` 54 of 54. The full test suite: 404 of 404.

## The new checks, seen failing

Each new check was made to fail on purpose, on a copy of the check run at
390x844 in Chromium, with the page altered through a request route:

- A thought set at 4rem no longer fits: "thought 4: -42-843 between 64 and
  784".
- The video made at once, without the wait near its chapter: "at Return: 0
  video, 1 requests".
- With the NASA video (3 November 2026), the page altered through a request
  route each time:
  - Made at once: "at load 1 video ... made 2ms after load".
  - Left on after its chapter: "focus: shown, playing, opacity 1.00".
  - Without `muted`: "muted false". Chromium then refused to play it, so
    the play, contrast-over-video and performance checks failed too.

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
