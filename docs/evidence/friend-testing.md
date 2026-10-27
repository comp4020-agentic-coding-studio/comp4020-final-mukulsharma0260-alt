# Informal testing outside class: protocol

Status: no sessions have been run. This file is the protocol only. Nothing
below is a result.

This is informal testing with friends, not user research. Record what was
seen and what was said, not what people felt, unless you are quoting them.

## Before a session: consent and privacy

- [ ] Everyone who may appear in a photo or screenshot has agreed, in
      writing (a message is enough), to that specific image being committed.
- [ ] Each tester knows the repository is public and that git history keeps
      a committed file even after it is deleted.
- [ ] Each tester knows a callsign is public, permanent and never released,
      and agrees not to use their real name or anything identifying.
- [ ] Each tester knows they can withdraw consent at any time before a
      commit.
- [ ] Nobody types personal information into a conversation.

## Setup

- Two people, A and B, each on their own device or in separate browser
  profiles. If one device is shared, use one normal window and one private
  (incognito) window. Two tabs in one browser are one person and do not
  count.
- Both start from the public URL only:
  https://comp4020-final-mukulsharma0260-alt.fly.dev/
- Before starting, write down the date and the deployed commit (from the
  GitHub deployment or `flyctl releases`), and whether the expiry sweep is
  deployed at that commit.
- Production stays read-only apart from what the testers themselves do. The
  stars and callsigns they create are permanent; tell them so.

## Scenarios

Each scenario lists what to do and what it is meant to show. Write down
what actually happened, including anything unexpected.

1. **Separate identities.** A and B each enter the lounge and place a star.
   Each should see the other's star, and only be able to move their own.
2. **Visible-tab presence.** A switches to another tab, then back. B should
   see A's star stop glowing and glow again, without reloading.
3. **Common Room conversation.** Both choose callsigns. A posts in the
   Common Room conversation. B should see it arrive without reloading.
4. **A rejected action.** B tries to choose A's callsign. It should be
   refused as taken. (Alternative: B tries to post in a constellation where
   B's star is not settled.)
5. **Conversation isolation.** A settles in Engineering, B in Science. A
   posts in the Engineering conversation. B should never see it, in any
   view.
6. **Reload and reconnect.** A reloads. A's star, callsign and recent
   messages should still be there, and B should see A glow again.
7. **Joining a conversation already in progress.** B moves to Engineering.
   Record whether A's earlier Engineering message appears for B without a
   reload. The expected behaviour here is not yet verified.

## Results

| Date | Deployed commit | Scenario | Expected | Observed | Follow-up |
|---|---|---|---|---|---|
| | | | | | |

Follow-up is one of: a commit, a test, an ADR amendment, an issue, or
"no change", with a one-line reason.

## Photos and screenshots

- Hands and devices only, or a cropped screenshot of the lounge only.
- Crop or blur faces, names, private messages, account avatars, bookmarks,
  unrelated tabs, notifications, and anything that shows where the photo
  was taken.
- Strip location and camera metadata before committing (for example
  `exiftool -all= photo.jpg`), then check it is gone.
- Resize to about 1600 px on the long edge, JPEG quality about 75, under
  300 KB each, and no more than eight images in total.
- Add a line for each image to `docs/credits.md`: own photograph, consent
  obtained, and the date.

## File naming

Images go in `docs/evidence/friend-tests/`, named
`YYYY-MM-DD-<scenario>.jpg`, for example `YYYY-MM-DD-isolation.jpg` with the
real session date.

## Writing it up

- Each image in PROCESS.md gets a caption in this pattern: "Informal testing
  outside class, [date]. Two students opened the deployed app from the
  public URL in separate browser profiles. Observation: [factual result].
  Follow-up: [commit, test, ADR, or no change]."
- Observations are facts. A tester's opinion is quoted as their words, not
  paraphrased into a finding.
- Every change that comes out of a session links to its commit, test or
  ADR. If nothing changed, say "no change" and why.
