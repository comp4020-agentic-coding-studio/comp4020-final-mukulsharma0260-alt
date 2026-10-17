# Credits

## Arrival artwork

- **Galaxy image:** made with OpenAI Image Generation (Codex imagegen), from a text prompt, on 17 October 2026.
- **Nebula video:** AI-generated from a prompt in university Claude Code on 17 October 2026.

Both are original artwork generated for this project. Neither is taken from any
film, and no film footage is used.

The galaxy image is the still scene behind the arrival screen. The nebula video
is shown only as a faint, muted, colour-shifted cloud texture over it.

The exact prompts for these two were not kept, so what was asked for is
recorded only as described here: a blue-violet spiral galaxy above a dark
planet horizon, and a slow-moving nebula cloud.

## Arrival film and its music

The 30-second film shown on first entry uses **no media file**. It is drawn
in code by `public/sky.js` on a canvas: a warp of light streaks rushing
outward from the galaxy's bright core. Its music is generated in code too,
with the browser's Web Audio API: a soft pad of sine voices on a pentatonic
scale, through a low-pass filter and a generated reverb. Neither uses any
recording, sample, footage or song.

Two files supplied for the film were not used, because no source or licence
was recorded for them: `lounge-transition.mp4` and `lounge-ambience.mp3`.
They are kept, unshipped, in the gitignored `assets-src/unsourced/`.

## Shipped files

The page serves only these optimised copies, made from the originals above:

- `public/assets/arrival-galaxy-960.webp` and `arrival-galaxy-1920.webp`, with
  `arrival-galaxy-v3.png` as the fallback for browsers without WebP
- `public/assets/arrival-nebula-720.webm` and `arrival-nebula-720.mp4`, both
  with no audio stream
