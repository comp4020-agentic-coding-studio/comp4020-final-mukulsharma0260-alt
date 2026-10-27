# Overlap

**Overlap is an anonymous study lounge for students studying alone, especially late at night.**

To try it as two people, open it in a normal window and a private (incognito) window side by side. Two tabs in one browser are one person.

## Who it is for

Studying alone late is easier when you can tell others are doing the same. Most places that show you other people also ask you to perform: a profile, followers, a streak. Good, here, means glancing at the lounge, seeing that others are studying too, and going back to work less alone, without being asked to say or prove anything. Goffman's public co-presence and Erickson and Kellogg's social translucence name this.

## How the lounge works

Nothing about you counts until you press Enter the Lounge. Inside, you can place one star in the Common Room and move it, or settle it in one of five constellations: Science, Engineering, Business, Health, or Arts & Society. An anonymous cookie gives the same browser the same star back; there is no account.

A star glows while its visitor has entered and has the lounge open in a visible tab. That means a browser is showing the lounge now, not who the person is, where they are, or whether they are at their desk. Placed and moved stars reach every other open lounge within about a second.

## Talking, a little

You may choose a callsign of 3 to 16 letters, digits, spaces, hyphens or underscores. It belongs to your browser, not your star, so it can come first. It is unique and kept for good. Please do not use your real name.

A callsign lets you post in the Common Room conversation. A constellation's conversation is open only to visitors settled there, and the server delivers its messages only to them: an Engineering message is never sent to a visitor settled in Science. Messages are at most 280 characters and show their own send time to the minute; stars and presence show only rough recency. After 24 hours the server never returns a message again.

## What is deliberately missing

No direct messages, profiles, followers, likes, feeds, leaderboards, streaks, permanent chat history, or location.

## What the app enforces

Each has a check in the repository:

- only the browser that placed a star can move it;
- opening the page creates no star and no cookie;
- a placed or moved star reaches another browser within a second;
- two tabs of one browser are one star, glowing until the last visible tab hides;
- a callsign needs no star, and no two visitors share one;
- a constellation's messages reach only visitors settled there;
- messages render as text, posting is rate-limited, and an expired message is never returned; and
- cookies, their hashes and other visitors' exact times never appear in the page or star updates.

## What needs human judgement

Whether the lounge feels calm rather than empty, reads at a glance, and feels like company rather than surveillance.

## Known limits

Overlap runs on one Fly.io machine. Stars live in SQLite on its volume and live updates in one server's memory, so a second machine would see a different lounge; it does not scale out. A restart briefly forgets who is glowing. There is no account recovery and no moderation. The [decision records](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/tree/main/docs/adr) explain why.

## Sources

- Erving Goffman, [*Behavior in Public Places*](https://books.google.com/books?id=-4zZAAAAMAAJ), 1963.
- Thomas Erickson and Wendy Kellogg, [“Social Translucence”](https://doi.org/10.1145/344949.345004), 2000.
- Robin Sloan, [“An App Can Be a Home-Cooked Meal”](https://www.robinsloan.com/notes/home-cooked-app/), 2020.
