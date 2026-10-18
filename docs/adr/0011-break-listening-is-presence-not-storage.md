# Title

Break listening is presence, held in memory, never stored

# Status: Accepted

# Context

The Break drawer plays one of five owner-supplied tracks (docs/credits.md).
A visitor may want to know that others are on a break too, but a "listening
now" count is only honest if it is made of real people doing the thing now.
The rules already say presence lives in memory only, glowing means an entered
star with an open, visible tab (ADRs 0005, 0006), and no count may be
invented.

# Options

1. **No count at all.** Honest but loses the "not alone" signal the product
   is for.
2. **Count plays in SQLite.** Durable, but it would record what a person did
   and when, outlive the moment it describes, and break "presence lives in
   memory only". Rejected.
3. **Show a count from the browser alone.** A browser cannot know anyone
   else is listening. Rejected.
4. **In-memory listening, tied to glowing (chosen).**

# Decision

Option 4.

- `POST /api/listening` with `{"mode":"<id>"}` when the visitor presses Play,
  and `{"mode":null}` on pause or stop. The star is the one the cookie
  resolves to; the mode must be one of the five ids in `src/break.ts`.
- Only a glowing star can listen: the request is refused (409) unless that
  star has an open `/events` stream, and the star is forgotten the moment its
  last stream closes (hidden tab, closed tab, restart).
- `listeningByMode` rides on the existing `sync` and `live` events. It holds
  counts only, never star ids, so nobody can see who is listening to what.
- The drawer shows "N listening now" only when N is above zero.
- Playback is not synchronised: each visitor plays their own copy from the
  start. The drawer says so.
- Audit: `break.listening` (result: the mode) and `break.stopped`, under the
  public star id only (ADR 0009).

# Consequences

- A restart forgets every listener, as it forgets every glow.
- The count can never exceed the glowing stars.
- A visitor with no star can play music but is never counted, because there
  is nobody to count.
- Adding a mode needs a track with a credits entry and a line in
  `src/break.ts`; the page draws the drawer from that list, so a mode without
  a real track cannot appear.
