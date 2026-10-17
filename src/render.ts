import type { Star } from "./db.ts";
import { oldLight, recencyText } from "./brightness.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export function formatDateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "long", timeZone }).format(new Date(iso));
}

// Core and glow radius for each old-light level at full size. public/sky.js
// draws stars with the same table once the live stream connects; this is
// only the first paint, so the two must agree.
const STAR_LIGHT: Record<string, { core: number; glow: number }> = {
  bright: { core: 0.0105, glow: 0.034 },
  soft: { core: 0.0085, glow: 0.026 },
  dim: { core: 0.0066, glow: 0.018 },
  faint: { core: 0.005, glow: 0.011 },
};

// Stars shrink gently as the lounge fills: full size up to 20, 60% at 150.
export function crowdScale(n: number): number {
  if (n <= 20) return 1;
  if (n >= 150) return 0.6;
  return 1 - 0.4 * ((n - 20) / 130);
}

function renderStar(star: Star, viewerStarId: string | undefined, now: Date, scale: number): string {
  const level = oldLight(new Date(star.lastSeenAt), now);
  const own = star.id === viewerStarId;
  const light = STAR_LIGHT[level]!;
  const core = (own ? Math.max(light.core, STAR_LIGHT.soft!.core) : light.core) * scale;
  const glow = light.glow * scale;
  const id = escapeAttr(star.id);
  const place = `transform="translate(${star.x} ${star.y})" data-x="${star.x}" data-y="${star.y}" data-brightness="${level}"`;

  if (!own) {
    // Rough recency only, never an exact time.
    const label = recencyText(new Date(star.lastSeenAt), now);
    return `<g class="star ${level}" data-id="${id}" data-own="false" ${place}><circle class="star-glow" r="${glow.toFixed(5)}"></circle><circle class="star-core" r="${core.toFixed(5)}" data-id="${id}"></circle><title>${escapeHtml(label)}</title></g>`;
  }

  // The viewer's own star is marked with a thin ring and a "you" label, not
  // colour alone, so it is still distinguishable without colour vision.
  return `<g class="star ${level} own" data-id="${id}" data-own="true" ${place} tabindex="0" role="button" aria-label="Your star. Drag or use arrow keys to move it. Hold Shift for a bigger step."><circle class="star-glow" r="${glow.toFixed(5)}"></circle><circle class="star-core" r="${core.toFixed(5)}" data-id="${id}"></circle><circle class="star-ring" r="${(core * 2.1).toFixed(5)}"></circle><text class="star-you-label" y="${(-core * 2.1 - 0.014).toFixed(5)}" text-anchor="middle">you</text><title>Your star</title></g>`;
}

const LEGEND_LEVELS: Array<{ cls: string }> = [
  { cls: "bright" },
  { cls: "soft" },
  { cls: "dim" },
  { cls: "faint" },
];

function renderLegend(): string {
  const dots = LEGEND_LEVELS.map(
    (l, i) => `<circle class="legend-dot ${l.cls}" cx="${8 + i * 16}" cy="8" r="${(STAR_LIGHT[l.cls]!.core / STAR_LIGHT.bright!.core * 4.5).toFixed(2)}"></circle>`,
  ).join("");
  return `<div id="legend">
    <svg width="72" height="16" viewBox="0 0 72 16" aria-hidden="true" focusable="false">${dots}</svg>
    <span>Bright stars were seen recently. Faint stars are older light.</span>
  </div>`;
}

