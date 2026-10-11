# Overlap

**Overlap is a shared night sky that remembers only that anonymous people have been here.**

To try it as two people, open a normal window and a private (incognito) window side by side, then move a star in one. Two tabs in one browser are one person.

When I first arrive, I place one star. Its position is mine when I return. The star is bright within an hour of a visit, softer within a day, dimmer within a week, and faint after that. It never disappears. The idea comes from real starlight: seeing a star is also seeing a small record of its past.

A star also glows while someone is *looking at the sky now*: the browser has a live connection and the Overlap tab is visible. That does not mean the person is physically at their keyboard. A background tab can stay open for hours without attention, so visibility is the closest honest signal the app can use. The cost is that it unfairly hides someone who keeps Overlap open in the background while working, studying, or watching from another tab. [ADR 0005](docs/adr/0005-live-means-looking-at-the-sky.md) records the options I rejected.

## What good looks like here

I want Overlap to feel unlike a social network. It should not ask visitors to introduce themselves, compete, collect likes, or fill a feed with text. A visitor should be able to leave a small mark without turning that mark into a profile.

Erving Goffman’s *Behavior in Public Places* helped me think about how much social life comes from simply noticing other people nearby. Thomas Erickson and Wendy Kellogg’s idea of “social translucence” was another useful direction: systems can make people and activity visible without demanding that people perform for one another. The sky makes a trace of shared use visible, but deliberately leaves out names and messages.

Robin Sloan’s idea of software as a “home-cooked meal” helped me keep the scale small. Overlap is a small place for a class, a group of friends, or one particular evening. Its value is in the atmosphere of return, not in serving millions of people.

A good Overlap sky should feel calm and legible: coming back to an old star should feel like returning somewhere that remembers you.

## What the app enforces

These promises are checked in the repository:

- each browser owns one star, and only that browser can move it;
- opening the page never creates or changes a star;
- a star placed or moved in one browser reaches every other open sky within a second, with no reload;
- two tabs of one browser count as one person, and a halo, held only in server memory, goes out when the last visible tab closes or hides;
- star positions survive reloads, restarts and redeploys (the last checked live);
- the new-star count on return stays exact, even after deletions;
- there are no visitor names or free-text messages; and
- tokens, token hashes, and other visitors’ exact timestamps never appear on the page or in live updates.

Other claims need human judgement:

- whether the sky feels like a record of being together;
- whether a glowing star feels like company rather than surveillance; and
- whether the visual design feels quiet rather than empty.

## Sources

- Erving Goffman, [*Behavior in Public Places*](https://books.google.com/books?id=-4zZAAAAMAAJ), 1963.
- Thomas Erickson and Wendy Kellogg, [“Social Translucence: An Approach to Designing Systems That Support Social Processes”](https://doi.org/10.1145/344949.345004), 2000.
- Robin Sloan, [“An App Can Be a Home-Cooked Meal”](https://www.robinsloan.com/notes/home-cooked-app/), 2020.
