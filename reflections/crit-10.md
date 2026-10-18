# Crit 10 reflection

## What was the breakthrough that moved the work forward?

This week I had to make the server explain itself. Two people use the app and I narrate from the logs, so I needed a way to say who did what without knowing who anyone is. Logging the cookie, or even its hash, was out, because that is the credential. Logging nothing meant I could not show the permission rule or debug anything later. I settled on the public star id: it is random, it already appears on the page, and it tells two browsers apart without naming anyone.

The surprising part was that the ownership rule was already right. A move had always been resolved from the cookie, and any star id in the request was ignored. What was missing was evidence. Once the logs existed, a test could check that when B sends A's id, the line names B as both actor and target and A's id appears nowhere.

## What did this work change about who I want to be as a software developer?

One audit test passed twice and failed once. My first thought was that it was just timing, but my own rule says a test that passes on rerun is still failing. Running it alone twelve times failed every time: the test cleared its captured output before the server's line for its own setup star had arrived. It was the test, not the app, but I only knew that because I looked. I also learned that "never log secrets" is weak as a habit. Making the helper reject anything that is not a safe label is stronger, because a mistake gets dropped instead of printed.

Next, I want to check what the logs look like after real use, not just in tests, and decide how long they need to last.
