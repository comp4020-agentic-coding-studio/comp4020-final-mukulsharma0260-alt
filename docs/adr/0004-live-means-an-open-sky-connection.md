# Title

Live means an open sky connection

# Status: Superseded by [ADR 0005](0005-live-means-looking-at-the-sky.md)

The transport choice below (server-sent events) still stands. What changed is
the behaviour: "any open connection" became "an open and visible tab".

# Context

Crit 9 requires a change made in one open browser to appear in another in
about a second, without a reload. Overlap also needs a decision about what a
star can honestly mean when several people have the sky open at once.

Crit 8's `last_seen_at` is durable old light. It records the last explicit
browser check-in, not current human presence. Reusing that value as a live
signal would make a recently closed or sleeping tab appear to still be here.

# Options

1. **Server-sent events (chosen).** Each open sky keeps one authenticated
   `EventSource` connection. The server broadcasts created and moved stars,
   and holds the set of currently connected star ids only in process memory.
   A star is live while at least one connection for its browser identity is
   open.
2. **WebSockets.** They would also deliver server-to-browser events, but add a
   bidirectional protocol and more connection handling even though Overlap's
   existing HTTP POST routes already carry every client action.
3. **Fast polling.** A short polling interval could meet the one-second rule,
   but it makes every viewer repeatedly ask the server whether anything
   changed. The sky has few events and should be quiet when nothing happens.

# Decision

Option 1. The server sends a complete safe snapshot on connection, then small
events for star creation, movement, and changes to the set of live stars.
Events contain only a public star id, normalised position, and a rough
brightness bucket; they never contain timestamps or identity material.

Two tabs with the same cookie are one star. They may make two connections, but
that star remains live until its last connection closes. A reconnect receives a
fresh snapshot. A restart clears all live state, and browsers reconnect to
rebuild it.

# Consequences

- A blue halo means a browser has the sky open right now, not that a named
  person is at their keyboard or physically present.
- A short connection drop can make a halo blink. This is accepted because
  keeping a grace period would make the signal less truthful.
- Event streams are process-local, which is safe only because this Fly app has
  one machine. Adding multiple machines later would require shared pub/sub or
  a different architecture.
- SQLite continues to store only durable stars and old-light history; real-time
  presence is intentionally not persisted.
