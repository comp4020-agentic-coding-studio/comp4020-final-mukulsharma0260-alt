# Process overview

Overlap is an anonymous study lounge for students studying alone, especially late at night. Each visitor may keep one star, the star glows while their lounge is open in a visible tab, and short-lived conversations give just enough coordination. Building it was less about features than about deciding what the app may honestly claim about people, then making the server and its tests hold to that.

## Testing outside class

No informal testing outside class has happened yet. When it does, factual notes, and photographs or screenshots taken with the consent of everyone shown, will be added here and in [the testing protocol](docs/evidence/friend-testing.md). Each observation will link to the commit, test or decision it led to, or say that no change was made.

<!--
![Informal two-person Overlap test: separate browser profiles using the live site](docs/evidence/friend-tests/YYYY-MM-DD-two-person-test.jpg)

*Informal testing outside class, [date]. Two students opened the deployed app from the public URL in separate browser profiles. Observation: [factual result]. Follow-up: [commit, test, ADR, or no change]. Faces, private messages, unrelated tabs, and location information are cropped or blurred with consent.*
-->

## From old light to a study lounge

Overlap began as an artwork about *old light* ([`c4f5559`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/c4f5559)): each anonymous browser kept one star, and its brightness recorded how long ago that browser was last seen. In [ADR 0007](docs/adr/0007-overlap-becomes-a-study-lounge.md) I concluded that it had an atmosphere, but not an occasion: nothing told a visitor why they might keep it open. Late-night study gave the same mechanics a reason ([`5e131af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/5e131af)). I rejected a general social space, because those pull towards names, reactions and feeds. Identity, persistence and live presence did not change; the vocabulary did, fixed in `docs/terms.md` ([`0d3466c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/0d3466c)).

## What good means

Good means evidence of company without performance: no profiles, followers, likes, streaks or feed. Some of that is enforceable and some is judgement. A star cannot be moved by another browser; whether a glowing star feels like company or surveillance is for people to judge. Location is the clearest refusal: I wrote down why a "study nearby" filter would leak where people are, ([`c17045b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/c17045b)), and a test checks that no location column exists.

## Making company legible

The first lounge drew every star as an equal dot. Locally there were more than 400, and nobody could tell where to go. That count came mostly from automated tests and screenshot runs, not real visitors, but the legibility problem was real. The first build, an Observatory that drew only glowing visitors and turned everyone else into numbers, hid the shared place, so I rejected it. The Common Room became the default view, with five constellations as optional places for a star, then each constellation became its own full-screen view, because focusing a region "did not feel like going anywhere" ([`8d3daeb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/8d3daeb), [ADR 0010](docs/adr/0010-five-fixed-constellations-on-the-star.md)). Looking at a populated screenshot found a real bug: every newcomer settling in Engineering landed on one point.

## A small stack on one machine

I chose a plain Node server, Node's built-in SQLite, server-sent events and vanilla JavaScript. SSE fits because the server mostly pushes changes outward while ordinary POSTs carry actions. Identity is an HttpOnly cookie whose SHA-256 hash is the only thing stored, so a request body never proves ownership ([ADR 0001](docs/adr/0001-durable-anonymous-stars.md)). The Fly volume holds the only copy of the data. Presence, the SSE bus and chat rate limits live in one process's memory, so Overlap runs on exactly one machine; a second would see a different lounge. I raised Fly's connection limit for long-lived streams ([`5dfc3ce`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/5dfc3ce)), but I have not tested scaling out and do not claim it.

## Directing and correcting the agent

I wrote rules in `CLAUDE.md` before code, approved plans before implementation, and reviewed plans in a separate Claude chat. My first real-time decision record compared transports when the real question was what "live" may mean, so I superseded it ([`6c3f397`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/6c3f397)) and turned down a grace period and a viewer count. An early plan stored callsigns as columns on the star; it was rejected before any code, because a visitor must be able to choose a callsign before placing a star, so callsigns became their own table keyed by the identity hash ([`acff055`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/acff055)). That design exposed a real bug, a second cookie minted for one browser, fixed in [`b446a75`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/b446a75). When the agent proposed deferring isolation tests until constellation conversations existed, I asked for room-scoped delivery and its tests first ([`6800a12`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/6800a12)).

## Rules that became tests

Three promises run from a written rule through server code to a test.

- **Ownership.** The server resolves a star only from the cookie. When B sends A's star id, only B's star moves, and the log names B ([`20e8651`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/20e8651), `spec/audit.test.ts`).
- **Isolation.** An Engineering message is never delivered to a Science stream. The test reads the Science stream's raw frames, not its rendered drawer, and reverting the room membership made it fail ([`96bd3d0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/96bd3d0), [`daad6e5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/daad6e5)).
- **Callsign independence.** A callsign needs no star, and placing a star later reuses the same identity (`spec/callsign.test.ts`, [ADR 0012](docs/adr/0012-anonymous-callsigns.md)).

The rule that a test passing on rerun is still failing found real bugs: a same-millisecond miscount ([`9172d4c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/9172d4c)), SQLite reusing a deleted rowid ([`6d391af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/6d391af)), and test files racing on one server ([`4a800a9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/4a800a9)).

## Operational mistakes

A live check after an early deploy created a stray production star; I backed up, deleted it, and required live checks to be read-only or clean up after themselves ([`daa48e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/daa48e3)). Later, an end-to-end callsign check created a durable star and callsign. The app has no delete path and never releases a callsign, so cleanup was impossible; I left the harmless anonymous trace, and live checks are now read-only unless I explicitly approve a write. Backups went the same way. When migration 004 shipped, I backed up and rehearsed before a manual deploy ([`78b28e8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/78b28e8)). When chat's migration shipped, a push deployed automatically before the backup I intended, so that backup came after the deploy. No data was lost, but `CLAUDE.md` now says a push to `main` is a deploy.

## Deliberate limits

The deletion sweep for expired messages and their live removal are written and tested locally ([`40b7800`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/40b7800), [`2d76936`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/2d76936)) but not deployed; production hides expired messages but does not yet delete them. Expired rows may survive in volume snapshots and backups. There is no moderation or report path, callsigns are never released, a chat message shows its own send time to the minute, and the app does not scale beyond one machine.
