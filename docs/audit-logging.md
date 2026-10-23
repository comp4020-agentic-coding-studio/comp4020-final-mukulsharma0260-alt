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
| `state.broadcast` | the changed star, or `anonymous` for counts or a chat message | `room`, `change`, `scope`, `recipients` | an update was sent |

`change` is `star.created`, `star.moved`, `star.constellation`, `presence`
(live counts), `message.created`, or `message.expired` (the periodic
expiry sweep telling a room's connected visitors what it just deleted).
`scope` is `all` for star/presence broadcasts, since the Common Room shows
every star; a chat broadcast (created or expired) is `scope=room`, since it
is delivered only to the streams genuinely subscribed to that room
(`src/chat-rooms.ts`'s `ChatRoomRegistry`), never to every open stream.

## Chat (ADR 0012's follow-on)

| Action | Actor | Fields | Result |
|---|---|---|---|
| `callsign.created` / `callsign.changed` | own star, or `anonymous` if no star exists yet | | `accepted` |
| `message.created` | own star, or `anonymous` if no star exists yet | `room` | `accepted` |

Message bodies and callsigns are never logged — only that a message was
created, in which room, and by which star (or `anonymous`). A callsign
action from an identity with no star yet is logged as `anonymous`, the same
bucket every other identity-less action already uses; the audit `Actor` type
only ever safely names a star, never a bare identity hash.

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
| `callsign.denied` | `anonymous` or own star | `invalid_json`, `invalid_format`, `reserved`, `taken`, `cooldown` |
| `message.denied` | `anonymous` or own star | `no_identity`, `no_callsign`, `invalid_json`, `invalid_room`, `not_settled`, `invalid_idempotency_key`, `invalid_body`, `invalid_length`, `rate_limited` |
| `request.denied` | `anonymous` | `cross_origin` |

A star id sent in a request body is never trusted, so it is never named as a
target: a forged move moves the sender's own star and logs that.

Not logged: page loads, keep-alives, the contents of a stream, and the
contents of any request.

Checks: `spec/audit.test.ts`, `spec/logging.test.ts` and `spec/constellations.test.ts` capture the
real server's stdout and assert the exact lines and the absence of secrets,
IPs, bodies and timestamps. `spec/chat.test.ts` does the same for chat: no
message body or secret ever appears, and a chat broadcast is logged as
`scope=room`, never `scope=all`.
