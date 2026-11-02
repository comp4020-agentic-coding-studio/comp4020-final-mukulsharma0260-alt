// The About page at /about/: a short visual story for a student arriving
// tired or alone, in five chapters. It is separate from /readme/, which stays
// the plain marker-facing README. It is a page to read, not part of the
// lounge: no cookie is read or set, nothing is logged, and it loads neither
// sky.js nor the live stream, so visiting it never makes anyone glow.
//
// Every word is real HTML, readable with JavaScript off and with no motion.
// The script only adds gentle reveals past the first screen, and the
// background is the arrival's own galaxy, blurred like the lounge's backdrop
// so no point of light in it can pass for a visitor. A slot is ready for a
// moving background later, but only once a video's source and licence are
// recorded in docs/credits.md; until then it is empty and nothing is fetched.
import { CONSTELLATION_INFO } from "./render.ts";
import { CONSTELLATIONS } from "./db.ts";

// The approved background video, if any: a path under /assets/ that is
// listed in docs/credits.md. Empty: the still artwork is the background.
const ABOUT_VIDEO = "";

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

export function renderAboutPage(): string {
  const constellations = CONSTELLATIONS.map((id) =>
    `<li>${figure(id)}<span>${CONSTELLATION_INFO[id].name.replace("&", "&amp;")}</span></li>`).join("\n          ");

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>About Overlap · Study, not alone</title>
<meta name="description" content="Overlap is a quiet anonymous lounge to see that others are studying too, without profiles, pressure or needing to perform.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23070814'/%3E%3Ccircle cx='32' cy='32' r='14' fill='%23e9c47e' fill-opacity='.25'/%3E%3Ccircle cx='32' cy='32' r='6' fill='%23fff6e4'/%3E%3C/svg%3E">
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
    --color-line-strong: rgba(244, 238, 226, 0.32);
    --font-display: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    --font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --font-mono: ui-monospace, "SFMono-Regular", Menlo, "Courier New", monospace;
    --target: 2.75rem;
    --gutter: clamp(1.25rem, 5vw, 4rem);
    --dur-calm: 600ms;
    --ease-calm: cubic-bezier(0.33, 0, 0.25, 1);
  }
  html { background: #030304; }
  body {
    margin: 0;
    color: var(--color-ink);
    font-family: var(--font-ui);
    -webkit-font-smoothing: antialiased;
    background: #030304;
  }
  /* The arrival's galaxy, blurred until no point of light remains (as the
     lounge's backdrop is), then shaded so the words always read first. */
  .about-backdrop {
    position: fixed;
    z-index: 0;
    inset: -60px -60px 0;
    pointer-events: none;
    background:
      url("/assets/arrival-galaxy-960.webp") 50% 100% / max(100%, 150vh) auto no-repeat,
      #060818;
    filter: blur(28px) brightness(0.42) saturate(1.1);
  }
  @media (min-width: 1200px) {
    .about-backdrop { background-image: url("/assets/arrival-galaxy-1920.webp"); }
  }
  /* A future approved video sits here, under the same shade; empty now. */
  .about-video { position: fixed; z-index: 0; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 1.2s var(--ease-calm); pointer-events: none; }
  .about-video.is-ready { opacity: 0.32; }
  .about-shade {
    position: fixed;
    z-index: 0;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(3, 4, 14, 0.82), rgba(3, 4, 14, 0.42) 62%, rgba(3, 4, 14, 0.2)),
      linear-gradient(to top, rgba(3, 4, 14, 0.7), transparent 40%);
  }

  .about-bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: max(0.75rem, env(safe-area-inset-top)) max(var(--gutter), env(safe-area-inset-right)) 0.75rem max(var(--gutter), env(safe-area-inset-left));
    background: linear-gradient(to bottom, rgba(3, 4, 14, 0.85), transparent);
  }
  .about-wordmark { color: var(--color-ink); font: 400 1.35rem/1 var(--font-display); text-decoration: none; display: inline-flex; align-items: center; min-height: var(--target); }
  .about-bar-enter { color: var(--color-ink-soft); font: 500 0.875rem/1 var(--font-ui); text-decoration: none; display: inline-flex; align-items: center; min-height: var(--target); padding: 0 0.25rem; }
  .about-bar-enter:hover { color: var(--color-ink); text-decoration: underline; }

  main { position: relative; z-index: 1; }
  .about-chapter {
    box-sizing: border-box;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 5rem max(var(--gutter), env(safe-area-inset-right)) 5rem max(var(--gutter), env(safe-area-inset-left));
    scroll-margin-top: 3rem;
  }
  .about-inner { max-width: 36rem; }
  .about-kicker { margin: 0 0 1rem; color: var(--color-ink-muted); font: 600 0.75rem/1 var(--font-mono); letter-spacing: 0.22em; text-transform: uppercase; }
  h1 { margin: 0; color: var(--color-ink); font: 400 clamp(2.6rem, 7vw, 5.2rem)/0.98 var(--font-display); letter-spacing: -0.01em; text-wrap: balance; }
  h2 { margin: 0 0 1.75rem; color: var(--color-gold); font: 600 0.8rem/1 var(--font-mono); letter-spacing: 0.2em; text-transform: uppercase; }
  #return h2 { color: var(--color-ink); font: 400 clamp(2rem, 5vw, 3.6rem)/1.05 var(--font-display); letter-spacing: -0.01em; text-transform: none; margin-bottom: 1rem; }
  .about-lead { margin: 1.5rem 0 0; color: var(--color-ink-soft); font: 400 clamp(1.05rem, 2.2vw, 1.3rem)/1.55 var(--font-ui); max-width: 32rem; }
  /* One thought at a time, read like lines on a prompter. */
  .about-lines { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.9rem; }
  .about-lines li { color: var(--color-ink); font: 400 clamp(1.45rem, 3.4vw, 2.15rem)/1.25 var(--font-display); }
  .about-lines + .about-lines { margin-top: 2.25rem; }
  .about-note { margin: 2rem 0 0; color: var(--color-ink-soft); font: 400 0.95rem/1.55 var(--font-ui); max-width: 30rem; }

  .about-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.5rem; margin-top: 2rem; }
  .about-enter {
    display: inline-flex;
    align-items: center;
    min-height: var(--target);
    padding: 0 1.25rem;
    border: 1px solid #ffffff;
    border-radius: 0.15rem;
    color: #050506;
    background: #ededed;
    box-shadow: 0 0 18px rgba(255, 255, 255, 0.18);
    font: 700 0.82rem/1 var(--font-mono);
    letter-spacing: 0.08em;
    text-decoration: none;
  }
  .about-enter:hover { background: #ffffff; }
  .about-link { display: inline-flex; align-items: center; min-height: var(--target); color: var(--color-ink-soft); font: 500 0.95rem/1 var(--font-ui); text-decoration: underline; text-underline-offset: 0.25em; }
  .about-link:hover { color: var(--color-ink); }
  a:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 3px; border-radius: 0.15rem; }

  /* The five constellations, as the lounge draws them: lines and hollow
     diamonds, never points of light. */
  .about-constellations { list-style: none; margin: 2.25rem 0 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem; max-width: 40rem; }
  .about-constellations li { display: grid; justify-items: center; gap: 0.6rem; color: var(--color-ink-soft); font: 500 0.8rem/1.25 var(--font-ui); text-align: center; }
  .about-figure { width: 100%; max-width: 6.5rem; aspect-ratio: 1; }
  .about-figure line { stroke: rgba(196, 200, 230, 0.32); stroke-width: 1.2; }
  .about-figure path { fill: none; stroke: rgba(196, 200, 230, 0.6); stroke-width: 1.1; }

  footer { position: relative; z-index: 1; padding: 0 max(var(--gutter), env(safe-area-inset-right)) max(2rem, env(safe-area-inset-bottom)) max(var(--gutter), env(safe-area-inset-left)); color: var(--color-ink-muted); font: 400 0.8rem/1.5 var(--font-ui); }

  /* Reveals are opt-in: the words are visible unless the script runs and
     motion is welcome, and then each line fades in once as it arrives. */
  .motion .reveal { opacity: 0; transform: translateY(0.75rem); transition: opacity var(--dur-calm) var(--ease-calm), transform var(--dur-calm) var(--ease-calm); }
  .motion .reveal.is-in { opacity: 1; transform: none; }

  /* Phones: their own spacing, sizes and crop, not a squeezed desktop. */
  @media (max-width: 600px), (max-height: 500px) {
    :root { --gutter: 1.25rem; }
    .about-backdrop { background-position: 62% 100%; }
    .about-shade { background: linear-gradient(to bottom, rgba(3, 4, 14, 0.55), rgba(3, 4, 14, 0.78)); }
    .about-chapter { padding-top: 4.5rem; padding-bottom: 3.5rem; }
    #arrive { justify-content: center; min-height: calc(100dvh - 4rem); padding-top: 1.5rem; }
    h1 { font-size: clamp(2.5rem, 12vw, 3.4rem); }
    .about-lead { font-size: 1.05rem; }
    .about-lines li { font-size: 1.4rem; }
    .about-constellations { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem 0.75rem; }
    .about-figure { max-width: 4.5rem; }
  }
  @media (max-height: 500px) and (orientation: landscape) {
    .about-chapter { min-height: auto; padding-top: 3.5rem; padding-bottom: 3rem; }
    #arrive { min-height: calc(100dvh - 3.5rem); }
    h1 { font-size: 2.4rem; }
    .about-constellations { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  }

  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    .motion .reveal { opacity: 1; transform: none; transition: none; }
    .about-video { display: none; }
  }
  @media (prefers-reduced-motion: no-preference) {
    html { scroll-behavior: smooth; }
  }
