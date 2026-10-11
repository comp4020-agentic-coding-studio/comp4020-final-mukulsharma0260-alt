# Crit 9 reflection

## What was the breakthrough that moved the work forward?

This week I decided that a live halo should mean the Overlap tab is open and visible, rather than merely connected to the server. I chose that because an open background tab can sit there all day while its owner has completely forgotten about it. Visibility is still imperfect—someone can leave a visible tab open and walk away—but it is a more honest signal than treating every surviving connection as attention. The halo is therefore not saying "this person is here"; it is saying only that their browser is actively showing this shared sky.

The first version solved the easier technical problem instead of the more important design problem. It treated any open SSE connection as liveness, which made the app look real-time without deciding what "looking at the sky" actually meant. I also found that viewers without their own star did not open a live connection, so they would not see another person move a star unless they reloaded. That was especially important because Overlap should be a shared place even before someone decides to leave their own mark. While checking the evidence, I also found documentation claiming that two tabs with the same cookie count as one live person without a direct test proving it, so I stopped and added the missing check instead of leaving a nice-sounding but unsupported claim.

## What did this work change about who I want to be as a software developer?

I learned that real-time development is not mainly about choosing SSE or making a message arrive quickly. The hard part is deciding what the message is allowed to mean, including what it must not claim. I also learned that tests are part of the argument, not just a final safety net: if README says a placement appears live for everyone, then there needs to be a test for placement, not just movement. The best correction this week was becoming more suspicious of statements that sounded true but had not actually been tested.

For Crit 10, I want to collect only enough server evidence to judge whether the live halos make Overlap feel more shared. I do not want to add a large analytics dashboard just because the server can count events. Instead, I will decide what small, privacy-respecting signals matter—for example, how many live connections overlap and whether people return after seeing a shared sky—and make those logs help me improve the experience rather than distract from it.
