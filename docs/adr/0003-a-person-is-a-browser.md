# Title

A person is a browser

# Status: Accepted

# Context

Overlap has no accounts, so "who is this visitor" has to be answered from
something a browser carries on its own: the HttpOnly cookie set on first
visit. The app needs one explicit rule for what counts as the same person
across repeat visits, tabs, and devices.

# Decision

One cookie identifies exactly one star, with no accounts:

- Two tabs open in the same browser send the same cookie, so they are one
  person and one star.
- A private/incognito window does not share the normal window's cookie jar,
  so it is a second person with its own star.
- A different browser, or a different device, has no cookie at all on first
  request, so it is a second person with its own star.
- A cleared cookie removes the only link to the old star; the next request
  is treated as a new person and gets a new star. The old star is not
  deleted — it persists, ownerless.

# Consequences

- Identity is only as durable as the cookie: clearing cookies, switching
  browsers, or switching devices all produce a new star, not a recovered
  one, because there is no login to recover through.
- Ownership for a write (move) is resolved only from the cookie on the
  request, never from a star id in the request body.
