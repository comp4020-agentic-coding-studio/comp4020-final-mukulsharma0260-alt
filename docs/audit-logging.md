# Audit logging

Every meaningful action writes one line to stdout through `src/audit.ts`
(ADR 0009). Fly collects stdout as the app's logs.

    audit action=<action> actor=<star:uuid|anonymous> [target=star:<uuid>] result=<word>

The helper only accepts these four fields, and each must match a narrow
pattern (a lower-case word, or `star:` plus a UUID, or `anonymous`). A
cookie, token, token hash, IP address, raw request body or timestamp cannot
be printed through it. The log platform adds its own timestamp; the app
writes none.

| Action | Actor | Target | Result |
|---|---|---|---|
| `star.created` | new star | — | `created`, or the constellation id when created straight into one |
| `star.moved` | own star | own star | `ok` |
| `star.move_denied` | `anonymous` | — | `no_owned_star` |
| `presence.checked_in` | own star | — | `ok` |
| `star.constellation_changed` | own star | own star | the area id, e.g. `engineering` |
| `star.constellation_left` | own star | own star | `unsettled` |
| `star.constellation_denied` | `anonymous` | — | `no_owned_star` |
| `star.constellation_denied` | own star | — | `invalid_constellation` (the bad value is not logged) |
| `break.listening` | own star | — | the Break mode id, e.g. `calm` (ADR 0011) |
| `break.stopped` | own star | — | `stopped` |

Not logged: page loads, `/events` streams, keep-alives, and the contents of
any request.

Checks: `spec/audit.test.ts` and `spec/constellations.test.ts` capture the
real server's stdout and assert the exact lines and the absence of secrets,
IPs, bodies and timestamps.
