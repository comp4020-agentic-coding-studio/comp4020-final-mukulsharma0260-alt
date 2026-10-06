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
- Other people's exact timestamps must never appear in the HTML, attributes, visible UI, or logs. Show only rough buckets.
- The app accepts no free text from visitors.
- Before interpreting a live result, state local HEAD, deployed SHA if known, and whether the tree is clean.
- Do not claim a visitor is physically present. For Crit 8, "last seen" means their last successful request to `/api/here`.
- A test that passes on rerun is a failing test until its cause is found.
- Live checks against production are read-only. If a live check must write, it deletes what it created in the same step and reports the ids.
- Back up SQLite only after a WAL checkpoint; copying the main file alone misses recent writes.
