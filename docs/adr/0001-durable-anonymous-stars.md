# Title

Durable anonymous star identity

# Status: Proposed

# Context

Overlap needs to recognise a returning visitor well enough to show them the
same star, without any sign-up. The identity has to survive a page reload, a
redeploy, and the machine stopping and restarting on Fly's idle timer — but it
never gets a username or a password to anchor it to.

# Options

1. **Anonymous cookie identity plus SQLite on the one Fly volume.** The server
   issues `crypto.randomBytes(32)` on first visit, stores only its SHA-256
   hash in a `stars` row on the volume mounted at `/data`, and resolves a star
   by hashing whatever token comes back in the `Cookie` header. The raw token
   never reaches the database, logs, or another visitor's screen.
2. **Accounts plus a hosted database.** A real sign-up (even a lightweight
   one) and a managed database server would make identity unambiguous and
   survive more than one browser. Rejected: it's a sign-up for a one-star
   night sky, it adds a database server this project doesn't otherwise need,
   and it is well outside Crit 8's scope.
3. **Browser-only `localStorage`, with no server-side session at all.** The
   server would have to trust whatever id the client sends, meaning anyone
   could claim any star just by sending its id. Rejected: it can't actually
   protect ownership, which defeats the point of persistence, and it would
   not survive a different device or a cleared browser at all.

# Decision

Option 1. A hashed, HttpOnly cookie token is the only way a star's ownership
is resolved server-side; a submitted star id is never trusted for that.

> A person is one browser identity. Two normal tabs in one browser are the
> same person. A private window, a different browser, or a cleared cookie
> becomes a new anonymous star.

# Consequences

- No login means no recovery path if a visitor loses their cookie (clears
  storage, switches browsers) — they simply get a new star, and their old one
  persists, ownerless, exactly as it was.
- The token's hash is the only thing that ever touches storage or appears in
  a response; the raw token is never logged or rendered.
- Durability rides entirely on the Fly volume mounted at `/data` — there is no
  separate database server for this app to fail over to, so a volume loss is a
  data loss. That risk is accepted for a Crit 8 prototype at this scale.