</style>
</head>
<body>
<div class="about-backdrop" aria-hidden="true"></div>
<div class="about-video-slot" data-about-video data-src="${ABOUT_VIDEO}" aria-hidden="true"></div>
<div class="about-shade" aria-hidden="true"></div>

<header class="about-bar">
  <a class="about-wordmark" href="/" aria-label="Overlap: go to the lounge">Overlap</a>
  <a class="about-bar-enter" href="/" aria-label="Enter the lounge, from the top bar">Enter the lounge</a>
</header>

<main>
  <section class="about-chapter" id="arrive" aria-labelledby="about-title">
    <div class="about-inner">
      <p class="about-kicker">Overlap · About</p>
      <h1 id="about-title">STUDY, NOT ALONE.</h1>
      <p class="about-lead">A quiet anonymous lounge for the moments when working by yourself feels heavier than the work.</p>
      <div class="about-actions">
        <a class="about-enter" href="/" aria-label="Enter the lounge">ENTER THE LOUNGE →</a>
        <a class="about-link" href="#company">Read how it works</a>
      </div>
    </div>
  </section>

  <section class="about-chapter" id="company" aria-labelledby="company-title">
    <div class="about-inner">
      <h2 id="company-title" class="reveal">Quiet company</h2>
      <ul class="about-lines">
        <li class="reveal">You do not need a profile.</li>
        <li class="reveal">You do not need to introduce yourself.</li>
        <li class="reveal">You do not need to keep up.</li>
      </ul>
      <ul class="about-lines">
        <li class="reveal">Place a star.</li>
        <li class="reveal">Let it glow while you are here.</li>
        <li class="reveal">Notice when someone else is here too.</li>
      </ul>
      <p class="about-note reveal">Glowing means a lounge is open in a visible browser tab. It never says who anyone is, or where.</p>
    </div>
  </section>

  <section class="about-chapter" id="focus" aria-labelledby="focus-title">
    <div class="about-inner">
      <h2 id="focus-title" class="reveal">Find your focus</h2>
      <ul class="about-lines">
        <li class="reveal">Begin in the Common Room.</li>
        <li class="reveal">Settle into a constellation when you want a quieter focus nearby.</li>
      </ul>
      <ul class="about-constellations reveal" aria-label="The five constellations">
          ${constellations}
      </ul>
      <p class="about-note reveal">You have one star. It moves with you, and still shows in the Common Room.</p>
    </div>
  </section>

  <section class="about-chapter" id="talking" aria-labelledby="talking-title">
    <div class="about-inner">
      <h2 id="talking-title" class="reveal">Talking, a little</h2>
      <ul class="about-lines">
        <li class="reveal">Choose a callsign if you want to speak.</li>
        <li class="reveal">Keep it short. Keep it kind.</li>
        <li class="reveal">Messages do not stay forever.</li>
      </ul>
      <p class="about-note reveal">A callsign is a name for your messages, never your real one. The Common Room has one conversation for everyone; a constellation's conversation stays with the stars settled there. The lounge stops showing a message after a day.</p>
    </div>
  </section>

  <section class="about-chapter" id="return" aria-labelledby="return-title">
    <div class="about-inner">
      <h2 id="return-title" class="reveal">The work is still yours.</h2>
      <p class="about-lead reveal">You just do not have to sit with it entirely alone.</p>
      <div class="about-actions reveal">
        <a class="about-enter" href="/" aria-label="Enter the lounge, from the end of the page">ENTER THE LOUNGE →</a>
        <a class="about-link" href="/readme/">Read the technical notes</a>
        <a class="about-link" href="#arrive">Back to top</a>
      </div>
    </div>
  </section>
