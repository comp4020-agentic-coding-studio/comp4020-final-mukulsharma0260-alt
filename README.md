# Overlap

**Overlap is a shared night sky that remembers anonymous visitors, and lets the people looking at it now notice one another.**

Try it with a normal window and a private/incognito window. Two ordinary tabs are one person here because they share one anonymous cookie and therefore one star.

When I first arrive, I place one star. Its position is mine when I return. It is bright within an hour of a visit, softer within a day, dimmer within a week, and faint after that. It never disappears. This is *old light*: seeing a star is also seeing a small record of its past.

A small blue halo is different. It means that browser has an open connection to the sky right now. If someone moves or places a star, every open sky changes without a reload. I do not call that person “present”: a tab can be open while someone is away, and a network connection can drop. The app says exactly what it knows—*a browser is looking at the sky*—and no more.

## What good looks like here

I want Overlap to feel unlike a social network. It should not ask visitors to introduce themselves, explain themselves, compete, collect likes, or fill a feed with text. A visitor should be able to leave a small mark without turning that mark into a profile.

Erving Goffman's *Behavior in Public Places* helped me think about how much social life comes from simply noticing other people nearby, rather than from formal conversation. Thomas Erickson and Wendy Kellogg's idea of “social translucence” was another useful direction: systems can make people and activity visible without demanding that they perform for one another. Overlap takes only a small part of that idea. The sky makes shared use visible, but deliberately leaves out names and messages.

Robin Sloan's idea of software as a “home-cooked meal” helped me keep the scale small. Overlap is not trying to become a universal social platform. It is a small place for a class, a group of friends, or one particular evening. Its value is in the atmosphere of return, not in serving millions of people.

A good Overlap sky should feel calm and legible. Returning to an old star should feel like coming back to somewhere that remembers you. Opening it beside somebody else should make the sky subtly more alive, without making either of you perform for the other.

## What the app enforces

Some promises are technical and checked in the repository:

- one browser identity can create only one star, and only that browser can move it;
- a placed star and its position survive reloads, server restarts, and redeploys;
- every open browser receives another star's placement or movement through a live connection in about a second, without a reload;
- a live halo exists only while at least one browser connection for that star is open, and is never stored as permanent history;
- there are no names, free-text messages, or client-provided ownership claims; and
- raw identity tokens, token hashes, and other visitors' exact timestamps never reach the page or live events.

Other claims need human judgement: whether the sky feels like a record of being together, whether old light makes return meaningful, and whether live halos make co-presence felt without making the sky noisy.

## Sources

- Erving Goffman, [*Behavior in Public Places*](https://books.google.com/books?id=-4zZAAAAMAAJ), 1963.
- Thomas Erickson and Wendy Kellogg, [“Social Translucence: An Approach to Designing Systems That Support Social Processes”](https://doi.org/10.1145/344949.345004), 2000.
- Robin Sloan, [“An App Can Be a Home-Cooked Meal”](https://www.robinsloan.com/notes/home-cooked-app/), 2020.
