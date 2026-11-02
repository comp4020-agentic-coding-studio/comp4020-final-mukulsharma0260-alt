#!/usr/bin/env node
// Draws the documentation artwork in docs/assets/ from the lounge's own
// constellation figures, so the README and PROCESS banners are the same
// shapes a visitor sees. Decoration only: figures are lines and hollow
// diamonds, never star dots, because inside the lounge every point of light
// is a visitor. Run with `node scripts/build-doc-art.ts`; the output is
// committed, so neither GitHub nor /readme/ runs this.
import { writeFileSync, mkdirSync } from "node:fs";
import { CONSTELLATION_INFO } from "../src/render.ts";
import { CONSTELLATIONS } from "../src/db.ts";

const OUT = new URL("../docs/assets/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const C = {
  navy: "#0B1020",
  navy2: "#141433",
  indigo: "#6366F1",
  violet: "#A78BFA",
  ink: "#E8EAF3",
  muted: "#A9ABC4",
  gold: "#F5D58A",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";

// Deterministic, so a rebuild is byte-identical.
let seed = 4020;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function figure(id: (typeof CONSTELLATIONS)[number], x: number, y: number, size: number, cls = ""): string {
  const { nodes, edges } = CONSTELLATION_INFO[id].figure;
  const at = ([u, v]: [number, number]) => [x + u * size, y + v * size] as const;
  const lines = edges
    .map(([a, b]) => {
      const [x1, y1] = at(nodes[a]!);
      const [x2, y2] = at(nodes[b]!);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    })
    .join("");
  const d = Math.max(2.4, size / 34);
  const diamonds = nodes
    .map((n) => {
      const [px, py] = at(n);
      return `<path d="M${px.toFixed(1)} ${(py - d).toFixed(1)}l${d} ${d}l${-d} ${d}l${-d} ${-d}z"/>`;
    })
    .join("");
  return `<g class="fig ${cls}"><g class="edges">${lines}</g><g class="nodes">${diamonds}</g></g>`;
}

// Faint dust: tiny, low-opacity crosses rather than dots.
function dust(w: number, h: number, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (rand() * w).toFixed(0);
    const y = (rand() * h).toFixed(0);
    const o = (0.12 + rand() * 0.22).toFixed(2);
    out += `<path d="M${x} ${+y - 1.5}v3M${+x - 1.5} ${y}h3" stroke-opacity="${o}"/>`;
  }
  return `<g class="dust" stroke="${C.ink}" stroke-width="0.8">${out}</g>`;
}

const style = (extra = "") => `<style>
  .fig .edges { stroke: ${C.violet}; stroke-width: 1.3; stroke-opacity: .55; fill: none; stroke-linecap: round; }
  .fig .nodes { fill: none; stroke: ${C.ink}; stroke-width: 1.1; stroke-opacity: .75; }
  .fig.warm .edges { stroke: ${C.gold}; stroke-opacity: .7; }
  .fig.warm .nodes { stroke: ${C.gold}; }
  @media (prefers-reduced-motion: no-preference) {
    .drift { animation: drift 18s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
    .drift2 { animation: drift 24s ease-in-out -6s infinite alternate; transform-box: fill-box; transform-origin: center; }
    .pulse { animation: pulse 6s ease-in-out infinite; }
    @keyframes drift { from { transform: translate(0, 0); } to { transform: translate(6px, -4px); } }
    @keyframes pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
  }${extra}
</style>`;

const defs = (w: number) => `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.navy}"/><stop offset=".55" stop-color="${C.navy2}"/><stop offset="1" stop-color="#1E1748"/>
  </linearGradient>
  <radialGradient id="glow" cx=".78" cy=".45" r=".5">
    <stop offset="0" stop-color="${C.indigo}" stop-opacity=".38"/><stop offset=".6" stop-color="${C.violet}" stop-opacity=".08"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="rule" x1="0" x2="1"><stop offset="0" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>
  <clipPath id="frame"><rect width="${w}" height="100%" rx="18"/></clipPath>
</defs>`;