</main>

<footer>
  <p>Overlap is anonymous: no account, no profile. The galaxy behind this page is the arrival artwork, made for Overlap with OpenAI image generation and recorded in the project's docs/credits.md.</p>
</footer>

<script>
  // Gentle reveals past the first screen, only where motion is welcome.
  // The first screen never waits on one. Without this script, or with
  // reduced motion, every word is simply visible.
  (function () {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var c = navigator.connection;
    var light = Boolean(c && (c.saveData || c.effectiveType === "slow-2g" || c.effectiveType === "2g"));

    if (!reduce && "IntersectionObserver" in window) {
      document.documentElement.classList.add("motion");
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          seen.unobserve(e.target);
        });
      }, { rootMargin: "0px 0px -8% 0px" });
      document.querySelectorAll(".reveal").forEach(function (el) { seen.observe(el); });
    }

    // An optional moving background, only once an approved video is set,
    // never under reduced motion, Save-Data or a 2g connection, and only
    // after the page is usable. It pauses whenever the tab is hidden.
    var slot = document.querySelector("[data-about-video]");
    var src = slot && slot.getAttribute("data-src");
    if (!slot || !src || reduce || light) return;
    var video;
    function start() {
      // Made here, not in the page: with no approved video there is no
      // video element at all, and nothing to fetch.
      video = document.createElement("video");
      video.className = "about-video";
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("aria-hidden", "true");
      video.setAttribute("disablepictureinpicture", "");
      video.preload = "none";
      video.src = src;
      slot.appendChild(video);
      video.addEventListener("playing", function () { video.classList.add("is-ready"); }, { once: true });
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
    document.addEventListener("visibilitychange", function () {
      if (!video) return;
      if (document.hidden) video.pause();
      else { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
    });
    if (document.readyState === "complete") setTimeout(start, 600);
    else window.addEventListener("load", function () { setTimeout(start, 600); }, { once: true });
  })();
</script>
</body>
</html>`;
}
