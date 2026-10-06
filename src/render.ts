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

export function renderHomePage(stars: Star[], viewerStarId: string | undefined, now: Date = new Date()): string {
  const circles = stars.map((s) => renderStar(s, viewerStarId, now)).join("\n");
  const count = stars.length;
  const countText = count === 1 ? "1 star" : `${count} stars`;
  const ownStar = viewerStarId ? stars.find((s) => s.id === viewerStarId) : undefined;

  const belowSkyText = count === 0
    ? `<p id="count">No one has placed a star yet.</p>`
    : `<p id="count">${countText}</p>`;

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
  :root { color-scheme: dark; }
  body {
    margin: 0;
    color: #e8e8f0;
    font-family: system-ui, sans-serif;
    background:
      radial-gradient(ellipse 120% 70% at 50% 10%, rgba(94, 74, 164, 0.30), transparent 60%),
      radial-gradient(ellipse 140% 100% at 50% 95%, rgba(18, 22, 48, 0.65), transparent 70%),
      radial-gradient(ellipse 90% 90% at 50% 40%, transparent 55%, rgba(0, 0, 0, 0.5) 100%),
      #05060c;
  }
  main { max-width: 42rem; margin: 0 auto; padding: 1.5rem; }
  h1 { font-size: 1.4rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  #place-prompt { text-align: center; margin: 0.75rem 0; }
  #place-star { background: #ffd76a; color: #05060c; border: none; border-radius: 0.3rem; padding: 0.5rem 1.1rem; font-size: 1rem; cursor: pointer; }
  #place-hint { color: #9a9ac0; font-size: 0.85rem; margin: 0.5rem 0 0; }

  #sky-wrap {
    position: relative;
    aspect-ratio: 1 / 1;
    width: 100%;
    max-width: 34rem;
    margin: 1rem auto;
    touch-action: none;
  }
  svg#sky { width: 100%; height: 100%; display: block; overflow: visible; }

  .star { fill: #fff; cursor: grab; }
  .star.bright { fill: #ffffff; filter: drop-shadow(0 0 0.008 #ffffff) drop-shadow(0 0 0.026 rgba(214, 225, 255, 0.55)); }
  .star.soft   { fill: #dbe0ff; opacity: 0.88; filter: drop-shadow(0 0 0.014 rgba(200, 210, 255, 0.35)); }
  .star.dim    { fill: #9a9ac0; opacity: 0.62; filter: drop-shadow(0 0 0.006 rgba(154, 154, 192, 0.22)); }
  .star.faint  { fill: #8585ab; opacity: 0.5; }

  .star-ring { fill: none; stroke: #ffd76a; stroke-width: 0.0035; stroke-dasharray: 0.007 0.006; opacity: 0.75; }
  .star-you-label { fill: #ffd76a; font-size: 0.026px; font-family: system-ui, sans-serif; letter-spacing: 0.0005px; opacity: 0.85; }
  .star:focus-visible { outline: 2px solid #ffd76a; outline-offset: 2px; }

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
    0% { stroke: #ffd76a; stroke-width: 0.025; stroke-opacity: 0.9; }
    100% { stroke-width: 0.06; stroke-opacity: 0; }
  }

  #status {
    min-height: 1.3em;
    text-align: center;
    font-size: 0.8rem;
    color: #9a9ac0;
    margin: 0.5rem 0;
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  #status.visible { opacity: 1; }
  #status.error { color: #ffb3b3; }

  #count, #since { color: #9a9ac0; font-size: 0.9rem; text-align: center; margin: 0.3rem 0; }

  #legend { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin: 1rem 0 0.5rem; color: #9a9ac0; font-size: 0.78rem; }
  .legend-dot.bright { fill: #ffffff; }
  .legend-dot.soft   { fill: #dbe0ff; opacity: 0.88; }
  .legend-dot.dim    { fill: #9a9ac0; opacity: 0.62; }
  .legend-dot.faint  { fill: #8585ab; opacity: 0.5; }

  footer { text-align: center; margin-top: 1rem; }
  footer a { color: #d8d8ff; }
</style>
</head>
<body data-has-star="${ownStar ? "true" : "false"}">
<main>
  <h1>Overlap: old light</h1>
  <p>Every visitor gets one star. It fades the longer you stay away, and brightens again the moment you come back.</p>
  <p class="sr-only">${escapeHtml(summary)}</p>
  ${placePrompt}
  <div id="sky-wrap">
    <svg id="sky" viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeAttr(summary)}">
      ${circles}
    </svg>
  </div>
  <div id="status" role="status" aria-live="polite"></div>
  ${belowSkyText}
  ${sinceText}
  ${renderLegend()}
  <footer><a href="/readme/">About this app</a></footer>
</main>
<script src="/sky.js" defer></script>
</body>
</html>`;
}
