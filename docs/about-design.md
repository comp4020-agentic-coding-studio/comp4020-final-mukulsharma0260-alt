# About page design notes

The About page at `/about/` (`src/about.ts`) is a page to read, not a second
home page. These notes record what it is meant to do and the one thing still
waiting on a decision: its background video.

## Shape

- A teleprompter over a fixed stage. Five short thoughts, one per scroll
  step; the one nearest the middle of the screen is lit and the rest wait
  dimmed. Then a quiet ending with "Return to the lounge".
- Four chapters: How it works (the first three thoughts), Focus, Talking,
  Return. A small rail of diamond dots marks them (a bottom row on a phone).
- Navigation is the wordmark, a small "Back to lounge" in the header, and the
  chapter dots. There is no large call to action.
- The stage is the credited arrival galaxy, a scrim darkest where the words
  sit, slow drifting light, and faint constellation lines. On a phone the
  header and the dot row each sit on an opaque shade, so words scroll under
  them rather than behind them.
- No pretend visitors or live numbers. The constellation figures are lines
  and hollow diamonds, never star dots.

## Rules it keeps

- Every word is real HTML, readable without JavaScript and without motion.
  The dimming is added only by the page's script, and only without reduced
  motion.
- Opening it sets no cookie, places no star, opens no `/events` stream and
  calls no API. Only "Back to lounge", "Return to the lounge" or the wordmark
  go to the lounge, and only then does the lounge's own arrival flow begin.
- `scripts/check-about.ts` checks all of this in Chromium and WebKit at seven
  sizes; the results are in `docs/evidence/about-check.md`.

## The background video (pending source verification)

The first chapter, "How Overlap works", has a slot for a full-bleed moving
background behind a dark scrim. The slot ships **empty**
(`ABOUT_VIDEO = ""` in `src/about.ts`), so the live page shows the still
galaxy.

The video the user supplied for it is **not used, copied or credited** yet:

- What it is: a 60-second clip of lunar-surface footage (it appears to be
  Apollo mission film), 736x414 H.264 with an AAC audio track, about 2.9 MB.
- Where it came from: a Klickpin download of a Pinterest pin. That is a
  repost, not the original source, and CLAUDE.md allows nothing from social
  media.
- Status: **pending source verification.** The user will supply the
  original Pexels URL and licence details. Until then it has no entry in
  `docs/credits.md` and no copy anywhere in the repository.

It was used only to preview the design locally: the browser check, given
`PREVIEW_VIDEO=<file>`, serves the file from outside the repository to its
own browser through a request route. Nothing was re-encoded or saved.

Once the source and licence are confirmed, the steps are:

1. Record the source URL, author and licence in `docs/credits.md`.
2. Produce a small, silent, web-ready copy (no audio track; the page never
   plays sound), and put it under `public/assets/`.
3. Set `ABOUT_VIDEO` to its path, update the empty-slot test in
   `spec/about.test.ts`, and rerun `scripts/check-about.ts` with and without
   `PREVIEW_VIDEO`.

## How the video behaves once set

- Muted, looped and `playsinline`, decorative (`aria-hidden`), never
  preloaded, with no controls and no picture-in-picture.
- Made only once its chapter has stayed within a screen of view for 600ms,
  so a link straight to a later chapter fetches nothing.
- Shown and playing only while the first chapter still reaches past the
  middle of the screen. Then it cross-fades back to the galaxy and pauses.
  It also pauses while the tab is hidden.
- Never made under reduced motion, Save-Data, 2g or slow-2g.
- If it fails to load, or the browser refuses to play it, the galaxy stays,
  with no error. Headless WebKit refuses a page's own `play()` without a
  gesture. The check expects that and verifies the galaxy stays. Safari
  allows a muted inline video to play by itself.
- Scaled past `cover` and shown in greyscale, so footage with bars in its
  frame still fills the screen and stays quiet behind the words. Contrast
  over an approved video must be measured with `PREVIEW_VIDEO` before it
  ships; the preview clip is not evidence.
