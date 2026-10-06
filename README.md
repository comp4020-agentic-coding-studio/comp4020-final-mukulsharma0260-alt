# Overlap

**Overlap is a shared night sky that remembers only that anonymous people have been here.**

To try it as two people, use a normal window and a private (incognito) window; two tabs in one browser are one person.

When I first arrive, I place one star. Its position is mine when I return. The star is bright within an hour of a visit, softer within a day, dimmer within a week, and faint after that. It never disappears. The idea comes from real starlight: seeing a star is also seeing a small record of its past.

This first version is called *old light*. It deliberately does **not** claim that somebody is here right now. "Last seen" means only the last successful check-in from that browser. A tab can be closed, asleep, offline, or left in the background; Overlap should not pretend it knows where a person is.

## What good looks like here

I want Overlap to feel unlike a social network. It should not ask visitors to introduce themselves, explain themselves, compete, collect likes, or fill a feed with text. A visitor should be able to leave a small mark without turning that mark into a profile.

Erving Goffman's *Behavior in Public Places* helped me think about how much social life comes from simply noticing other people nearby, rather than from formal conversation. Thomas Erickson and Wendy Kellogg's idea of "social translucence" was another useful direction: systems can make people and activity visible without demanding that people perform for one another. Overlap takes only a small part of that idea. The sky makes a trace of shared use visible, but deliberately leaves out names and messages.

Robin Sloan's idea of software as a "home-cooked meal" helped me keep the scale small. Overlap is not trying to become a universal social platform. It is a small place for a class, a group of friends, or one particular evening. Its value is in the atmosphere of return, not in serving millions of people.

A good Overlap sky should feel calm and legible. Returning to an old star should feel like coming back to somewhere that remembers you. Seeing dim stars should suggest that other people passed through without exposing who they are or exactly when they were there.

## What the app enforces

Some promises are technical and are checked in the repository:

- one browser identity can create only one star;
- only the browser that owns a star can move it;
- opening the page never creates or changes a star;
- star positions survive reloads and server restarts, and a live check confirmed one survives a redeploy;
- a returning visitor's count of new stars stays exact, even after stars are deleted;
- there are no visitor names or free-text messages; and
- raw identity tokens, token hashes, and other visitors' exact timestamps never appear on the page.

Other claims need human judgement:

- whether the sky feels like a record of being together;
- whether fading old light makes return meaningful; and
- whether the visual design feels quiet rather than empty.

Crit 8 is the durable beginning. Crit 9 will ask the harder question: what should count as being here *now*, and how should that change the sky for everyone else?

## Sources

- Erving Goffman, [*Behavior in Public Places*](https://books.google.com/books?id=-4zZAAAAMAAJ), 1963.
- Thomas Erickson and Wendy Kellogg, ["Social Translucence: An Approach to Designing Systems That Support Social Processes"](https://doi.org/10.1145/344949.345004), 2000.
- Robin Sloan, ["An App Can Be a Home-Cooked Meal"](https://www.robinsloan.com/notes/home-cooked-app/), 2020.
