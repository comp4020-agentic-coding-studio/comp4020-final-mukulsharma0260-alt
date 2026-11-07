# About page design notes

The About page at `/about/` (`src/about.ts`) is a page to read, not a second
home page. These notes record what it is meant to do and why its background
video is limited as it is.

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

## The background video

The first chapter, "How Overlap works", plays NASA lunar footage behind a
dark scrim: astronauts working slowly on the Moon, in greyscale. Its source,
as identified by the project author, is NASA's *Restored Apollo 11
Moonwalk*, credited in `docs/credits.md`. The page ships two silent copies,
`about-moon-576.mp4` and `about-moon-576.webm`.

Why it is limited like this:

- **First chapter only.** The video is the opening mood: someone else, far
  away, also at work. Later chapters explain constellations and
  conversations, and a moving picture there would compete with the words.
  So it cross-fades back to the galaxy as the next chapter takes over and
  pauses, and the galaxy carries the rest of the page.
- **Muted, with no audio at all.** The shipped files have no audio track,
  and the element is muted before it has a source. Sound on a page someone
  opens to read would startle them, and Safari plays a video by itself only
  if it is muted from the start.
- **Lazy.** Nothing is fetched at load. The video is made only once its
  chapter has stayed within a screen of view for 600ms, so a link straight
  to a later chapter fetches nothing. It is about 2 MB, so it should never
  cost a reader who does not see it.
- **Optional.** It is decorative (`aria-hidden`, no controls, never
  focusable, no picture-in-picture or casting), and every word is real HTML
  over it. It is never made under reduced motion, Save-Data, 2g or slow-2g.
- **Paused when unseen:** off its chapter, in a hidden tab, and when the page
  is left. It resumes only while its chapter is on screen.
- **Falls back to the galaxy.** The galaxy is always painted under it, as
  the poster. If the file cannot be fetched or decoded, it is removed. If
  the browser refuses to play it, the slot stays hidden. Either way the
  reader sees the still galaxy with nothing blank and no error. Headless
  WebKit refuses a page's own first `play()`, so the check accepts either
  outcome there: the galaxy, or the video playing behind its chapter.
- **Calm.** The supplied copy has black bars in its frame, so the shipped
  files are cropped to the picture rather than scaled past them. On a
  phone, under the heavier scrim, the footage is a little brighter, so it
  still reads as the Moon. The scrim itself is unchanged, so later chapters
  keep their contrast. The footage stays within three flashes a second.

H.264 is chosen where the browser plays it, which is what Safari and iPhone
play most reliably; VP9 WebM is used otherwise.
