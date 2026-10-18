# Draft: Crit 10 section for PROCESS.md

PROCESS.md is at 1,080 of its 1,100 words, so this section cannot be added
without cutting existing text. It is kept here, ready to paste, until that
choice is made. The commit links below resolve.

---

## Crit 10: who did what, without knowing who

Two people now use the lounge at once while I narrate from the server's logs. Overlap still knows a person only as one browser: an HttpOnly cookie whose SHA-256 hash is stored. Different windows or profiles are different people; two tabs of one browser are one.

The permission rule already held: a move is resolved from the cookie, and a star id in the request body is ignored. What was missing was evidence. Each meaningful action now writes one line, such as `audit action=star.moved actor=star:<uuid> target=star:<uuid> result=ok` ([`20e8651`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/20e8651)). The actor is the public star id the cookie resolved to, already shown on the page and granting nothing. The logs deliberately omit cookies, hashes, IP addresses, request bodies and timestamps, and page loads and streams are not logged. [ADR 0009](docs/adr/0009-audit-logs-identify-anonymous-stars-not-people.md) records why ([`0007b1c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt/commit/0007b1c)).

The checks start a real server and read its output: two cookies log two star ids; B sending A's id moves only B, and A's id appears nowhere; a move without a star logs `actor=anonymous`. One check failed once in three runs: it cleared its captured output before its setup star's own line arrived, which twelve isolated runs confirmed. I fixed the test, not the app.

In the demo, I read each `star:` id as one person, and show B trying to move A's star from DevTools.
