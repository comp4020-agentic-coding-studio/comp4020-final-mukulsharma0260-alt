// The About page at /about/: a cinematic teleprompter for a student arriving
// tired or alone. One short thought at a time rises over a full-bleed
// background as the visitor scrolls, at their own pace; nothing scrolls for
// them. It is separate from /readme/, which stays the full marker-facing
// README. It is a page to read, not part of the lounge: no cookie is read or
// set, nothing is logged, and it loads neither sky.js nor the live stream, so
// visiting it never makes anyone glow and never changes the lounge.
//
// Every word is real HTML, readable with JavaScript off and with no motion:
// without the script every thought is simply shown, one under another. The
// background is the arrival's galaxy, a picture outside the lounge, so no
// point of light here is a visitor, and nothing on the page pretends to be
// one. Behind the first chapter only, silent NASA lunar footage can play
// (docs/credits.md); it is optional, and the galaxy is always there under it.
import { CONSTELLATION_INFO } from "./render.ts";
import { CONSTELLATIONS } from "./db.ts";

// The first chapter's background: NASA lunar footage, cropped to its picture
// and re-encoded with no audio track (docs/credits.md). MP4 where the browser
// plays H.264, WebM otherwise. Empty strings would leave the still galaxy.
const ABOUT_VIDEO = { webm: "/assets/about-moon-576.webm", mp4: "/assets/about-moon-576.mp4" };

