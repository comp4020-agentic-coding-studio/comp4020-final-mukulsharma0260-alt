# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the template is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the course website publishes the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).
What the agent needs to carry from any of it is your call.

## Rules for Overlap

- GET requests never write to the database.
- Identity comes only from a secure HttpOnly cookie; a request body never proves ownership of a star.
- Star positions are stored as fractions from 0 to 1, never pixels.
- The database stores only a SHA-256 hash of the anonymous identity token.
- Cookie tokens and token hashes must never appear in HTML, browser JavaScript, logs, or tests.
- Audit logs go through `src/audit.ts` and use only a public star id (or `anonymous`) as the actor. They never contain cookie tokens, token hashes, cookies, IP addresses, raw request bodies, or another visitor's timestamps. Log meaningful actions only, never page loads or live streams.
- Other people's exact timestamps must never appear in the HTML, attributes, visible UI, or logs. Show only rough buckets.
- The app accepts no free text from visitors.
- Before interpreting a live result, state local HEAD, deployed SHA if known, and whether the tree is clean.
- Do not claim a visitor is physically present. For Crit 8, "last seen" means their last successful request to `/api/here`.
- For Crit 9, a star is glowing only while at least one authenticated browser has the lounge open in a visible tab. Never claim a person is physically here.
- `/events` may hold temporary connection state in server memory, but it must never write that state to SQLite. A deploy or restart clears it and reconnecting browsers rebuild it.
- Live events may expose only a star id, normalised coordinates, and a rough brightness bucket. They must never expose a cookie token, token hash, or anybody's exact timestamp.
- A move made by one browser must reach another open browser through `/events` without a reload, within about one second; keep a check that proves it.
- A test that passes on rerun is a failing test until its cause is found.
- Live checks against production are read-only. If a live check must write, it deletes what it created in the same step and reports the ids.
- Back up SQLite only after a WAL checkpoint; copying the main file alone misses recent writes.
- Presence lives in memory only, never in the database.
- Every live event follows the same privacy rules as the page.
- Never claim a person is physically present; live means an open, visible tab.
- Every visitor who has entered gets live updates, with or without a star.
- Only a visitor who has entered and has a star checks in through `/api/here`.
- All visitor-facing wording follows `docs/terms.md`: the place is the **lounge**, a visitor's mark is a **star**, and **glowing** means a visitor has entered the lounge and has a visible tab. "Sky" may describe the picture, never name the place.

No media file without its source and licence recorded in docs/credits.md; nothing from social media and no commercial music.

A visitor counts as here only after entering the lounge; the arrival screen never opens the live stream or calls /api/here.

The arrival artwork is a picture. Inside the lounge, every point of light is a visitor.

The lounge backdrop is the arrival galaxy blurred until no point of light remains.
