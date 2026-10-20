# Audit logging

Every meaningful action writes one line to stdout through `src/audit.ts`
(ADR 0009). Fly collects stdout as the app's logs.

    audit action=<action> actor=<star:uuid|anonymous> [target=star:<uuid>] [room=<room>] [reason=<word>] [change=<word>] [scope=all] [recipients=<n>] [stars=<n>] [clients_in_room=<n>] result=<word>

The helper only accepts these fields, each matching a narrow pattern: a
lower-case word, `star:` plus a UUID or `anonymous`, a room from
`common|science|engineering|business|health|arts`, or a whole number. A
cookie, token, token hash, IP address, raw request body, location or
timestamp cannot be printed through it. The log platform adds its own
timestamp; the app writes none. `room` is always the room the star belongs
to (its constellation, or `common`); the server never knows which view a
browser is looking at.

## Connections, snapshots and broadcasts

| Action | Actor | Fields | Meaning |
|---|---|---|---|
| `state.snapshot` | the viewer's star, or `anonymous` | `room`, `stars` | a `/events` stream opened and was sent the full state |
| `presence.joined` | own star | `room`, `clients_in_room` | the star's first visible stream opened (it is now glowing) |
| `presence.left` | own star | `room`, `reason=stream_closed`, `clients_in_room` | its last stream closed (tab hidden or closed, network dropped, or restart). The star itself stays. |
| `state.broadcast` | the changed star, or `anonymous` for counts | `room`, `change`, `scope=all`, `recipients` | an update was sent to every open stream |

`change` is `star.created`, `star.moved`, `star.constellation` or
`presence` (live counts). Every broadcast reaches every stream (`scope=all`)
because the Common Room shows every star.

## Actions

| Action | Actor | Fields | Result |
|---|---|---|---|
| `star.created` | new star | `room` | `accepted` |
| `star.moved` | own star | `target` (own star), `room` | `accepted` |
| `star.constellation_changed` / `_left` | own star | `target`, `room` (after) | `accepted` |
| `break.listening` / `break.stopped` | own star | `room`, `reason` (the mode, or `stopped`) | `accepted` (ADR 0011) |
| `presence.checked_in` | own star | | `ok` |

## Refusals

Every refusal is `result=rejected` with a `reason`; the body is never logged.

| Action | Actor | Reasons |
|---|---|---|
| `star.create_denied` | `anonymous` | `invalid_json`, `invalid_position`, `invalid_constellation` |
| `star.move_denied` | `anonymous` or own star | `no_owned_star`, `invalid_json`, `invalid_position` |
| `star.constellation_denied` | `anonymous` or own star | `no_owned_star`, `invalid_json`, `invalid_constellation` |
| `break.listening_denied` | `anonymous` or own star | `no_owned_star`, `invalid_json`, `invalid_mode`, `not_glowing` |
| `request.denied` | `anonymous` | `cross_origin` |

A star id sent in a request body is never trusted, so it is never named as a
target: a forged move moves the sender's own star and logs that.

Not logged: page loads, keep-alives, the contents of a stream, and the
contents of any request.

Checks: `spec/audit.test.ts`, `spec/logging.test.ts` and `spec/constellations.test.ts` capture the
real server's stdout and assert the exact lines and the absence of secrets,
IPs, bodies and timestamps.
