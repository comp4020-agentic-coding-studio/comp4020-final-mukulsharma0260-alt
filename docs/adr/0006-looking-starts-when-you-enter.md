# Title

Looking starts when you enter

# Status: Accepted

Amends [ADR 0005](0005-live-means-looking-at-the-sky.md).

# Context

The arrival screen previews Overlap without joining its shared sky. Calling a
visitor live while they are only reading that invitation would make the halo
mean less than the README promises.

Amended 17 October 2026 (see [ADR 0007](0007-overlap-becomes-a-study-lounge.md)):
an earlier draft also let the arrival show a read-only snapshot of how many
stars were glowing. That is withdrawn. Before entering, the page has not
joined the stream, so any count it showed would claim to know who is present
when it does not. The arrival shows no star or glowing count at all.

# Options

1. **Count the arrival screen as looking.** This gives a bigger live count,
   but treats reading an invitation as joining the sky.
2. **Count only after entering (chosen).** A visitor deliberately enters
   before their visible tab opens the live stream and can affect live state.

# Decision

Choose option 2. The arrival page renders without an SSE stream. Clicking
Enter, or pressing Escape to skip the arrival, stores only a local browser
flag and then opens the same visible-tab stream described by ADR 0005.

# Consequences

A visitor who never presses Enter is never counted as present, even if they
read the arrival screen for a long time. Nor do they see how many others are
glowing until they enter: the arrival is a picture, not a reading of the
lounge.