function banner(opts: { file: string; title: string; eyebrow: string; headline: string; accent: string; lede: string; h?: number; size?: number }): void {
  const w = 1280;
  const h = opts.h ?? 400;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="t d">
<title id="t">${opts.title}</title>
<desc id="d">Illustration: the lounge's constellation figures as faint lines. Not a screenshot and not live activity.</desc>
${defs(w)}${style()}
<g clip-path="url(#frame)">
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${dust(w, h, 70)}
  <g class="drift">${figure("engineering", 820, h * 0.12, h * 0.62)}</g>
  <g class="drift2">${figure("arts", 1010, h * 0.46, h * 0.42)}${figure("science", 700, h * 0.52, h * 0.36)}</g>
  <g class="pulse">${figure("health", 1090, h * 0.06, h * 0.3, "warm")}</g>
  <text x="72" y="${h * 0.29}" fill="${C.violet}" font-family="${FONT}" font-size="20" font-weight="600" letter-spacing="3.6">${opts.eyebrow}</text>
  <text x="70" y="${h * 0.52}" fill="${C.ink}" font-family="${SERIF}" font-size="${opts.size ?? 84}" font-weight="700" letter-spacing="-1.5">${opts.headline}<tspan fill="${C.gold}">${opts.accent}</tspan></text>
  <rect x="72" y="${h * 0.6}" width="120" height="3" rx="1.5" fill="url(#rule)"/>
  <text x="72" y="${h * 0.72}" fill="${C.muted}" font-family="${FONT}" font-size="28">${opts.lede}</text>
  <text x="${w - 28}" y="${h - 22}" text-anchor="end" fill="${C.muted}" fill-opacity=".7" font-family="${FONT}" font-size="14" letter-spacing="1.2">ILLUSTRATION · NOT LIVE ACTIVITY</text>
</g>
</svg>
`;
  writeFileSync(new URL(opts.file, OUT), svg);
}

banner({
  file: "overlap-banner.svg",
  title: "Overlap: an anonymous study lounge. Going back to work less alone.",
  eyebrow: "OVERLAP · AN ANONYMOUS STUDY LOUNGE",
  headline: "Less alone",
  accent: ", late.",
  lede: "See others studying too. Say nothing, prove nothing.",
  size: 92,
});

banner({
  file: "process-banner.svg",
  title: "Overlap process overview",
  eyebrow: "OVERLAP · PROCESS OVERVIEW",
  headline: "How it was built",
  accent: ".",
  lede: "Decisions, corrections and the evidence behind them.",
  h: 320,
});

// A timeline: verified dates from the commit history only, in two rows of
// three so it stays legible when GitHub scales it down on a phone.
function timeline(): void {
  const w = 1280;
  const h = 500;
  const stops: Array<[string, string, string]> = [
    ["7 Oct", "Old light", "one anonymous star per browser"],
    ["11 Oct", "Live means looking", "a visible tab, not a connection"],
    ["17 Oct", "A study lounge", "same mechanics, a reason to stay"],
    ["18 Oct", "Constellations", "a Common Room and five places"],
    ["21–23 Oct", "Callsigns and rooms", "isolation tested at the stream"],
    ["27 Oct", "Expiry deployed", "messages swept after 24 hours"],
  ];
  const x0 = 200;
  const x1 = w - 200;
  const rows = [150, 345];
  const step = (x1 - x0) / 2;
  const items = stops
    .map(([date, head, sub], i) => {
      const y = rows[Math.floor(i / 3)]!;
      const x = x0 + (i % 3) * step;
      const warm = i === 2;
      const d = 11;
      return `<g>
    <path d="M${x} ${y - d}l${d} ${d}l${-d} ${d}l${-d} ${-d}z" fill="${C.navy}" stroke="${warm ? C.gold : C.violet}" stroke-width="2.4"/>
    <text x="${x}" y="${y - 32}" text-anchor="middle" fill="${warm ? C.gold : C.violet}" font-family="${FONT}" font-size="22" font-weight="700" letter-spacing="1.4">${date.toUpperCase()}</text>
    <text x="${x}" y="${y + 50}" text-anchor="middle" fill="${C.ink}" font-family="${FONT}" font-size="28" font-weight="600">${head}</text>
    <text x="${x}" y="${y + 82}" text-anchor="middle" fill="${C.muted}" font-family="${FONT}" font-size="20">${sub}</text>
  </g>`;
    })
    .join("\n  ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="t d">
<title id="t">Overlap timeline, October 2026</title>
<desc id="d">Six dated stages from the commit history: old light on 7 October; live means a visible tab on 11 October; the study lounge on 17 October; constellations on 18 October; callsigns and room-scoped conversations on 21 to 23 October; message expiry deployed on 27 October.</desc>
${defs(w)}
<g clip-path="url(#frame)">
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <line x1="${x0}" y1="${rows[0]}" x2="${x1}" y2="${rows[0]}" stroke="${C.violet}" stroke-width="2" stroke-opacity=".45"/>
  <line x1="${x0}" y1="${rows[1]}" x2="${x1}" y2="${rows[1]}" stroke="${C.violet}" stroke-width="2" stroke-opacity=".45"/>
  ${items}
  <text x="${w - 28}" y="${h - 20}" text-anchor="end" fill="${C.muted}" fill-opacity=".75" font-family="${FONT}" font-size="15" letter-spacing="1.2">DATES FROM THE COMMIT HISTORY</text>
</g>
</svg>
`;
  writeFileSync(new URL("process-timeline.svg", OUT), svg);
}
timeline();

