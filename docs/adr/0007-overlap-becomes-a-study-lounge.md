# Title

Overlap becomes a study lounge

# Status: Accepted

# Context

Overlap began as a shared night sky about *old light*: each anonymous browser
keeps one star, and its brightness records how long ago that browser was
last here. That gave the project an atmosphere, but not an occasion. Nothing
about it told a visitor why they might keep it open, or what being near
other people in it was for.

Late-night study is a common reason to want company without conversation:
people often study better beside others, even strangers, without having to
talk to them. Overlap already has the parts that need: anonymous presence,
one quiet mark each, and a live signal that says only that a browser is
showing the lounge. It has no accounts, profiles, names or free text, and
that is the point.

# Options

1. **Keep it as an art piece about old light.** True to where the project
   started, but it leaves the live signal without a reason to exist, and a
   visitor without a reason to stay.
2. **Make it a quiet study lounge (chosen).** Give the same mechanics an
   occasion: a place to study near others, where the stars and their glow
   are the only sign of company.
3. **Make it a general social space.** A bigger audience, but social spaces
   pull towards names, messages, reactions and feeds, which is exactly what
   Overlap refuses.

# Decision

Option 2. Overlap is an anonymous late-night study lounge. The place is
called the **lounge** in everything a visitor reads; "sky" remains only as
visual imagery. Terms are fixed in [docs/terms.md](../terms.md).

The arrival screen is a picture, not a reading of the lounge: it shows no
count of stars or of who is glowing, because it has not joined the live
stream ([ADR 0006](0006-looking-starts-when-you-enter.md)). Inside the
lounge, every point of light is a visitor.

The stack, identity model, persistence and live-presence rules are
unchanged.

# Consequences

- The audience is narrower: people who want to study with quiet company,
  not anyone curious about a shared sky.
- Copy has to stay honest about what is not built. There is no shared timer,
  no shared ambience and no chat; nothing a visitor reads may imply there is.
- "Old light" stops being the headline. The brightness rules still exist,
  but README.md, PROCESS.md and ADR 0005 describe the earlier framing and
  must be rewritten to match.
- The arrival adds a still image and an optional muted video, so the first
  page is heavier than before; the video loads last and is skipped under
  reduced motion, Save-Data and 2g connections.