// One constellation as faint lines and hollow diamonds, the lounge's own
// figure, in a small square. Decoration only: never a circle or a dot.
function figure(id: (typeof CONSTELLATIONS)[number]): string {
  const { nodes, edges } = CONSTELLATION_INFO[id].figure;
  const at = ([u, v]: [number, number]) => [Math.round(8 + u * 84), Math.round(8 + v * 84)] as const;
  const lines = edges.map(([a, b]) => {
    const [x1, y1] = at(nodes[a]!);
    const [x2, y2] = at(nodes[b]!);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join("");
  const diamonds = nodes.map((n) => {
    const [x, y] = at(n);
    return `<path d="M${x} ${y - 3}l3 3l-3 3l-3 -3z"/>`;
  }).join("");
  return `<svg class="about-figure" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${lines}${diamonds}</svg>`;
}

// The five figures drawn large and faint across the stage, as depth behind
// the words. Lines only: no node is drawn, so nothing reads as a visitor.
function stageLines(): string {
  const spots: Array<[number, number, number]> = [[6, 12, 22], [62, 6, 26], [74, 52, 24], [14, 60, 20], [40, 30, 18]];
  return CONSTELLATIONS.map((id, i) => {
    const [left, top, size] = spots[i]!;
    const { nodes, edges } = CONSTELLATION_INFO[id].figure;
    const lines = edges.map(([a, b]) => `<line x1="${(nodes[a]![0] * 100).toFixed(1)}" y1="${(nodes[a]![1] * 100).toFixed(1)}" x2="${(nodes[b]![0] * 100).toFixed(1)}" y2="${(nodes[b]![1] * 100).toFixed(1)}"/>`).join("");
    return `<svg class="stage-figure" style="left:${left}%;top:${top}%;width:${size}vmin;height:${size}vmin" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${lines}</svg>`;
  }).join("");
}

// One thought on the teleprompter: its line, and a quieter note under it.
function beat(line: string, note = "", extra = ""): string {
  return `<div class="about-beat">
        <p class="beat-line">${line}</p>${note ? `\n        <p class="beat-note">${note}</p>` : ""}${extra}
      </div>`;
}

const CHAPTERS: Array<[id: string, label: string]> = [["how", "How it works"], ["focus", "Focus"], ["talk", "Talking"], ["return", "Return"]];

export function renderAboutPage(): string {
  const constellations = CONSTELLATIONS.map((id) =>
    `<li>${figure(id)}<span>${CONSTELLATION_INFO[id].name.replace("&", "&amp;")}</span></li>`).join("\n            ");
  const progress = CHAPTERS.map(([id, label]) =>
    `<li><a href="#${id}" data-chapter="${id}"><span class="dot" aria-hidden="true"></span><span class="label">${label}</span></a></li>`).join("\n      ");

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>About Overlap · Study, not alone</title>
<meta name="description" content="How Overlap works: a quiet anonymous lounge where you can see that others are studying too, without profiles or pressure.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23070814'/%3E%3Ccircle cx='32' cy='32' r='14' fill='%23e9c47e' fill-opacity='.25'/%3E%3Ccircle cx='32' cy='32' r='6' fill='%23fff6e4'/%3E%3C/svg%3E">
<link rel="preload" as="image" href="/assets/arrival-galaxy-960.webp" type="image/webp" fetchpriority="high">
<style>
  /* The lounge's own tokens: no new colours or fonts. */
  :root {
    color-scheme: dark;
    --color-ink: #f4eee2;
    --color-ink-soft: #d9d4cb;
    --color-ink-muted: #a9a8b8;
    --color-gold: #e9c47e;
    --color-focus: #f4eee2;
    --color-line: rgba(244, 238, 226, 0.14);
    --void: #03040e;
    --font-display: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    --font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --font-mono: ui-monospace, "SFMono-Regular", Menlo, "Courier New", monospace;
    --target: 2.75rem;
    --gutter: clamp(1.25rem, 6vw, 6rem);
    --dur-calm: 700ms;
    --ease-calm: cubic-bezier(0.33, 0, 0.25, 1);
  }
  * { box-sizing: border-box; }
  html { background: var(--void); }
  body { margin: 0; min-height: 100vh; color: var(--color-ink); background: var(--void); font-family: var(--font-ui); -webkit-font-smoothing: antialiased; }
  a { color: inherit; }
  a:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 3px; border-radius: 0.2rem; }

  /* The stage: fixed behind every chapter. The galaxy paints with the page
     and is the poster; a video, when one is approved, fades in over it while
     the first chapter is on screen. Then a scrim, slow light, and faint
     constellation lines give it depth, so it is never empty black. */
  .about-stage {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    background: var(--void) url("/assets/arrival-galaxy-960.webp") 72% 30% / cover no-repeat;
  }
  @media (min-width: 1200px) {
    .about-stage { background-image: url("/assets/arrival-galaxy-1920.webp"); }
  }
  /* The first chapter's background: the NASA footage over the galaxy and
     under the scrim, shown only while that chapter (named by data-for) is
     on screen. Grey and dimmed so it stays behind the words. */
  .about-video-slot { position: absolute; inset: 0; background: var(--void); opacity: 0; transition: opacity 1.4s var(--ease-calm); }
  .about-video-slot.is-on { opacity: 1; }
  .about-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.05) brightness(0.8); }
  .stage-light {
    position: absolute;
    inset: -20%;
    background:
      radial-gradient(40% 32% at 30% 70%, rgba(233, 196, 126, 0.10), transparent 70%),
      radial-gradient(36% 30% at 78% 24%, rgba(120, 132, 255, 0.14), transparent 70%);
  }
  .stage-figure { position: absolute; overflow: visible; }
  .stage-figure line { stroke: rgba(196, 200, 230, 0.16); stroke-width: 0.5; vector-effect: non-scaling-stroke; }
  /* The scrim: darkest where the words sit (lower left), opening up to the
     galaxy on the far side, and dark at the edges like a lens. */
  .about-scrim {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(270deg, rgba(3, 4, 14, 0.82), rgba(3, 4, 14, 0) 15rem),
      linear-gradient(90deg, rgba(3, 4, 14, 0.92) 0%, rgba(3, 4, 14, 0.78) 38%, rgba(3, 4, 14, 0.35) 70%, rgba(3, 4, 14, 0.2) 100%),
      linear-gradient(to top, rgba(3, 4, 14, 0.85), rgba(3, 4, 14, 0) 45%),
      radial-gradient(120% 90% at 60% 40%, transparent 55%, rgba(3, 4, 14, 0.7));
  }

  /* The header: wordmark, a small way back, nothing else. */
  .about-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: max(0.5rem, env(safe-area-inset-top)) max(var(--gutter), env(safe-area-inset-right)) 0.5rem max(var(--gutter), env(safe-area-inset-left));
    /* Solid behind the wordmark and link, fading out only below them, so
       words scrolling up pass under it without showing through. */
    --fade: 1.75rem;
    padding-bottom: var(--fade);
    background: linear-gradient(to bottom, var(--void) calc(100% - var(--fade)), rgba(3, 4, 14, 0));
  }
  .about-wordmark { display: inline-flex; align-items: center; min-height: var(--target); color: var(--color-ink); font: 400 1.35rem/1 var(--font-display); text-decoration: none; }
  .about-bar-back { display: inline-flex; align-items: center; gap: 0.4rem; min-height: var(--target); padding: 0 0.25rem; color: var(--color-ink-soft); font: 500 0.875rem/1 var(--font-ui); text-decoration: none; }
  .about-bar-back:hover { color: var(--color-ink); text-decoration: underline; text-underline-offset: 0.25em; }

  /* The chapter rail: a dot per chapter, its name beside it, the current one
     lit. Every stop is a full 44px target. */
  .about-progress { position: fixed; z-index: 3; right: max(1rem, env(safe-area-inset-right)); top: 50%; transform: translateY(-50%); }
  .about-progress ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
  .about-progress a { display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem; min-height: var(--target); min-width: var(--target); padding: 0 0.75rem; color: var(--color-ink-muted); font: 500 0.72rem/1 var(--font-mono); letter-spacing: 0.14em; text-transform: uppercase; text-decoration: none; }
  .about-progress .dot { flex: none; width: 0.5rem; height: 0.5rem; border: 1px solid currentColor; transform: rotate(45deg); transition: background-color var(--dur-calm), transform var(--dur-calm); }
  .about-progress .label { order: -1; opacity: 0; transition: opacity var(--dur-calm); }
  .about-progress a:hover .label, .about-progress a:focus-visible .label, .about-progress a[aria-current="step"] .label { opacity: 1; }
  .about-progress a[aria-current="step"] { color: var(--color-ink); }
  .about-progress a[aria-current="step"] .dot { background: var(--color-gold); border-color: var(--color-gold); transform: rotate(45deg) scale(1.3); }

  /* The story. */
  main { position: relative; z-index: 1; }
  .about-chapter { position: relative; padding: 0 max(var(--gutter), env(safe-area-inset-right)) 0 max(var(--gutter), env(safe-area-inset-left)); }
  .chapter-head { padding-top: 34vh; max-width: 40rem; }
  .chapter-kicker { margin: 0 0 1rem; color: var(--color-gold); font: 600 0.78rem/1 var(--font-mono); letter-spacing: 0.22em; text-transform: uppercase; }
  h1, h2 { margin: 0; color: var(--color-ink); font: 400 clamp(2.6rem, 6vw, 4.8rem)/1 var(--font-display); letter-spacing: -0.01em; text-wrap: balance; }
  .chapter-cue { margin: 1.25rem 0 0; color: var(--color-ink-soft); font: 400 0.95rem/1.5 var(--font-ui); }
  .chapter-cue::after { content: " ↓"; }

  /* The teleprompter: each thought is one scroll step, sitting low on the
     screen; the one being read is bright, the rest wait in the dark. */
  .about-beat { display: flex; flex-direction: column; justify-content: center; min-height: 88vh; min-height: 88svh; max-width: 44rem; padding: 4rem 0; }
  .beat-line { margin: 0; color: var(--color-ink); font: 400 clamp(1.9rem, 4.2vw, 3.5rem)/1.16 var(--font-display); letter-spacing: -0.005em; text-wrap: balance; text-shadow: 0 2px 24px rgba(3, 4, 14, 0.9); }
  .beat-note { margin: 1.4rem 0 0; max-width: 32rem; color: var(--color-ink-soft); font: 400 clamp(1rem, 1.4vw, 1.15rem)/1.6 var(--font-ui); text-shadow: 0 1px 12px rgba(3, 4, 14, 0.9); }
  .prompter .about-beat { opacity: 0.18; transform: translateY(1.5rem); transition: opacity var(--dur-calm) var(--ease-calm), transform var(--dur-calm) var(--ease-calm); }
  .prompter .about-beat.is-current { opacity: 1; transform: none; }

  .about-constellations { list-style: none; margin: 2.25rem 0 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem; max-width: 38rem; }
  .about-constellations li { display: grid; justify-items: center; gap: 0.6rem; color: var(--color-ink-soft); font: 500 0.8rem/1.25 var(--font-ui); text-align: center; }
  .about-figure { width: 100%; max-width: 5.5rem; aspect-ratio: 1; }
  .about-figure line { stroke: rgba(196, 200, 230, 0.42); stroke-width: 1.2; }
  .about-figure path { fill: none; stroke: rgba(196, 200, 230, 0.7); stroke-width: 1.1; }

  .about-ending { display: flex; flex-direction: column; justify-content: center; min-height: 100vh; min-height: 100svh; max-width: 44rem; padding: 4rem 0; }
  .about-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 2rem; margin-top: 2.25rem; }
  .about-back, .about-link { display: inline-flex; align-items: center; min-height: var(--target); font: 500 1rem/1 var(--font-ui); text-underline-offset: 0.3em; }
  .about-back { gap: 0.5rem; color: var(--color-ink); text-decoration: underline; text-decoration-color: var(--color-gold); text-decoration-thickness: 1px; }
  .about-back:hover { text-decoration-thickness: 2px; }
  .about-link { color: var(--color-ink-soft); text-decoration: underline; }
  .about-link:hover { color: var(--color-ink); }

  footer { position: relative; z-index: 1; padding: 0 max(var(--gutter), env(safe-area-inset-right)) max(2rem, env(safe-area-inset-bottom)) max(var(--gutter), env(safe-area-inset-left)); color: var(--color-ink-muted); font: 400 0.8rem/1.5 var(--font-ui); max-width: 44rem; }

  /* Gentle motion, only where it is welcome: the light breathes and the
     lines drift, so slowly it reads as depth, not movement. */
  @media (prefers-reduced-motion: no-preference) {
    html { scroll-behavior: smooth; }
    .stage-light { animation: drift 38s ease-in-out infinite alternate; }
    .stage-figure { animation: float 46s ease-in-out infinite alternate; }
    .stage-figure:nth-child(2n) { animation-duration: 58s; animation-direction: alternate-reverse; }
  }
  @keyframes drift { from { transform: translate3d(-3%, 2%, 0) scale(1); } to { transform: translate3d(3%, -2%, 0) scale(1.08); } }
  @keyframes float { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(1.5vmin, -2vmin, 0); } }

  /* Phones: words across the width over a darker lower half, the chapter
     dots as a short row in the header, every thought fitting one screen. */
  @media (max-width: 600px), (max-height: 500px) {
    :root { --gutter: 1.25rem; }
    .about-scrim {
      background:
        linear-gradient(to bottom, rgba(3, 4, 14, 0.55), rgba(3, 4, 14, 0.82) 40%, rgba(3, 4, 14, 0.9)),
        radial-gradient(120% 80% at 50% 30%, transparent 50%, rgba(3, 4, 14, 0.6));
    }
    .about-bar { --fade: 1rem; padding-top: max(0.25rem, env(safe-area-inset-top)); }
    /* The dots as a row along the bottom, on a shade of their own, so
       words scrolling past go under it, never behind a lit dot. */
    .about-progress { top: auto; left: 0; right: 0; bottom: 0; transform: none; padding: 0.75rem 0 max(0.25rem, env(safe-area-inset-bottom)); background: linear-gradient(to top, var(--void) calc(100% - 0.75rem), rgba(3, 4, 14, 0)); }
    .about-progress ol { grid-auto-flow: column; justify-content: center; gap: 0; }
    .about-progress a { padding: 0; justify-content: center; }
    /* Out of sight but still each link's name for a screen reader. */
    /* Under the phone's heavier scrim the footage would all but vanish, so
       it is a little brighter here; the scrim, and so the words, are as on
       every other chapter. */
    .about-video { filter: grayscale(1) contrast(1.1) brightness(1.15); }
    .about-progress .label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .chapter-head { padding-top: 26vh; }
    h1, h2 { font-size: clamp(2.3rem, 11vw, 3rem); }
    .about-beat { min-height: 80vh; min-height: 80svh; padding: 3rem 0 4.5rem; }
    .beat-line { font-size: clamp(1.6rem, 7.4vw, 2.1rem); }
    .beat-note { font-size: 1rem; }
    .about-constellations { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin-top: 1.5rem; }
    .about-figure { max-width: 4rem; }
    footer { padding-bottom: calc(4.5rem + env(safe-area-inset-bottom)); }
  }
  @media (max-height: 500px) and (orientation: landscape) {
    .chapter-head { padding-top: 22vh; }
    .about-beat { min-height: 100vh; min-height: 100svh; padding: 3.5rem 0 3.5rem; }
    .beat-line { font-size: 1.6rem; }
    .about-constellations { grid-template-columns: repeat(5, minmax(0, 1fr)); margin-top: 1rem; }
    .about-figure { max-width: 3rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    .prompter .about-beat { opacity: 1; transform: none; transition: none; }
    .about-video { display: none; }
  }
</style>
</head>
<body>
<div class="about-stage" aria-hidden="true">
  <div class="about-video-slot" data-about-video data-for="how" data-webm="${ABOUT_VIDEO.webm}" data-mp4="${ABOUT_VIDEO.mp4}" aria-hidden="true"></div>
  <div class="stage-light"></div>
  ${stageLines()}
  <div class="about-scrim"></div>
</div>

<header class="about-bar">
  <a class="about-wordmark" href="/" aria-label="Overlap: back to the lounge">Overlap</a>
  <a class="about-bar-back" href="/">Back to lounge</a>
</header>

<nav class="about-progress" aria-label="Chapters">
  <ol>
      ${progress}
  </ol>
</nav>

<main>
  <section class="about-chapter" id="how" aria-labelledby="how-title">
    <div class="chapter-head">
      <p class="chapter-kicker">Overlap · About</p>
      <h1 id="how-title">How Overlap works</h1>
      <p class="chapter-cue">Scroll to read, at your own pace.</p>
    </div>
    ${beat("Studying alone can feel heavier than the work.", "Not because the work changes, but because no one else seems to be there.")}
    ${beat("Overlap gives you quiet company, not another social platform.", "No account, no profile, no followers. Nothing to keep up with, nothing to perform.")}
    ${beat("Place one star. Let it glow while you are here.", "Glowing means a lounge is open in a visible browser tab. It never says who anyone is, or where. When you see other stars glowing, someone else is studying too.")}
  </section>

  <section class="about-chapter" id="focus" aria-labelledby="focus-title">
    <h2 id="focus-title" class="chapter-kicker">Focus</h2>
    ${beat("Choose a constellation when you want a calmer shared focus.", "Begin in the Common Room. Settle your star into one of five constellations when you want a quieter space beside people studying something close to you. It still shows in the Common Room.", `
        <ul class="about-constellations" aria-label="The five constellations">
            ${constellations}
        </ul>`)}
  </section>

  <section class="about-chapter" id="talk" aria-labelledby="talk-title">
    <h2 id="talk-title" class="chapter-kicker">Talking</h2>
    ${beat("Use a short-lived conversation only when a few words help.", "Choose a callsign if you want to speak; it is never your real name. The Common Room has one conversation for everyone, and a constellation's conversation stays with the stars settled there. The lounge stops showing a message after a day.")}
  </section>

  <section class="about-chapter" id="return" aria-labelledby="return-title">
    <h2 id="return-title" class="chapter-kicker">Return</h2>
    <div class="about-ending">
      <p class="beat-line">The work is still yours. You just do not have to sit with it entirely alone.</p>
      <div class="about-actions">
        <a class="about-back" href="/">Return to the lounge</a>
        <a class="about-link" href="/readme/">Read the technical notes</a>
      </div>
    </div>
  </section>
</main>

<footer>
  <p>Overlap is anonymous: no account, no profile. The galaxy behind this page is the arrival artwork, made for Overlap with OpenAI image generation and recorded in the project's docs/credits.md.</p>
</footer>

<script>
  // The teleprompter and the chapter rail, only where motion is welcome.
  // Without this script, or with reduced motion, every thought is shown.
  (function () {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var c = navigator.connection;
    var light = Boolean(c && (c.saveData || c.effectiveType === "slow-2g" || c.effectiveType === "2g"));
    if (!("IntersectionObserver" in window)) return;

    // The thought nearest the middle of the screen is the one being read.
    if (!reduce) {
      document.documentElement.classList.add("prompter");
      var beats = document.querySelectorAll(".about-beat");
      var reading = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { e.target.classList.toggle("is-current", e.isIntersecting); });
      }, { rootMargin: "-38% 0px -38% 0px" });
      beats.forEach(function (b) { reading.observe(b); });
    }

    // The chapter on screen lights its dot.
    var links = {};
    document.querySelectorAll(".about-progress a").forEach(function (a) { links[a.getAttribute("data-chapter")] = a; });
    var onChapter = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(links).forEach(function (id) {
          if (id === e.target.id) links[id].setAttribute("aria-current", "step");
          else links[id].removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    document.querySelectorAll("main section").forEach(function (s) { onChapter.observe(s); });

    // The moving background: never under reduced motion, Save-Data or 2g,
    // made only once its chapter has stayed near, shown only while that
    // chapter is on screen, silent, and paused whenever it is not seen. If it
    // cannot load or play, the galaxy simply stays.
    var slot = document.querySelector("[data-about-video]");
    if (!slot || reduce || light) return;
    var probe = document.createElement("video");
    var src = "";
    // H.264 first: Safari and iPhone play it most reliably. VP9 WebM for a
    // browser without H.264.
    if (slot.getAttribute("data-mp4") && probe.canPlayType && probe.canPlayType('video/mp4; codecs="avc1.64001f"')) src = slot.getAttribute("data-mp4");
    else if (slot.getAttribute("data-webm") && probe.canPlayType && probe.canPlayType('video/webm; codecs="vp9"')) src = slot.getAttribute("data-webm");
    if (!src) return;
    var how = document.getElementById(slot.getAttribute("data-for"));
    var video = null;
    var inView = false;
    function drop() {
      if (!video) return;
      slot.classList.remove("is-on");
      video.removeAttribute("src");
      video.load();
      video.remove();
      video = null;
    }
    function make() {
      // Silent before it has a source: Safari allows a muted inline video to
      // play by itself only if it is muted from the start. Decorative: no
      // controls, never focused, never cast or popped out.
      video = document.createElement("video");
      video.className = "about-video";
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("loop", "");
      video.setAttribute("aria-hidden", "true");
      video.setAttribute("disablepictureinpicture", "");
      video.setAttribute("disableremoteplayback", "");
      video.tabIndex = -1;
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "none";
      video.addEventListener("playing", function () { slot.classList.toggle("is-on", inView); });
      video.addEventListener("loadeddata", function () { if (inView && !document.hidden) play(); });
      video.addEventListener("error", drop);
      slot.appendChild(video);
      video.src = src;
      if (inView && !document.hidden) play();
    }
    // A refused play leaves the galaxy showing; nothing else depends on it.
    function play() { var p = video && video.play(); if (p && p.catch) p.catch(function () { slot.classList.remove("is-on"); }); }
    // Made when the chapter is within a screen of view. Shown, and playing,
    // while the chapter still reaches past the middle of the screen; once
    // the next chapter takes over it cross-fades back to the galaxy. Read
    // from the chapter's box, once a frame at most, on scroll.
    // It must stay near for a moment: a link straight to a later chapter
    // scrolls past this one, and that should not fetch anything.
    var wait = 0;
    var near = new IntersectionObserver(function (entries) {
      clearTimeout(wait);
      if (entries[0].isIntersecting && !video) wait = setTimeout(make, 600);
    }, { rootMargin: "0px 0px 100% 0px" });
    var queued = false;
    function check() {
      queued = false;
      var box = how.getBoundingClientRect();
      var now = box.top < window.innerHeight && box.bottom > window.innerHeight / 2;
      if (now === inView) return;
      inView = now;
      if (!video) return;
      if (inView && !document.hidden) play();
      else { video.pause(); slot.classList.remove("is-on"); }
    }
    function onScroll() { if (!queued) { queued = true; requestAnimationFrame(check); } }
    function start() {
      near.observe(how);
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      check();
    }
    document.addEventListener("visibilitychange", function () {
      if (!video) return;
      if (document.hidden) video.pause(); else if (inView) play();
    });
    // Leaving the page pauses it; coming back (the back-forward cache)
    // resumes it only if its chapter is still the one on screen.
    window.addEventListener("pagehide", function () { if (video) { video.pause(); slot.classList.remove("is-on"); } });
    window.addEventListener("pageshow", function (e) { if (e.persisted) { inView = false; check(); } });
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  })();
</script>
</body>
</html>`;
}