// A thin closing strip: the five figures in a row.
function footer(): void {
  const w = 1280;
  const h = 120;
  const size = 84;
  const gap = (w - 5 * size) / 6;
  const figs = CONSTELLATIONS.map((id, i) => figure(id, gap + i * (size + gap), 18, size, i === 2 ? "warm" : "")).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="t">
<title id="t">The five constellations: Science, Engineering, Business, Health, Arts &amp; Society</title>
${defs(w)}${style()}
<g clip-path="url(#frame)">
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <g class="drift">${figs}</g>
</g>
</svg>
`;
  writeFileSync(new URL("overlap-footer.svg", OUT), svg);
}
footer();

// Local badges, so neither page fetches from a badge service.
function badge(file: string, label: string, value: string, color: string): void {
  const cw = 7.2;
  const lw = Math.round(label.length * cw + 20);
  const vw = Math.round(value.length * cw + 20);
  const w = lw + vw;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="24" viewBox="0 0 ${w} 24" role="img" aria-label="${label}: ${value}">
<title>${label}: ${value}</title>
<clipPath id="r"><rect width="${w}" height="24" rx="5"/></clipPath>
<g clip-path="url(#r)">
<rect width="${lw}" height="24" fill="${C.navy}"/>
<rect x="${lw}" width="${vw}" height="24" fill="${color}"/>
</g>
<g font-family="${FONT}" font-size="12" font-weight="600">
<text x="${lw / 2}" y="16" text-anchor="middle" fill="${C.ink}">${label}</text>
<text x="${lw + vw / 2}" y="16" text-anchor="middle" fill="${C.navy}">${value}</text>
</g>
</svg>
`;
  writeFileSync(new URL(`badge-${file}.svg`, OUT), svg);
}
badge("node", "runtime", "Node 24", C.violet);
badge("sqlite", "storage", "node:sqlite", C.violet);
badge("sse", "live", "server-sent events", C.violet);
badge("js", "client", "vanilla JS", C.violet);
badge("fly", "deploy", "one Fly.io machine", C.gold);
badge("adr", "decisions", "12 ADRs", C.gold);
