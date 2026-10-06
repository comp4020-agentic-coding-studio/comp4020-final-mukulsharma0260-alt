# Process overview

Overlap began with a question much smaller than "how do I build a multi-user website?" I wanted to make a shared space where the evidence of other people was not text, a profile, or a score. The first answer was a night sky: every visitor gets one anonymous star, and the sky keeps it. Crit 8 is called *old light* because a star's brightness comes from the time since that browser was last seen.

This project is deliberately incomplete. It does not yet call a browser "present" in a real-time sense, and it does not have threads or pulses. Those would be false promises before Crit 9's multi-user decision. For Crit 8, the core interaction is narrower: place a star, move it, return, and find it still there.

## Starting from the constraints

The final-project starter was intentionally almost empty, so the stack was a decision rather than a default. I chose a small Node HTTP server, Node's built-in SQLite support, vanilla browser JavaScript, SVG, and CSS. I did not use a framework, an ORM, a hosted database, or a native SQLite package.

There are only a few routes and one small model. Adding a framework would have given me more conventions but also more code, more dependencies, and more places for an agent to make a mistake. Built-in SQLite avoids a native dependency build on Fly's remote builder, while the plain Node server leaves a clear route to a server-sent-events layer in Crit 9. I recorded the identity and persistence trade-off in [ADR 0001](docs/adr/0001-durable-anonymous-stars.md): an account would make identity more portable but is excessive for a one-star night sky; browser-only `localStorage` would be simpler but would make ownership something the server merely trusts.

The first implementation commit, [`1a1b15b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/1a1b15b), established this foundation.

## Persistence as a real claim

Using SQLite was not enough on its own. On Fly, only the mounted volume survives redeployment. Server memory and the container filesystem do not. The database therefore lives at `/data/stars.db` in production, with a local path only for development and tests.

I also rejected the convenient first version of migration logic: putting `CREATE TABLE IF NOT EXISTS` directly in application code. That would make later database changes hard to account for. Instead, the repository has numbered SQL migrations and a small runner that records which migrations have been applied. The schema is still tiny, but this choice matters because the same repository will carry the project through Crits 9 and 10.

The database, rather than the browser, is the source of truth. Each star has a random public ID, a position stored as fractions between 0 and 1, creation and update times, and a last-seen time. The server stores only a SHA-256 hash of the anonymous cookie token.

## Rules that came from the idea

I did not want "anonymous" to mean "anyone can alter anyone else's star." The server identifies ownership only by hashing the cookie sent with a request. A submitted star ID is never proof of ownership. A second browser can see a first browser's star, but cannot move it.

I also made GET requests non-mutating. Health checks and ordinary page loads should not quietly manufacture activity. Only the explicit `POST /api/here` check-in updates `last_seen_at`. Crit 8 can therefore honestly say "last seen," not "currently here."

The old-light interface arrived in [`c4f5559`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/c4f5559): the homepage is rendered from the database, and SVG supports dragging, touch, keyboard movement, focus, a non-colour "you" marker, and reduced motion.

## Corrections, not just additions

The first visual version revealed a real problem: the browser could stretch a square sky into a wide rectangle, making stars look like small white capsules instead of stars. I added a test that makes that regression visible ([`2a6ce68`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/2a6ce68)) and then corrected the layout in [`99c6116`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/99c6116). That changed my acceptance rule from "the stars are displayed" to "the sky is legible at the browser's actual shape."

The more important corrections were invisible. The app tells a returning visitor how many stars appeared since their previous visit. My first version compared timestamps, and a test that seemed flaky was a real bug: two stars created in the same millisecond were counted wrongly. Rerunning it until it passed had hidden that, so `CLAUDE.md` now says a test that passes on rerun is a failing test until its cause is found ([`9172d4c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/9172d4c)). The next version used SQLite's `rowid`. A review question about whether SQLite reuses deleted rowids led to a test, and it failed: SQLite can reuse the largest deleted `rowid`, so a brand-new star could be missed. I replaced it with a counter that never goes backwards ([`6d391af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/6d391af)) and added migration tests for existing data, each seen failing before I trusted it. This is why the repository has several small correction commits rather than one polished-looking final commit: the harness changed what I believed about the system.

## Harness and acceptance

The rules are written in `CLAUDE.md`, and each important one has a check in `spec/`.

I did not accept local tests as the only evidence. The agent ran two separate cookie identities against the deployed app, checking ownership, visibility, the new-star count, non-mutating GET requests, and survival across a redeploy. But those checks left test stars in the real sky, and a later check added another. I found four when listing production stars and deleted them after a backup. The backup needed its own correction: copying only the main SQLite file would have missed writes still in the WAL file. `CLAUDE.md` now says production checks are read-only or remove what they create ([`daa48e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/daa48e3)), because every star is meant to be a person.

## My role with the agent

The agent implemented quickly, but I set the product limits and acceptance rules: no names, no text, no false presence claim, no GET writes, no client-provided ownership, and no exact timestamps for other visitors. I also used a separate Claude chat to review the agent's reports. It raised the rowid-reuse question and pushed back when a failing test was rerun until it passed; I decided which questions to act on, and accepted a fix only after a check had failed without it. Before building, I compared four rounds of concepts with two chat models. The next question is not "what feature can I add?" It is what a live presence signal should honestly mean. That is the decision I am carrying into Crit 9.
