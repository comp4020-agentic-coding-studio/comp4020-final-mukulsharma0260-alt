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

function renderStar(star: Star, viewerStarId: string | undefined, now: Date): string {
  const brightness = oldLight(new Date(star.lastSeenAt), now);
  const isOwn = star.id === viewerStarId;
  const label = isOwn ? "This is your star" : recencyText(new Date(star.lastSeenAt), now);
  const classes = ["star", brightness, isOwn ? "own" : ""].filter(Boolean).join(" ");
  return `<circle class="${classes}" cx="${star.x}" cy="${star.y}" r="${isOwn ? 0.018 : 0.012}" data-id="${escapeAttr(star.id)}" data-own="${isOwn}"><title>${escapeHtml(label)}</title></circle>`;
}

export function renderHomePage(stars: Star[], viewerStarId: string | undefined, now: Date = new Date()): string {
  const circles = stars.map((s) => renderStar(s, viewerStarId, now)).join("\n");
  const count = stars.length;
  const countText = count === 1 ? "1 star" : `${count} stars`;

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
  .star.own { stroke: #ffd76a; stroke-width: 0.003; }
  .star:focus-visible { outline: 2px solid #ffd76a; outline-offset: 2px; }
  @media (prefers-reduced-motion: no-preference) {
    .star { transition: cx 0.4s ease, cy 0.4s ease, r 0.3s ease; }
    .star.new-ring { animation: ring-pulse 1.6s ease-out; }
  }
  @keyframes ring-pulse {
    0% { stroke: #ffd76a; stroke-width: 0.025; stroke-opacity: 0.9; }
    100% { stroke-width: 0.06; stroke-opacity: 0; }
  }
  #banner { min-height: 1.5em; }
  #count { color: #9a9ac0; font-size: 0.9rem; }
  footer a { color: #d8d8ff; }
</style>
</head>
<body>
<main>
  <h1>Overlap: old light</h1>
  <p>Every visitor gets one star. It fades the longer you stay away, and brightens again the moment you come back.</p>
  <div id="banner" role="status" aria-live="polite"></div>
  <div id="sky-wrap">
    <svg id="sky" viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label="A night sky of ${countText}, one per visitor.">
      ${circles}
    </svg>
  </div>
  <p id="count">${countText}</p>
  <footer><a href="/readme/">About this app</a></footer>
</main>
<script src="/sky.js" defer></script>
</body>
</html>`;
}
