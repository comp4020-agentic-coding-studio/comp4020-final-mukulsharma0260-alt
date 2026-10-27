# Title

A 30-second arrival film

# Status: Accepted

# Context

Overlap is a study lounge ([ADR 0007](0007-overlap-becomes-a-study-lounge.md)).
Pressing ENTER THE LOUNGE used to open it at once. For a place meant to help
someone settle into study, that cut is abrupt: nothing marks the change from
whatever they were doing to quiet, shared focus.

Being here still begins only when the lounge opens
([ADR 0006](0006-looking-starts-when-you-enter.md)). Anything between the
arrival screen and the lounge must not count the visitor as glowing, must not
pretend to be loading, and must never trap them.

# Options

1. **No film.** Enter opens the lounge at once. Fastest, but entering stays a
   click rather than an arrival.
2. **A 5-second film.** Barely in the way, but too short to change anyone's
   frame of mind; it reads as a delay, not a ritual.
3. **A 30-second film that can be skipped (chosen).** Long enough to leave
   the noise behind, and a visitor who wants to start straight away can skip
   it from the first second with a button, Enter or Escape.

# Decision

Option 3. A first entry plays a 30-second film: the author's Luna AI video,
full-screen and silent, with its skull, face and nude shots removed, slowed to 30 seconds with its hard cuts dissolved so
it never flashes, scored with original music by the project author. A small "ARRIVING" bar shows progress through the film and the
seconds left; it never says "loading" or "ready", because it is not a
loading screen. One mood line at a time changes every five seconds.

The music is fetched only after Enter. It starts quietly, fades in over a
second, and is never downloaded under reduced motion, Save-Data or a 2g
connection; the film then plays silently. When the film ends or is skipped,
the music fades out over a second and the
lounge opens immediately; only then does the visitor start glowing. A browser
that has watched or skipped the film goes straight in on later entries.
Reduced motion, Save-Data and 2g connections get no film and no music; they
go straight into the lounge.

Music plays only in the film. The lounge stays quiet.

# Consequences

- First entry is delayed by up to 30 seconds for anyone who does not skip.
  Skip is visible from the start, but a visitor who misses it waits.
- The source is 720p. It is upscaled to 1080p, which looks sharper on large
  screens but cannot add real detail. The files are about 15 MB (MP4) and
  10 MB (WebM), downloaded on first entry only, and only after Enter.
- The music is a 30-second, 480 KB file, downloaded on first entry only. It
  is quiet by design; a MUTE pill turns it off, and that choice is remembered.
  If it fails to load, the film carries on in silence.

Amended 18 October 2026: the drawn warp was replaced by the author's Luna AI
video; the generated Web Audio
pad was replaced by the author's own track; lines now run in a fixed order.
Media are credited in [docs/credits.md](../credits.md).
- The film is remembered per browser, in localStorage. Clearing site data
  shows it again.

Amended 27 October 2026: a browser that has entered before still goes
straight into the lounge (the `overlap-arrival-v2` flag in localStorage),
so the arrival was unreachable for returning visitors. The lounge's top
bar now has a "Replay arrival experience" button. It leaves the lounge as
hiding the tab would (the stream closes and the star stops glowing; Break
stops), shows the arrival screen with focus on Enter, and Enter then plays
the whole film again, skippable as before. Reduced motion, Save-Data and
2g still get no film. Nothing about the visitor is reset: cookie, star,
callsign and conversations all stay. The arrival still opens no stream and
sends no check-in until Enter (ADR 0006).
