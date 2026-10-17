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

function renderStar(star: Star, viewerStarId: string | undefined, now: Date): string {
  const brightness = oldLight(new Date(star.lastSeenAt), now);
  const isOwn = star.id === viewerStarId;

  if (!isOwn) {
    const label = recencyText(new Date(star.lastSeenAt), now);
    return `<circle class="star ${brightness}" cx="${star.x}" cy="${star.y}" r="0.012" data-id="${escapeAttr(star.id)}" data-own="false"><title>${escapeHtml(label)}</title></circle>`;
  }

  // The viewer's own star is marked with a ring and a short text label, not
  // colour alone, so it is still distinguishable without colour vision.
  return `<g class="own-star-group">
    <circle class="star-ring" cx="${star.x}" cy="${star.y}" r="0.026"></circle>
    <circle class="star ${brightness} own" cx="${star.x}" cy="${star.y}" r="0.017" data-id="${escapeAttr(star.id)}" data-own="true" tabindex="0" role="button" aria-label="Your star. Drag or use arrow keys to move it. Hold Shift for a bigger step."><title>This is your star</title></circle>
    <text class="star-you-label" x="${star.x}" y="${star.y - 0.042}" text-anchor="middle">you</text>
  </g>`;
}

const LEGEND_LEVELS: Array<{ cls: string }> = [
  { cls: "bright" },
  { cls: "soft" },
  { cls: "dim" },
  { cls: "faint" },
];

function renderLegend(): string {
  const dots = LEGEND_LEVELS.map(
    (l, i) => `<circle class="legend-dot ${l.cls}" cx="${8 + i * 16}" cy="8" r="5"></circle>`,
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
  const circles = stars.map((s) => renderStar(s, viewerStarId, now)).join("\n");
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
        <button id="place-star" type="button">Place your star</button>
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
  main { max-width: 42rem; margin: 0 auto; padding: 1.5rem; }
  h1 { font-size: 1.4rem; }
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
  #arrival-submit {
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
    transform: translateY(clamp(4rem, 15vh, 8.5rem));
  }
  #arrival-submit:hover { color: #050506; background: #ffffff; border-color: #ffffff; }
  /* Keyboard focus is always visible: a soft ivory ring rather than a hard
     white box, so it reads as part of the scene. */
  #arrival-submit:focus-visible {
    color: #050506;
    background: #ffffff;
    border-color: #ffffff;
    outline: 2px solid rgba(250, 244, 230, 0.85);
    outline-offset: 5px;
    box-shadow: 0 0 0 7px rgba(250, 244, 230, 0.14), 0 0 22px rgba(250, 244, 230, 0.28);
  }
  #sky-app h1:focus-visible {
    outline: 2px solid rgba(250, 244, 230, 0.7);
    outline-offset: 6px;
    border-radius: 0.2rem;
    box-shadow: 0 0 18px rgba(250, 244, 230, 0.18);
  }
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

  #place-prompt { text-align: center; margin: 0.75rem 0; }
  #place-star { background: var(--gold); color: #050506; border: none; border-radius: 0.3rem; padding: 0.5rem 1.1rem; font-size: 1rem; cursor: pointer; }
  #place-hint { color: var(--muted); font-size: 0.85rem; margin: 0.5rem 0 0; }

  #sky-wrap {
    position: relative;
    aspect-ratio: 1 / 1;
    width: 100%;
    max-width: 34rem;
    margin: 1rem auto;
    touch-action: none;
  }
  svg#sky { width: 100%; height: 100%; display: block; overflow: visible; }

  .star { fill: #fff9eb; cursor: grab; }
  .star.bright { fill: #ffffff; filter: drop-shadow(0 0 0.008 #ffffff) drop-shadow(0 0 0.026 rgba(255, 255, 255, 0.55)); }
  .star.soft   { fill: #dedee3; opacity: 0.88; filter: drop-shadow(0 0 0.014 rgba(222, 222, 227, 0.35)); }
  .star.dim    { fill: #a4a4ad; opacity: 0.62; filter: drop-shadow(0 0 0.006 rgba(164, 164, 173, 0.22)); }
  .star.faint  { fill: #71717b; opacity: 0.5; }

  .star-ring { fill: none; stroke: var(--gold); stroke-width: 0.0035; stroke-dasharray: 0.007 0.006; opacity: 0.75; }
  .star-you-label { fill: var(--gold); font-size: 0.026px; font-family: system-ui, sans-serif; letter-spacing: 0.0005px; opacity: 0.85; }
  .star:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

  @media (prefers-reduced-motion: no-preference) {
    .star { transition: cx 0.4s ease, cy 0.4s ease, r 0.3s ease, opacity 0.8s ease; }
    .star-ring, .star-you-label { transition: cx 0.4s ease, cy 0.4s ease; }
    .star-ring { animation: ring-breathe 4s ease-in-out infinite; }
    .star.new-ring { animation: ring-pulse 1.6s ease-out; }
  }
  @keyframes ring-breathe {
    0%, 100% { opacity: 0.55; }
    50% { opacity: 0.9; }
  }
  @keyframes ring-pulse {
    0% { stroke: var(--gold); stroke-width: 0.025; stroke-opacity: 0.9; }
    100% { stroke-width: 0.06; stroke-opacity: 0; }
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

  .star.live { stroke: var(--blue-fire); stroke-width: 0.004; filter: drop-shadow(0 0 0.018 rgba(184, 216, 240, 0.9)); }
  .star.live.own { stroke: var(--gold); }
  #count, #since, #live-status { color: var(--muted); font-size: 0.9rem; text-align: center; margin: 0.3rem 0; }
  #live-status.connected { color: #d4e5f2; }

  #legend { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin: 1rem 0 0.5rem; color: var(--muted); font-size: 0.78rem; }
  .legend-dot.bright { fill: #fff9eb; }
  .legend-dot.soft   { fill: #ebd8bf; opacity: 0.88; }
  .legend-dot.dim    { fill: #b99597; opacity: 0.62; }
  .legend-dot.faint  { fill: #80666e; opacity: 0.5; }

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
<main id="sky-app" aria-hidden="true">
  <h1>Overlap</h1>
  <p>A quiet anonymous study lounge. Place your star, settle in, and see that others are quietly here.</p>
  <p class="sr-only">${escapeHtml(summary)}</p>
  ${placePrompt}
  <div id="sky-wrap">
    <svg id="sky" viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeAttr(summary)}">
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
