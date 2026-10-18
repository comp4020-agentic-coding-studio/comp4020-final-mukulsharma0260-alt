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
   audit action=star.created actor=star:30c2706e-… result=created
   audit action=star.created actor=star:bb85354e-… result=created
   audit action=star.moved actor=star:30c2706e-… target=star:30c2706e-… result=ok
   audit action=star.moved actor=star:bb85354e-… target=star:bb85354e-… result=ok
   ```

6. **Narrate it.** "`star:30c2…` is A: it was created first and every later
   line with that id is A acting. `star:bb85…` is B. Each move names its own
   star as the target, because the server works out whose star it is from the
   cookie, not from anything the page sends."

## The permission rule

B cannot move A's star. The server ignores any star id in the request and
moves only the star B's own cookie owns.

To show it, B opens DevTools (Cmd+Option+J) in their window and runs this,
pasting **A's** star id from the log in place of `A-STAR-ID`:

```js
fetch("/api/star/move", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ x: 0.9, y: 0.9, starId: "A-STAR-ID" }),
}).then((r) => r.json()).then(console.log);
```

- The reply's `star.id` is **B's** id, not A's.
- On both screens, **B's** star jumps to the bottom-right. **A's** stays put.
- The log line names B as both actor and target, and A's id is nowhere on it:

  ```text
  audit action=star.moved actor=star:bb85354e-… target=star:bb85354e-… result=ok
  ```

A visitor with no star at all is refused, and logged without any identity:

```text
audit action=star.move_denied actor=anonymous result=no_owned_star
```

## What to say about identity

"Overlap tells anonymous **browsers** apart, not people. A star id is a
random label the page already shows to everyone. The logs never contain the
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
