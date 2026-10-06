# Title

Plain Node and built-in SQLite on one Fly machine

# Status: Accepted

# Context

Overlap needs a server and a datastore, and the final-project starter leaves
both unchosen. The app has four routes and one small table, it runs as a
single Fly machine (`ha = false`), and the only durable storage is the one
volume mounted at `/data`.

# Options

1. **Plain Node `http` + `node:sqlite` (chosen).** No framework, no ORM, no
   native SQLite package. `node:sqlite` ships in the Node runtime itself.
2. **Astro SSR + Drizzle + `better-sqlite3`.** The stack used for Crit 7. An
   ORM and a native SQLite binding add a compiled dependency that has to
   build successfully on Fly's remote builder, and Astro's conventions add
   structure a four-route app doesn't need.
3. **A hosted database.** Removes the single-machine SQLite file entirely, at
   the cost of a separate managed service this project doesn't otherwise
   need.

# Decision

Option 1.

# Consequences

- `node:sqlite` is documented at Stability 1.2 ("Release candidate") in the
  Node API docs for the pinned runtime (`node 24.21.0`, per `mise.toml`) —
  settled enough to depend on, but not yet marked fully stable.
- The app runs as exactly one Fly machine; there is no second instance to
  fail over to.
- Every deploy replaces that one machine, so every open connection is
  dropped. `node:sqlite` is also process-local, not shared across machines.
  Crit 9's real-time presence layer must treat a boot as "nobody is known to
  be here yet" and rebuild presence from scratch, not assume state survives
  the swap.
- The mounted volume is the only copy of the data; losing it is losing the
  data. Fly takes automatic daily snapshots of each volume (5-day retention
  by default, configurable from 1 to 60 days), but Fly's own docs caution
  that a daily snapshot may not hold the most recent writes, so it reduces
  this risk without removing it.
