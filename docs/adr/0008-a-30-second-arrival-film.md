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

Option 3. A first entry plays a 30-second film: a warp towards the galaxy's
bright core, drawn in code on a canvas, with a soft pad generated with Web
Audio. A small "ARRIVING" bar shows progress through the film and the
seconds left; it never says "loading" or "ready", because nothing is
loading. One mood line at a time changes every five seconds.

When the film ends or is skipped, the music fades out over a second and the
lounge opens immediately; only then does the visitor start glowing. A browser
that has watched or skipped the film goes straight in on later entries.
Reduced motion gets no film and no music. The film is drawn rather than
downloaded, so it costs nothing on Save-Data or a slow connection.

Music plays only in the film. The lounge stays quiet.

# Consequences

- First entry is delayed by up to 30 seconds for anyone who does not skip.
  Skip is visible from the start, but a visitor who misses it waits.
- The film is drawn in code, not filmed: no footage to licence and no file to
  download, but also no photographic detail. Its look depends on the device's
  canvas performance, and it is drawn at a device pixel ratio of at most 2.
- The music is a generated pad, not a composed track. It is quiet by design;
  a MUTE pill turns it off, and that choice is remembered.
- The film is remembered per browser, in localStorage. Clearing site data
  shows it again.
