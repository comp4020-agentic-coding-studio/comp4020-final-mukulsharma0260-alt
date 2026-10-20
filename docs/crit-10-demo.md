# Crit 10 demo: two people, narrated from the logs

Two pod members use the deployed app from its URL alone. I do not touch it; I
read out who did what from the server's own logs.

Live URL: https://comp4020-final-mukulsharma0260-alt.fly.dev/

## Before the pod arrives

1. In a terminal, from this repo, start the log stream and leave it running:

   ```sh
   mise exec -- flyctl logs -a comp4020-final-mukulsharma0260-alt
   ```

2. Open the URL once yourself so the machine is awake (it stops when idle),
   then close that window. Don't place a star in it.

## The demo

1. **Visitor A** opens the URL in normal Chrome. **Visitor B** opens it in an
   incognito window (or a separate Chrome profile). Different windows mean
   different cookies, so they are two different anonymous people.
2. Both press **ENTER THE LOUNGE →**. The film can be skipped with SKIP.
3. **A** presses **PLACE YOUR STAR**, then drags their star somewhere.
4. **B** places their own star and moves it.
5. Watch the terminal. Each action is one line, for example:

   ```text
   audit action=state.snapshot actor=anonymous room=common stars=12 result=sent
   audit action=star.created actor=star:30c2706e-… room=common result=accepted
   audit action=state.broadcast actor=star:30c2706e-… room=common change=star.created scope=all recipients=2 result=sent
   audit action=presence.joined actor=star:30c2706e-… room=common clients_in_room=1 result=ok
   audit action=star.moved actor=star:30c2706e-… target=star:30c2706e-… room=common result=accepted
   audit action=state.broadcast actor=star:30c2706e-… room=common change=star.moved scope=all recipients=2 result=sent
   ```

6. **Narrate it.** "`star:30c2…` is A: it was created first and every later
   line with that id is A acting. `star:bb85…` is B. Each move names its own
   star as the target, because the server works out whose star it is from the
   cookie, not from anything the page sends."

## The permission rule

During the crit, A and B only use the app as anyone would: each places and
moves their own star, and nobody opens anything else. The logs then show two
different anonymous actors, each moving only its own star:

```text
audit action=star.moved actor=star:30c2706e-… target=star:30c2706e-… room=common result=accepted
audit action=star.moved actor=star:bb85354e-… target=star:bb85354e-… room=common result=accepted
```

"A move always names its own star as the target. The page never tells the
server which star to move; the server works it out from the browser's
cookie."

The stronger rule is proved by an automated server test rather than in the
demo: even if B sends A's public star id with a move, the server ignores it
and resolves ownership only from B's cookie, so B can move only B's own star.
The test checks that A's position is unchanged and that the log line names B
as both actor and target, with A's id nowhere on it (`spec/audit.test.ts`).

A visitor with no star at all is refused, and logged without any identity:

```text
audit action=star.move_denied actor=anonymous reason=no_owned_star result=rejected
```

## What to say about identity

"Overlap tells anonymous **browsers** apart, not people. A star id is a
random label already shared with every connected browser as public star
state. The logs never contain the
cookie, its hash, an IP address, or what the browser sent, so I can follow
who did what without ever knowing who anyone is."

## If the logs are slow or quiet

- **Lines arrive late:** Fly can lag a few seconds. Keep talking through the
  screens, then point at the lines when they land.
- **Nothing appears:** check the app name, then run
  `mise exec -- flyctl logs -a comp4020-final-mukulsharma0260-alt --no-tail`
  to print what has already been logged.
- **The machine was asleep:** the first request wakes it; the startup line
  `listening on 0.0.0.0:8080` appears first. Do the action again.
- **Still nothing:** show the same lines from a local run instead, on a
  throwaway database so no demo stars land in `data/`:
  `DB_PATH=/tmp/overlap-demo/stars.db PORT=8080 node src/server.ts`.
  Repeat steps 3–4 against `http://localhost:8080` and read the lines from
  that terminal.
- **Only `presence.checked_in` lines:** that is a returning visitor checking
  in; place or move a star for a create or move line.