export function renderHomePage(
  stars: Star[],
  viewerStarId: string | undefined,
  now: Date = new Date(),
): string {
  const scale = crowdScale(stars.length);
  const circles = stars.map((s) => renderStar(s, viewerStarId, now, scale)).join("\n");
  const count = stars.length;
  const countText = count === 1 ? "1 star" : `${count} stars`;
  const ownStar = viewerStarId ? stars.find((s) => s.id === viewerStarId) : undefined;

  // An empty sky should not claim to know who is here. The live connection
  // supplies that information only after a visitor enters the lounge.
  const belowSkyText = `<p id="count">${count === 0 ? "" : countText}</p>`;

  const sinceText = ownStar
    ? `<p id="since">Your star since <time datetime="${escapeAttr(ownStar.createdAt)}">${formatDateInZone(ownStar.createdAt, "Australia/Sydney")}</time>.</p>`
    : "";

  const placePrompt = !ownStar
    ? `<div id="place-prompt">
        <button id="place-star" class="lounge-button" type="button">Place your star</button>
        <p id="place-hint">Tap or click anywhere in the sky to place your star there, or use the button.</p>
      </div>`
    : "";

  const summary = count === 0
    ? "An empty night sky, waiting for its first star."
    : `A night sky of ${countText}, each one placed and kept by a single visitor. Brightness shows how recently each visitor was last here.`;

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Overlap</title>
<style>
  :root {
    color-scheme: dark;
    --void: #030304;
    --cloud: #101014;
    --ember: #3a3a40;
    --coral: #d2d2d8;
    --ivory: #fafafa;
    --muted: #a5a5ae;
    --gold: #ededed;
    --blue-fire: #d6dbe2;
  }
  body {
    margin: 0;
    color: var(--ivory);
    font-family: system-ui, sans-serif;
    background:
      radial-gradient(ellipse 120% 70% at 50% 10%, rgba(78, 78, 92, 0.18), transparent 60%),
      radial-gradient(ellipse 140% 100% at 50% 95%, rgba(0, 0, 0, 0.88), transparent 70%),
      radial-gradient(ellipse 90% 90% at 50% 40%, transparent 55%, rgba(0, 0, 0, 0.5) 100%),
      var(--void);
  }
  /* The lounge's one centred column. It spans the viewport and centres its
     content; nothing in it may push the page sideways on a phone. */
  main {
    position: relative;
    z-index: 1;
    box-sizing: border-box;
    width: 100%;
    max-width: 42rem;
    margin: 0 auto;
    padding: 1.75rem 1rem 2rem;
    text-align: center;
  }
  html, body { overflow-x: hidden; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  /* The arrival film is atmosphere only. It has no sound; real visitors
     appear later as interactive SVG stars. */
  #arrival {
    position: fixed;
    z-index: 10;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: 1.25rem;
    isolation: isolate;
    background: var(--void);
    transition: opacity 600ms ease, visibility 600ms step-end;
  }
  .arrival-video, .arrival-still, .arrival-grain {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  /* The still galaxy paints first and is the scene; the spiral sits in the
     upper right, so cropping keeps that corner on narrow screens. */
  .arrival-still { z-index: 0; }
  .arrival-still img { width: 100%; height: 100%; object-fit: cover; object-position: 72% 30%; display: block; }
  .arrival-video {
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    /* The supplied nebula is red; graded to blue-violet and screened at low
       opacity, it is only a moving cloud texture over the galaxy. It stays
       transparent until it is actually playing, so it never flashes black. */
    opacity: 0;
    mix-blend-mode: screen;
    filter: hue-rotate(205deg) saturate(1.18) brightness(0.42) contrast(1.1);
  }
  .arrival-video.playing { opacity: 0.34; transition: opacity 1.6s ease; }
  .arrival-grain {
    z-index: 2;
    opacity: 0.16;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Cpath fill='%23000000' fill-opacity='.62' d='M1 2h1v1H1zM7 1h1v1H7zM13 3h1v1h-1zM4 8h1v1H4zM16 7h1v1h-1zM10 11h1v1h-1zM2 14h1v1H2zM15 16h1v1h-1z'/%3E%3C/svg%3E");
  }
  .arrival-copy-wrap {
    position: absolute;
    z-index: 3;
    width: min(100%, 38rem);
    padding: clamp(1rem, 6vw, 3rem);
    text-align: center;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    text-shadow: 0 2px 20px rgba(1, 3, 12, 0.96), 0 1px 2px rgba(1, 3, 12, 0.96);
  }
  .arrival-kicker { margin: 0 0 1rem; color: var(--blue-fire); font: 600 clamp(0.66rem, 1.8vw, 0.78rem) ui-monospace, "Courier New", monospace; letter-spacing: 0.16em; }
  #arrival-title { margin: 0; color: var(--ivory); font-family: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif; font-size: clamp(2.7rem, 8vw, 5rem); font-weight: 700; line-height: 0.94; letter-spacing: -0.025em; text-shadow: 0 2px 22px rgba(0, 0, 0, 0.88); }
  .arrival-copy { max-width: 34rem; margin: 1.25rem auto 0; color: #f2f2f3; font: clamp(0.9rem, 2.5vw, 1.05rem)/1.55 system-ui, sans-serif; }
  /* One button style for the arrival and the lounge. */
  #arrival-submit, .lounge-button {
    border: 1px solid #ffffff;
    border-radius: 0.15rem;
    padding: 0.82rem 1.15rem;
    color: #050506;
    background: var(--gold);
    box-shadow: 0 0 18px rgba(255, 255, 255, 0.18);
    font: 700 0.82rem ui-monospace, "Courier New", monospace;
    letter-spacing: 0.08em;
    cursor: pointer;
    text-transform: uppercase;
  }
  /* Only the arrival button sits lower, towards the horizon. */
  #arrival-submit { transform: translateY(clamp(4rem, 15vh, 8.5rem)); }
  #arrival-submit:hover, .lounge-button:hover { color: #050506; background: #ffffff; border-color: #ffffff; }
  /* Keyboard focus is always visible: a soft ivory ring rather than a hard
     white box, so it reads as part of the scene. */
  #arrival-submit:focus-visible, .lounge-button:focus-visible {
    color: #050506;
    background: #ffffff;
    border-color: #ffffff;
    outline: 2px solid rgba(250, 244, 230, 0.85);
    outline-offset: 3px;
    box-shadow: 0 0 16px rgba(250, 244, 230, 0.22);
  }
  /* The arrival film. It fills the whole viewport: the layer is fixed to it
     and the canvas is absolutely positioned inside, with no pixel sizes,
     max-width, transforms or scale anywhere, so nothing can shrink it into a
     centred box. */
  #arrival-film {
    position: fixed;
    z-index: 20;
    inset: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: #000;
    color: var(--ivory);
    display: none;
  }
  body.filming #arrival-film { display: block; }
  body.filming #arrival { visibility: hidden; opacity: 0; pointer-events: none; }
  #film-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  /* A soft vignette, so the edges fall away into atmosphere. */
  .film-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(ellipse 75% 70% at 50% 45%, transparent 35%, rgba(0, 0, 4, 0.55) 78%, rgba(0, 0, 4, 0.9) 100%);
  }
  .film-copy {
    position: absolute;
    z-index: 1;
    left: 0;
    right: 0;
    bottom: max(7vh, 2.5rem);
    padding: 0 1.25rem;
    text-align: center;
    text-shadow: 0 2px 18px rgba(0, 0, 0, 0.9);
  }
  #film-line {
    min-height: 1.4em;
    margin: 0 0 1.1rem;
    font: clamp(1.05rem, 2.6vw, 1.5rem)/1.35 "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    color: #f7f1e4;
    opacity: 1;
    transition: opacity 600ms ease;
  }
  #film-line.fading { opacity: 0; }
  .film-progress { width: min(100%, 20rem); margin: 0 auto; }
  .film-progress-label {
    display: flex;
    justify-content: space-between;
    margin: 0 0 0.45rem;
    color: #d9dbe6;
    font: 600 0.66rem ui-monospace, "Courier New", monospace;
    letter-spacing: 0.18em;
  }
  .film-bar { height: 2px; background: rgba(250, 244, 230, 0.2); overflow: hidden; }
  #film-bar-fill { display: block; width: 0; height: 100%; background: #f6efe2; }
  .film-pill {
    position: absolute;
    z-index: 2;
    top: 1rem;
    border: 1px solid rgba(250, 244, 230, 0.6);
    border-radius: 999px;
    padding: 0.42rem 0.75rem;
    color: #f7f1e4;
    background: rgba(2, 4, 12, 0.5);
    font: 600 0.62rem ui-monospace, "Courier New", monospace;
    letter-spacing: 0.12em;
    cursor: pointer;
  }
  #film-sound { right: 1rem; }
  /* Skip sits bottom-right on wide screens; on narrow ones it moves to the
     top-left, so it never overlaps the mood line or the bar. */
  #film-skip { top: auto; right: 1rem; bottom: 1rem; }
  @media (max-width: 640px) {
    #film-skip { top: 1rem; right: auto; bottom: auto; left: 1rem; }
  }
  .film-pill:focus-visible { outline: 2px solid rgba(250, 244, 230, 0.9); outline-offset: 2px; }
  body.entered #arrival { visibility: hidden; opacity: 0; pointer-events: none; }
  body:not(.entered) #sky-app { visibility: hidden; opacity: 0; transform: scale(0.985); }
  #sky-app { transition: opacity 600ms ease, transform 600ms ease; }
  body.entered #sky-app { visibility: visible; opacity: 1; transform: scale(1); }
  @media (prefers-reduced-motion: reduce) {
    #arrival { transition-duration: 150ms; }
    #sky-app { transition: opacity 150ms ease; transform: none; }
    body:not(.entered) #sky-app, body.entered #sky-app { transform: none; }
    .arrival-video { display: none; }
  }

  /* On the arrival, the video is the only moving element: the words and the
     button stay still. The lounge keeps its own Crit 9 motion (gliding moves,
     the breathing ring), which is gated on reduced motion below. */
  #arrival .arrival-copy-wrap, #arrival .arrival-copy-wrap * {
    animation: none !important;
    transition: none !important;
  }
  @media (prefers-reduced-motion: reduce) {
    #sky-app *, #sky-app *::before, #sky-app *::after {
      animation: none !important;
      transition: none !important;
    }
  }

  /* The lounge backdrop: the arrival galaxy, blurred until no point of light
     remains and darkened, with the planet horizon still along the bottom.
     Only real visitors are points of light in the lounge. */
  .lounge-backdrop {
    position: fixed;
    z-index: 0;
    /* Overhang the top and sides so the blur has no hard edge, but sit flush
       on the bottom: the planet horizon is at the bottom of the image. */
    inset: -60px -60px 0;
    pointer-events: none;
    background:
      url("/assets/arrival-galaxy-960.webp") 50% 100% / max(100%, 150vh) auto no-repeat,
      #060818;
    filter: blur(28px) brightness(0.36) saturate(1.1);
    opacity: 0;
  }
  body.entered .lounge-backdrop { opacity: 1; }

  .lounge-header { margin: 0 0 1.25rem; }
  .lounge-kicker {
    margin: 0 0 0.6rem;
    color: var(--blue-fire);
    font: 600 0.68rem ui-monospace, "Courier New", monospace;
    letter-spacing: 0.16em;
  }
  /* A small serif title, the arrival's voice; no box or border. */
  #sky-app h1 {
    margin: 0;
    color: var(--ivory);
    font: 700 1.35rem/1.2 "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    letter-spacing: 0.01em;
    border: 0;
    outline: none;
  }
  .lounge-intro { max-width: 30rem; margin: 0.45rem auto 0; color: #e6e7ee; font-size: 0.95rem; line-height: 1.5; }

  #place-prompt { margin: 0.9rem 0 0.5rem; }
  #place-hint { color: var(--muted); font-size: 0.82rem; margin: 0.6rem 0 0; }

  #sky-wrap {
    position: relative;
    aspect-ratio: 1 / 1;
    width: 100%;
    max-width: 34rem;
    margin: 1rem auto;
    touch-action: none;
  }
  svg#sky { width: 100%; height: 100%; display: block; overflow: visible; }

  /* Stars: a warm-white core with a soft glow. Old light changes the core
     size (set in markup) and how strongly it glows. */
  .star { cursor: default; }
  .star.own { cursor: grab; }
  .star-core { fill: #fff6e6; }
  .star-glow { fill: url(#star-glow); }
  .star.bright .star-glow { opacity: 0.95; }
  .star.soft .star-glow   { opacity: 0.7; }
  .star.dim .star-glow    { opacity: 0.45; }
  .star.faint .star-glow  { opacity: 0.25; }
  .star.soft .star-core   { fill: #f3ead9; }
  .star.dim .star-core    { fill: #d9d2c6; opacity: 0.85; }
  .star.faint .star-core  { fill: #b9b3ab; opacity: 0.7; }

  /* Glowing visitors: a pale-blue halo and a slowly breathing ring. */
  .star-halo { fill: url(#star-halo); }
  .star-breath { fill: none; stroke: #c9e2ff; stroke-width: 0.0018; opacity: 0.6; transform-box: fill-box; transform-origin: center; }

  /* Your star: an ivory core with a thin ring and a small "you" label. */
  .star.own .star-core { fill: #fffaf0; }
  .star-ring { fill: none; stroke: #f6efe2; stroke-width: 0.0016; opacity: 0.85; }
  .star-you-label { fill: #f6efe2; font-size: 0.022px; font-family: ui-monospace, "Courier New", monospace; letter-spacing: 0.002px; opacity: 0.85; }
  .star:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  .star:focus { outline: none; }
  .star:focus-visible .star-ring { stroke: #ffffff; stroke-width: 0.0028; opacity: 1; }

  @media (prefers-reduced-motion: no-preference) {
    .star { transition: transform 0.4s ease; }
    .star.dragging { transition: none; }
    .star-breath { animation: star-breathe 4.5s ease-in-out infinite; }
    .star.new-ring .star-core { animation: star-arrive 1.6s ease-out; }
    .lounge-backdrop { transition: opacity 900ms ease; }
  }
  @keyframes star-breathe {
    0%, 100% { opacity: 0.25; transform: scale(0.85); }
    50% { opacity: 0.75; transform: scale(1.15); }
  }
  @keyframes star-arrive {
    0% { opacity: 0.3; }
    100% { opacity: 1; }
  }

  #status {
    min-height: 1.3em;
    text-align: center;
    font-size: 0.8rem;
    color: var(--muted);
    margin: 0.5rem 0;
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  #status.visible { opacity: 1; }
  #status.error { color: #f1c5c5; }

  #count, #since, #live-status { color: #b9bccb; font-size: 0.88rem; text-align: center; margin: 0.3rem 0; }
  #live-status.connected { color: #d4e5f2; }

  #legend { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.5rem; margin: 1rem 0 0.5rem; color: #a9acbb; font-size: 0.76rem; }
  .legend-dot { fill: #fff6e6; }
  .legend-dot.soft   { opacity: 0.8; }
  .legend-dot.dim    { opacity: 0.55; }
  .legend-dot.faint  { opacity: 0.32; }

  footer { text-align: center; margin-top: 1rem; }
  footer a { color: #d6d6df; }
</style>
</head>
<body data-has-star="${ownStar ? "true" : "false"}">
<section id="arrival" aria-labelledby="arrival-title">
  <picture class="arrival-still" aria-hidden="true">
    <source type="image/webp" srcset="/assets/arrival-galaxy-960.webp 960w, /assets/arrival-galaxy-1920.webp 1920w" sizes="100vw">
    <img src="/assets/arrival-galaxy-v3.png" alt="" fetchpriority="high" decoding="async">
  </picture>
  <video class="arrival-video" autoplay muted loop playsinline preload="metadata" aria-hidden="true" disablepictureinpicture disableremoteplayback data-poster="/assets/arrival-galaxy-960.webp">
    <source data-src="/assets/arrival-nebula-720.webm" type="video/webm">
    <source data-src="/assets/arrival-nebula-720.mp4" type="video/mp4">
  </video>
  <div class="arrival-grain" aria-hidden="true"></div>
  <div class="arrival-copy-wrap">
    <p class="arrival-kicker">OVERLAP · ANONYMOUS STUDY LOUNGE</p>
    <h1 id="arrival-title">STUDY, NOT ALONE.</h1>
    <p class="arrival-copy">A quiet place for late-night study. Arrive anonymously, see that others are here, and keep each other company without profiles or pressure.</p>
    <button id="arrival-submit" type="button">ENTER THE LOUNGE →</button>
  </div>
</section>
<section id="arrival-film" aria-hidden="true" aria-label="Arriving in the lounge">
  <canvas id="film-canvas" aria-hidden="true"></canvas>
  <div class="film-vignette" aria-hidden="true"></div>
  <button id="film-sound" class="film-pill" type="button" aria-pressed="false">MUTE</button>
  <button id="film-skip" class="film-pill" type="button">SKIP →</button>
  <div class="film-copy">
    <p id="film-line"></p>
    <div class="film-progress">
      <p class="film-progress-label"><span>ARRIVING</span><span id="film-remaining">30s</span></p>
      <div class="film-bar" role="progressbar" aria-label="Arriving" aria-valuemin="0" aria-valuemax="30" aria-valuenow="0"><span id="film-bar-fill"></span></div>
    </div>
  </div>
</section>
<div class="lounge-backdrop" aria-hidden="true"></div>
<main id="sky-app" aria-hidden="true">
  <header class="lounge-header">
    <p class="lounge-kicker">OVERLAP · ANONYMOUS STUDY LOUNGE</p>
    <h1>Overlap</h1>
    <p class="lounge-intro">Place your star, settle in, and see that others are quietly here.</p>
  </header>
  <p class="sr-only">${escapeHtml(summary)}</p>
  ${placePrompt}
  <div id="sky-wrap">
    <svg id="sky" viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeAttr(summary)}">
      <defs>
        <radialGradient id="star-glow"><stop offset="0" stop-color="#fff2d8" stop-opacity="0.85"/><stop offset="0.35" stop-color="#ffe6c2" stop-opacity="0.32"/><stop offset="1" stop-color="#ffe6c2" stop-opacity="0"/></radialGradient>
        <radialGradient id="star-halo"><stop offset="0" stop-color="#cfe6ff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#9cc8ff" stop-opacity="0.2"/><stop offset="1" stop-color="#9cc8ff" stop-opacity="0"/></radialGradient>
      </defs>
      ${circles}
    </svg>
  </div>
  <div id="status" role="status" aria-live="polite"></div>
  ${belowSkyText}
  <p id="live-status" aria-live="polite">${ownStar ? "Connecting to the lounge…" : "Place a star to join the lounge."}</p>
  ${sinceText}
  ${renderLegend()}
  <footer><a href="/readme/">About this app</a></footer>
</main>
<script src="/sky.js" defer></script>
</body>
</html>`;
}
