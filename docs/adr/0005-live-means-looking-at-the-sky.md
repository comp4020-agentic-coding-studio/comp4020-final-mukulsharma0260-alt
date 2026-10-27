# Title

Live means looking at the sky

# Status: Accepted. Amended by ADR 0006.

Note (27 October 2026): "the sky" here is the place's earlier name. Since
[ADR 0007](0007-overlap-becomes-a-study-lounge.md) the place is the lounge;
the decision about what live means is unchanged.

Supersedes [ADR 0004](0004-live-means-an-open-sky-connection.md).

# Context

The README promises that Overlap says exactly what it knows about other
people and no more: a halo means *a browser is looking at the sky*, never that
a person is present. The brief asks how the app behaves with several people in
it, and the showcase is a room of people with laptops open on many tabs.

ADR 0004 chose server-sent events and made a star live while any connection
for its cookie was open. It compared transports, not meanings. Under it, a
sky left open in a background tab kept its halo all evening, which is exactly
the kind of claim the README says the app will not make. It also gave a
stream only to visitors with a star, so a new visitor, such as a marker's
incognito window, saw a still sky until they placed one.

# Options

1. **Any open connection (ADR 0004).** Simple, but a background tab glows
   indefinitely: the halo says "looking" when nobody can be.
2. **An open and visible tab (chosen).** The browser's own
   `document.visibilityState` decides. A hidden tab closes its stream; a
   visible one reopens it.
3. **Interaction in the last few minutes.** Closer to "someone is at the
   keyboard", but it needs a timer the server must trust, rewards fidgeting,
   and turns quiet watching into absence.
4. **No live presence, last-seen only.** Most honest about what is unknown,
   but drops the felt co-presence the README argues for, and old light
   already covers last-seen.

# Decision

Option 2. A star is live while at least one of its browser's tabs has the sky
open and visible. Two tabs with one cookie are still one star, live until its
last visible tab hides or closes. There is no grace period: as ADR 0004
argued, a halo that lingers after the looking has stopped overclaims, and a
brief flicker is the honest cost.

Every viewer gets a stream, with or without a star, so watching never
requires taking part. Live state stays in process memory only.

Two tabs moving the same star at once is last-write-wins: each move is a
separate POST, the database keeps whichever lands last, and every open sky
converges on that position through the same events.

# Consequences

- Someone reading in a background tab disappears from the sky, although they
  may well still be "with" it.
- A window fully covered by another may be reported hidden by the browser,
  and lose its halo.
- Every tab switch means a reconnect and a fresh snapshot, which is more
  connection churn than ADR 0004's model.
- A reload briefly flickers that star's halo off, since there is no grace
  period to bridge it.
- A forgotten but visible tab still counts as looking.
- Live state still resets on restart or redeploy until browsers reconnect,
  and streams are still process-local, safe only on one Fly machine.
