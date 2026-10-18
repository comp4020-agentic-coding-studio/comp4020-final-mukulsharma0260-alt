# Title

Audit logs identify anonymous stars, not people

# Status: Accepted

# Context

Overlap promises anonymity: a person is one browser, known to the server
only by an HttpOnly cookie whose SHA-256 hash is stored
([ADR 0001](0001-durable-anonymous-stars.md),
[ADR 0003](0003-a-person-is-a-browser.md)). There are no names or accounts.

Several people now act on the same lounge at once, and the server enforces
what each may change: anyone can see every star, but a browser can move only
the star its own cookie resolves to. To check that this holds, in a crit and
long after it, someone has to be able to read from the server's own logs who
did what. Until now the server logged nothing about actions, so neither the
permission rule nor any bug in it could be seen in production.

# Options

1. **Log the raw cookie token or its hash.** It would identify each browser
   exactly. But the token is the credential itself, and the hash is the key
   that links a browser to its row in the database. Either in a log would
   make every log reader able to impersonate or track a visitor. Rejected.
2. **Log nothing.** Safest for privacy, but the permission rule cannot be
   shown working, and a production bug cannot be traced to the action that
   caused it. Rejected.
3. **Log the public star id as an anonymous actor label (chosen).** Every
   star already has a random UUID that the page shows to everyone. It is
   stable for a browser, different between browsers, and grants no
   authority.

# Decision

Option 3. Each meaningful action writes one line through `src/audit.ts`:

    audit action=star.moved actor=star:<uuid> target=star:<uuid> result=ok

The actor is the star the server resolved from the cookie, and so is a move's
target: a star id sent in a request body is never trusted, and never logged.
A move by a browser with no star logs `actor=anonymous`. Only these are
logged: a star created, a star moved, a move refused, and a check-in. Page
loads, live streams and keep-alives are not. The helper accepts only fixed
fields whose values match narrow patterns, so a token, hash, cookie, IP,
request body or timestamp cannot be printed even by mistake.

# Consequences

- The log tells two browsers apart and shows which one did each thing, but
  cannot say which human it was. Two tabs in one browser are one actor; an
  incognito window is a new one.
- It stays useful after the crit: a reported bug can be followed through the
  actions of the stars involved.
- A log reader learns that a particular public star acted at a given time.
  The star id is already public, so this adds no new identifier, but it does
  connect an action to a visible star. That is the intended privacy
  trade-off.
- Refusals that fail validation (bad coordinates, invalid JSON) are not
  logged; they change nothing and would mostly add noise.
- Fly keeps logs for a limited time; this is a debugging trail, not a
  permanent record.
