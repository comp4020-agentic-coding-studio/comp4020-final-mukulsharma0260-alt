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

function readableDate(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "long" }).format(new Date(iso));
}

function renderStar(star: Star, viewerStarId: string | undefined, now: Date): string {
  const brightness = oldLight(new Date(star.lastSeenAt), now);
  const isOwn = star.id === viewerStarId;

  if (!isOwn) {
    const label = recencyText(new Date(star.lastSeenAt), now);
    return `<circle class="star ${brightness}" cx="${star.x}" cy="${star.y}" r="0.012" data-id="${escapeAttr(star.id)}" data-own="false"><title>${escapeHtml(label)}</title></circle>`;
  }

  // The viewer's own star is marked with a ring and a text label, not colour
  // alone, so it is still distinguishable without colour vision.
  return `<g class="own-star-group">
    <circle class="star-ring" cx="${star.x}" cy="${star.y}" r="0.028"></circle>
    <circle class="star ${brightness} own" cx="${star.x}" cy="${star.y}" r="0.018" data-id="${escapeAttr(star.id)}" data-own="true" tabindex="0" role="button" aria-label="Your star. Drag or use arrow keys to move it. Hold Shift for a bigger step."><title>This is your star</title></circle>
    <text class="star-you-label" x="${star.x}" y="${star.y - 0.035}" text-anchor="middle">you</text>
  </g>`;
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
    ? `<p id="since">Your star since ${readableDate(ownStar.createdAt)}.</p>`
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
  body { margin: 0; background: #05060c; color: #e8e8f0; font-family: system-ui, sans-serif; }
  main { max-width: 56rem; margin: 0 auto; padding: 1.5rem; }
  #sky-wrap { position: relative; aspect-ratio: 16 / 10; background: radial-gradient(ellipse at 50% 20%, #10122080, transparent), #05060c; border-radius: 0.5rem; overflow: hidden; touch-action: none; }
  svg#sky { width: 100%; height: 100%; display: block; }
  .star { fill: #fff; cursor: grab; }
  .star.bright { fill: #ffffff; filter: drop-shadow(0 0 0.01px #fff); }
  .star.soft { fill: #d8d8ff; opacity: 0.85; }
  .star.dim { fill: #9a9ac0; opacity: 0.6; }
  .star.faint { fill: #5a5a78; opacity: 0.35; }
  .star-ring { fill: none; stroke: #ffd76a; stroke-width: 0.004; stroke-dasharray: 0.01 0.008; }
  .star-you-label { fill: #ffd76a; font-size: 0.045px; font-family: system-ui, sans-serif; }
  .star:focus-visible { outline: 2px solid #ffd76a; outline-offset: 2px; }
  @media (prefers-reduced-motion: no-preference) {
    .star { transition: cx 0.4s ease, cy 0.4s ease, r 0.3s ease, opacity 0.8s ease; }
    .star-ring, .star-you-label { transition: cx 0.4s ease, cy 0.4s ease; }
    .star.new-ring { animation: ring-pulse 1.6s ease-out; }
  }
  @keyframes ring-pulse {
    0% { stroke: #ffd76a; stroke-width: 0.025; stroke-opacity: 0.9; }
    100% { stroke-width: 0.06; stroke-opacity: 0; }
  }
  #banner { min-height: 1.5em; }
  #count, #since, #place-hint { color: #9a9ac0; font-size: 0.9rem; }
  #place-star { background: #ffd76a; color: #05060c; border: none; border-radius: 0.3rem; padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer; }
  footer a { color: #d8d8ff; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
</head>
<body data-has-star="${ownStar ? "true" : "false"}">
<main>
  <h1>Overlap: old light</h1>
  <p>Every visitor gets one star. It fades the longer you stay away, and brightens again the moment you come back.</p>
  <p class="sr-only">${escapeHtml(summary)}</p>
  <div id="banner" role="status" aria-live="polite"></div>
  ${placePrompt}
  <div id="sky-wrap">
    <svg id="sky" viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label="${escapeAttr(summary)}">
      ${circles}
    </svg>
  </div>
  ${belowSkyText}
  ${sinceText}
  <footer><a href="/readme/">About this app</a></footer>
</main>
<script src="/sky.js" defer></script>
</body>
</html>`;
}
