# Process overview

Overlap began with a question much smaller than “how do I build a multi-user website?” I wanted to make a shared space where the evidence of other people was not text, a profile, or a score. The first answer was a night sky: every visitor gets one anonymous star, and the sky keeps it. A star’s brightness comes from the time since that browser was last seen, which I call *old light*. Since Crit 9, a star also glows while someone is looking at the sky now, and every placed or moved star reaches every open sky within about a second.

## Starting from the constraints

The final-project starter was intentionally almost empty, so the stack was a decision rather than a default. I chose a small Node HTTP server, Node’s built-in SQLite support, vanilla browser JavaScript, SVG, and CSS, with no framework, ORM, hosted database, or native SQLite package. There are only a few routes and one small model, and every extra layer is another place for an agent to make a mistake. [ADR 0001](docs/adr/0001-durable-anonymous-stars.md) records the identity trade-off: accounts are excessive for a one-star sky, and browser-only storage would make ownership something the server merely trusts.

For real time I used server-sent events. SSE fits because Overlap mainly needs the server to quietly push changes outward, while normal HTTP requests already handle placing and moving stars. WebSockets would add a two-way protocol the app does not need, and polling would keep asking when nothing has changed. One Fly machine makes an in-process event bus enough, at the cost of live state resetting on redeploy. Every open sky also holds a connection, so I raised Fly’s connection limit from its default of 25 to 250 ([`5dfc3ce`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/5dfc3ce); first version [`8d9f16d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/8d9f16d)).

## Memory versus history

SQLite on the Fly volume holds what should last: each star’s position, stored as fractions from 0 to 1, its creation and last-seen times, and only a SHA-256 hash of the anonymous cookie. Live presence lives only in server memory and is never written to the database. That split is the design: the sky remembers that you were here as old light, but it should not keep a permanent record of exactly when you were watching.

## Rules that came from the idea

Ownership comes only from hashing the request’s cookie; a submitted star ID is never proof. GET requests, including the live stream, never write. Live events follow the page’s privacy rules.

## The Crit 9 decision: what “here now” means

“Looking at the sky now” means the browser has a live connection and the Overlap tab is visible, not that the person is physically at their keyboard. A background tab can stay open for hours without attention, so visibility is the closest honest signal the app can use.

I compared four options in [ADR 0005](docs/adr/0005-live-means-looking-at-the-sky.md): any open tab, an open and visible tab, recent interaction, and no live presence at all. Any open tab would count forgotten tabs as company. The choice has a cost: it unfairly hides someone who is genuinely keeping Overlap open in the background while working, studying, or watching from another tab. I kept the first version’s refusal of a grace period: a halo that lingers after someone leaves would overclaim, so a reload briefly flickers instead ([`599f247`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/599f247)).

## Corrections, not just additions

In Crit 8 the browser stretched the square sky into a wide rectangle; a test now guards the aspect ratio ([`2a6ce68`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/2a6ce68)). The count of new stars since a visit was wrong twice: first two stars in the same millisecond were miscounted, which a rerun-until-green habit had hidden ([`9172d4c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/9172d4c)); then SQLite reused a deleted `rowid`, so I replaced it with a counter that never goes backwards ([`6d391af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/6d391af)). Live checks also left test stars in the real sky, so production checks are now read-only or clean up after themselves ([`daa48e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/daa48e3)).

My first real-time version ([`8d9f16d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/8d9f16d)) counted any open connection as live, and its decision record ([ADR 0004](docs/adr/0004-live-means-an-open-sky-connection.md)) compared SSE, WebSockets and polling. That answered the wrong question: the transport was never the decision. I superseded it with [ADR 0005](docs/adr/0005-live-means-looking-at-the-sky.md) ([`6c3f397`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/6c3f397)), which decides what live is allowed to mean, and rebuilt presence around visible tabs. New checks also found a real ordering bug, where a new stream heard live updates before its snapshot ([`8f8ef9a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/8f8ef9a)), and a Crit 8 check that failed three runs in four because test files raced on one server, so they now run one at a time ([`4a800a9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/4a800a9)).

## Harness and acceptance

The rules live in `CLAUDE.md`, and each important one has a check in `spec/` that I saw fail before trusting it. For Crit 9 they run against the real HTTP server: placements and moves reach every stream within a second, opening a stream writes nothing, no event leaks a token, hash or exact time, and two connections with one cookie are one live star ([`8f8ef9a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/8f8ef9a), [`86b8389`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/86b8389)). I then tested it myself with a normal window, an incognito window, and my phone.

## Crit 10: who did what, without knowing who

Two people now use the lounge at once while I narrate from the server's logs. Overlap still knows a person only as one browser: an HttpOnly cookie whose SHA-256 hash is stored. Different windows or profiles are different people; two tabs of one browser are one.

The permission rule already held: a move is resolved from the cookie, and a star id in the request body is ignored. What was missing was evidence. Each meaningful action now writes one line, such as `audit action=star.moved actor=star:<uuid> target=star:<uuid> result=ok` ([`20e8651`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/20e8651)). The actor is the public star id the cookie resolved to, which grants nothing. The logs deliberately omit cookies, hashes, IP addresses, request bodies and timestamps, and page loads and streams are not logged. [ADR 0009](docs/adr/0009-audit-logs-identify-anonymous-stars-not-people.md) records why ([`0007b1c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/0007b1c)).

The checks start a real server and read its output: two cookies log two star ids; B sending A's id moves only B, and A's id appears nowhere; a move without a star logs `actor=anonymous`. One check failed once in three runs because it cleared its output before its setup star's line arrived; I fixed the test, not the app.

In the demo, two browsers use the app normally while I read each `star:` id as one anonymous person (`docs/crit-10-demo.md`).

## My role with the agent

I set the product limits and acceptance rules in `CLAUDE.md`. I used a separate Claude chat to review the agent’s plans and reports. For Crit 9 I approved only the changes the visibility decision needed, and turned down extras such as a grace period and a viewer count.
