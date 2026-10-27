import { CONSTELLATIONS, type Constellation, type Star } from "./db.ts";
import { oldLight, recencyText } from "./brightness.ts";
import { REGIONS } from "./regions.ts";
import { BREAK_MODES } from "./break.ts";

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

// The five constellations a visitor can study in. The ids match the server's
// allowlist in src/db.ts; the names and lines are copy only. Each figure is
// drawn as faint lines and hollow diamonds, never as points of light, because
// inside the lounge every point of light is a visitor.
type Figure = { nodes: Array<[number, number]>; edges: Array<[number, number]> };
export const CONSTELLATION_INFO: Record<Constellation, { name: string; line: string; figure: Figure }> = {
  science: {
    name: "Science",
    line: "Observe, question, test and explain.",
    figure: { nodes: [[0.16, 0.62], [0.3, 0.3], [0.5, 0.46], [0.68, 0.2], [0.84, 0.48], [0.62, 0.78]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 2]] },
  },
  engineering: {
    name: "Engineering",
    line: "Build, test, solve and iterate.",
    figure: { nodes: [[0.16, 0.76], [0.2, 0.34], [0.48, 0.2], [0.78, 0.34], [0.84, 0.76], [0.5, 0.56]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 5], [5, 3], [0, 5], [5, 4]] },
  },
  business: {
    name: "Business",
    line: "Plan, analyse and make decisions.",
    figure: { nodes: [[0.14, 0.78], [0.32, 0.58], [0.48, 0.66], [0.66, 0.4], [0.86, 0.18], [0.86, 0.4]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  },
  health: {
    name: "Health",
    line: "Learn, care and understand people.",
    figure: { nodes: [[0.5, 0.14], [0.5, 0.86], [0.2, 0.44], [0.8, 0.44], [0.5, 0.44], [0.32, 0.7], [0.68, 0.7]], edges: [[0, 4], [4, 1], [2, 4], [4, 3], [5, 1], [1, 6]] },
  },
  arts: {
    name: "Arts & Society",
    line: "Read, create, question and connect.",
    figure: { nodes: [[0.14, 0.44], [0.32, 0.24], [0.5, 0.38], [0.68, 0.2], [0.86, 0.42], [0.64, 0.72], [0.36, 0.7]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]] },
  },
};

const COMMON_LINE = "Place your star. Settle in. You are not studying alone.";

export function liveText(n: number): string {
  return n === 0 ? "Quiet" : `${n} studying now`;
}

export function traceText(n: number): string {
  return n === 0 ? "No traces yet" : n === 1 ? "1 trace" : `${n} traces`;
}

// ---- Where things are drawn ---------------------------------------------
// Stored positions are fractions 0-1 of the Common Room. The stage fills the
// screen, so they are drawn into it with a margin on each side that keeps
// stars clear of the title and the dock: the Common Room spreads the whole
// room across the stage; a constellation's view spreads only its own region
// across it. The SVG is FRAME_HEIGHT units tall and as wide as the screen's
// shape needs (public/sky.js measures it; the first paint assumes 16:10), so
// stars stay round and no unit is ever sub-pixel. public/sky.js reads these
// margins from the page, so the two never disagree.
export const FRAME_HEIGHT = 1000;
const FIRST_PAINT_WIDTH = 1600;
// On a wide screen the title and the dock share a left column and the stars
// fill the rest; on a narrow or portrait screen the title sits on top and
// the dock is a bottom sheet. These are the first paint's estimates; the
// browser measures the real column, title and sheet and redraws at once.
export const INSETS = {
  wide: { l: 0.36, r: 0.04, t: 0.07, b: 0.07 },
  narrow: { l: 0.06, r: 0.06, t: 0.26, b: 0.34 },
};

function commonFraction(x: number, y: number): { fx: number; fy: number } {
  const i = INSETS.wide;
  return { fx: i.l + x * (1 - i.l - i.r), fy: i.t + y * (1 - i.t - i.b) };
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

// Three levels of light a visitor can tell apart at a glance: studying now
// (an entered, visible tab), recent (seen within a day) and a past trace.
export type Level = "glowing" | "recent" | "trace";

export function lightLevel(star: Star, glowing: boolean, now: Date): Level {
  if (glowing) return "glowing";
  const b = oldLight(new Date(star.lastSeenAt), now);
  return b === "bright" || b === "soft" ? "recent" : "trace";
}

const SPARKLE = "M0 -15L1.1 -1.1L15 0L1.1 1.1L0 15L-1.1 1.1L-15 0L-1.1 -1.1Z";
const OWN_STAR_LABEL = "Your star. Drag it, use the arrow keys, or press Enter and then tap a place to move it.";

// One real star. sky.js draws the same markup once the live stream connects;
// this is only the first paint, so the two agree. The core and halo are
// unit circles scaled by the stylesheet, so a change of light fades.
function renderStar(star: Star, own: boolean, glowing: boolean, now: Date): string {
  const level = lightLevel(star, glowing, now);
  const { fx, fy } = commonFraction(star.x, star.y);
  const area = star.constellation ? ` data-constellation="${star.constellation}"` : "";
  const sparkle = level === "glowing" ? `<path class="star-sparkle" d="${SPARKLE}"></path>` : "";
  const ring = own ? `<circle class="star-ring" r="13"></circle><text class="star-you" y="-21" text-anchor="middle">you</text>` : "";
  // Rough recency only, never an exact time.
  const title = own ? "Your star" : glowing ? "A visitor studying now" : `A visitor, ${recencyText(new Date(star.lastSeenAt), now)}`;
  const focus = own ? ` tabindex="0" role="button" aria-label="${OWN_STAR_LABEL}"` : "";
  return `<g class="star ${level}${own ? " own" : ""}" data-id="${escapeAttr(star.id)}" data-own="${own}" data-level="${level}" data-look="${level === "glowing"}|${own}" data-brightness="${oldLight(new Date(star.lastSeenAt), now)}" data-x="${star.x}" data-y="${star.y}"${area} style="transform: translate(${Math.round(fx * FIRST_PAINT_WIDTH)}px, ${Math.round(fy * FRAME_HEIGHT)}px)"${focus}><circle class="star-halo" r="10"></circle>${sparkle}<circle class="star-core" r="1"></circle>${ring}<title>${escapeHtml(title)}</title></g>`;
}

// A constellation's figure, drawn inside its region of the Common Room:
// faint lines and hollow diamonds, never points of light.
function renderFigure(id: Constellation): string {
  const { nodes, edges } = CONSTELLATION_INFO[id].figure;
  const r = REGIONS[id];
  const pt = ([u, w]: [number, number]) => {
    const { fx, fy } = commonFraction(r.x0 + (r.x1 - r.x0) * u, r.y0 + (r.y1 - r.y0) * w);
    return [Math.round(fx * FIRST_PAINT_WIDTH), Math.round(fy * FRAME_HEIGHT)] as const;
  };
  const lines = edges
    .map(([a, b]) => {
      const [x1, y1] = pt(nodes[a]!);
      const [x2, y2] = pt(nodes[b]!);
      return `<line class="fig-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
    })
    .join("");
  const diamonds = nodes
    .map((n) => {
      const [x, y] = pt(n);
      return `<path class="fig-node" d="M${x} ${y - 6}l6 6l-6 6l-6 -6z"></path>`;
    })
    .join("");
  return `<g class="figure" data-figure="${id}">${lines}${diamonds}</g>`;
}

// In the Common Room each constellation is a doorway: a soft area on the
// map and a labelled link into its own view.
function renderDoorway(id: Constellation, live: number, traces: number): string {
  const r = REGIONS[id];
  const a = commonFraction(r.x0, r.y0);
  const b = commonFraction(r.x1, r.y1);
  const name = CONSTELLATION_INFO[id].name;
  return `<div class="region-area" data-area="${id}" style="left:${pct(a.fx)};top:${pct(a.fy)};width:${pct(b.fx - a.fx)};height:${pct(b.fy - a.fy)}"></div>
      <a class="region" data-region="${id}" data-view="${id}" data-live="${live}" data-traces="${traces}" href="#${id === "arts" ? "arts-society" : id}" style="left:${pct(a.fx)};top:${pct(a.fy)}" aria-label="${escapeAttr(`${name}: ${liveText(live)}. Open ${name}.`)}"><span class="region-name">${escapeHtml(name)}</span><span class="region-live">${liveText(live)}</span></a>`;
}

const SLUG: Record<Constellation, string> = { science: "science", engineering: "engineering", business: "business", health: "health", arts: "arts-society" };

export function renderHomePage(
  stars: Star[],
  viewerStarId: string | undefined,
  now: Date = new Date(),
  traces: { byConstellation: Record<Constellation, number>; unsettled: number } = {
    byConstellation: Object.fromEntries(CONSTELLATIONS.map((c) => [c, 0])) as Record<Constellation, number>,
    unsettled: 0,
  },
  liveStarIds: string[] = [],
  // Independent of viewerStarId: a callsign belongs to the browser identity,
  // not to a star, so it is passed separately rather than read off a star.
  ownCallsign: string | undefined = undefined,
): string {
  const ownStar = viewerStarId ? stars.find((s) => s.id === viewerStarId) : undefined;
  const ownArea = ownStar?.constellation ?? null;
  const live = new Set(liveStarIds);
  const liveIn = (id: Constellation) => stars.filter((s) => s.constellation === id && live.has(s.id)).length;

  // Past traces are drawn first, then recent stars, then glowing ones; your
  // own star is drawn on top of everything.
  const rank = (s: Star) => (s.id === viewerStarId ? 3 : { trace: 0, recent: 1, glowing: 2 }[lightLevel(s, live.has(s.id), now)]);
  const starMarkup = [...stars]
    .sort((a, b) => rank(a) - rank(b))
    .map((s) => renderStar(s, s.id === viewerStarId, live.has(s.id), now))
    .join("");

  const glowingTotal = stars.filter((s) => live.has(s.id)).length;
  const liveLine = `${glowingTotal ? `${glowingTotal} studying now` : "Nobody studying right now"} · ${traceText(stars.length)}`;

  const sinceText = ownStar
    ? `<p id="since">Your star since <time datetime="${escapeAttr(ownStar.createdAt)}">${formatDateInZone(ownStar.createdAt, "Australia/Sydney")}</time>.</p>`
    : "";
  const whereText = !ownStar ? "You have no star yet" : `Your star is in ${ownArea ? CONSTELLATION_INFO[ownArea].name : "the Common Room"}.`;
  const noteText = ownStar ? "Drag your star, or select it and use the arrow keys." : "No name, no profile. Tap an open space, or press the button.";
  const ownGlowing = ownStar ? live.has(ownStar.id) : false;

  const navLinks = [
    `<li><a class="nav-link" href="#" data-view="common" aria-current="page">Common Room</a></li>`,
    ...CONSTELLATIONS.map((id) => {
      const n = liveIn(id);
      return `<li><a class="nav-link" href="#${SLUG[id]}" data-view="${id}" data-live="${n}" aria-label="${escapeAttr(`${CONSTELLATION_INFO[id].name}, ${liveText(n).toLowerCase()}`)}">${escapeHtml(CONSTELLATION_INFO[id].name)}</a></li>`;
    }),
  ].join("\n        ");

  const breakModes = BREAK_MODES.map((m, i) => `<li><button type="button" class="break-mode" data-mode="${m.id}" data-src="${m.src}" aria-pressed="${i === 0}">
            <span class="break-mode-name">${escapeHtml(m.name)}</span>
            <span class="break-mode-line">${escapeHtml(m.line)}</span>
            <span class="break-mode-state" aria-hidden="true"></span>
            <span class="break-mode-count" hidden></span>
          </button></li>`).join("\n          ");

  const info = Object.fromEntries(CONSTELLATIONS.map((id) => [id, { name: CONSTELLATION_INFO[id].name, line: CONSTELLATION_INFO[id].line, ...CONSTELLATION_INFO[id].figure }]));

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Overlap</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23070814'/%3E%3Ccircle cx='32' cy='32' r='14' fill='%23e9c47e' fill-opacity='.25'/%3E%3Ccircle cx='32' cy='32' r='6' fill='%23fff6e4'/%3E%3C/svg%3E">
<style>
  /* ---- Lounge tokens ---------------------------------------------------
     The one source of colour, type, space, depth and motion for the lounge.
     Components below use these, never raw values, except the arrival film,
     which keeps its own small palette. */
  #sky-app {
    /* Colour */
    --color-ink: #f4eee2;
    --color-ink-soft: #d9d4cb;
    --color-ink-muted: #a9a8b8;
    --color-live: #fff6e4;
    --color-recent: #e8dcc6;
    --color-trace: #9c9db4;
    --color-gold: #e9c47e;
    --color-focus: #f4eee2;
    --color-line: rgba(244, 238, 226, 0.14);
    --color-line-strong: rgba(244, 238, 226, 0.32);
    --color-surface: rgba(9, 11, 28, 0.66);
    --color-surface-strong: rgba(9, 11, 28, 0.86);
    /* Type: a display serif for titles only, a readable UI face for
       everything else, mono only for small labels and counts. */
    --font-display: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    --font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --font-mono: ui-monospace, "SFMono-Regular", Menlo, "Courier New", monospace;
    --text-xs: 0.75rem;
    --text-sm: 0.875rem;
    --text-md: 1rem;
    --text-lg: 1.25rem;
    --text-display: clamp(2.1rem, 3.6vw, 3.1rem);
    /* Space and shape */
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-5: 1.5rem;
    --space-6: 2rem;
    --gutter: clamp(1rem, 3vw, 2.5rem);
    --radius-1: 0.5rem;
    --radius-2: 1rem;
    --radius-pill: 999px;
    --target: 2.75rem;
    --topbar-h: 4rem;
    --column: clamp(19rem, 29vw, 25rem);
    /* Depth and glow */
    --elev-1: 0 10px 36px rgba(0, 0, 0, 0.38);
    --elev-2: 0 18px 60px rgba(0, 0, 0, 0.55);
    --glow-live: 0 0 14px rgba(255, 230, 190, 0.35);
    /* Motion */
    --dur-fast: 160ms;
    --dur-move: 450ms;
    --dur-calm: 600ms;
    --dur-fly: 950ms;
    --ease-calm: cubic-bezier(0.33, 0, 0.25, 1);
  }
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
     appear inside the lounge, as glowing students in their constellation. */
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
  /* The arrival film: the arrival's own galaxy, held for 30 seconds while the
     camera drifts slowly towards its core. Layers, back to front: the galaxy
     picture, a faint graded nebula cloud, a breathing glow on the core, grain,
     then a vignette that darkens the lower middle for the words. The layer is
     fixed to the viewport and every picture inside is cover-fitted, so there
     is never a box, a bar or page background around it. */
  #arrival-film {
    position: fixed;
    z-index: 20;
    inset: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    /* The film's palette: starlight for words and lines, midnight ink for
       shade under them, warm light for the core. */
    --film-starlight: 247, 241, 228;
    --film-ink: 3, 4, 14;
    --film-core: 255, 238, 214;
    --film-mono: 500 0.7rem ui-monospace, "SF Mono", Menlo, "Courier New", monospace;
    background: rgb(var(--film-ink));
    color: rgb(var(--film-starlight));
    /* Where the galaxy core lands on screen, for the drift and the glow. The
       core sits at 73% 28% of the picture; on wide screens the crop keeps it
       there, upper right. */
    --core-x: 73%;
    --core-y: 28%;
    --galaxy-position: 72% 30%;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity 600ms ease, visibility 0s linear 600ms;
  }
  /* On portrait screens a centred crop would show only empty dust, so the
     crop moves right until the core sits just right of centre, above the
     planet's horizon. */
  @media (max-aspect-ratio: 1/1) {
    #arrival-film { --galaxy-position: 80% 30%; --core-x: 56%; --core-y: 28%; }
  }
  body.filming #arrival-film {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
    transition: opacity 600ms ease, visibility 0s;
  }
  body.filming #arrival { visibility: hidden; opacity: 0; pointer-events: none; }
  .film-stage, .film-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .film-galaxy img, .film-cloud {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: var(--galaxy-position);
  }
  /* The camera: a slow push towards the core over the whole film. Starting
     at scale 1 means the first frame is exactly the arrival's picture. */
  .film-stage { transform-origin: var(--core-x) var(--core-y); will-change: transform; }
  body.filming .film-stage, body.film-leaving .film-stage { animation: film-drift 30s cubic-bezier(0.33, 0, 0.25, 1) both; }
  @keyframes film-drift {
    from { transform: scale(1); }
    to { transform: scale(1.16) translate(-0.8%, 0.6%); }
  }
  /* The film itself: the author's Luna AI video, full-screen and in front
     of the galaxy picture, played once over the 30 seconds with no sound.
     The picture shows only until the video is actually playing, so there is
     never a black frame while it downloads. */
  .film-cloud {
    opacity: 0;
    transition: opacity 1s ease;
  }
  .film-cloud.playing { opacity: 1; }
  /* Grain hides the upscaled source honestly, at a level that never reads as
     a pattern over the bright core. */
  .film-grain {
    opacity: 0.07;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Cpath fill='%23000000' fill-opacity='.62' d='M1 2h1v1H1zM7 1h1v1H7zM13 3h1v1h-1zM4 8h1v1H4zM16 7h1v1h-1zM10 11h1v1h-1zM2 14h1v1H2zM15 16h1v1h-1z'/%3E%3C/svg%3E");
  }
  /* Edges fall away, and the lower middle darkens just enough for the words:
     a gradient, never a box. */
  .film-vignette {
    background:
      linear-gradient(to top, rgba(var(--film-ink), 0.8) 0%, rgba(var(--film-ink), 0.45) 26%, transparent 50%),
      radial-gradient(ellipse 95% 85% at 50% 45%, transparent 55%, rgba(var(--film-ink), 0.5) 100%);
  }
  .film-copy {
    position: absolute;
    z-index: 1;
    left: 0;
    right: 0;
    bottom: clamp(5.5rem, 17vh, 10rem);
    padding: 0 1.5rem;
    text-align: center;
    text-shadow: 0 1px 2px rgba(var(--film-ink), 0.9), 0 2px 24px rgba(var(--film-ink), 0.85);
  }
  #film-line {
    min-height: 2.7em;
    max-width: 30rem;
    margin: 0 auto 1.4rem;
    display: grid;
    align-items: end;
    font: italic 400 clamp(1.15rem, 2.7vw, 1.6rem)/1.35 "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    letter-spacing: 0.005em;
    color: rgb(var(--film-starlight));
    opacity: 1;
    transition: opacity 600ms ease;
  }
  #film-line.fading { opacity: 0; }
  .film-progress { width: min(100%, 17rem); margin: 0 auto; }
  .film-progress-label {
    display: flex;
    justify-content: space-between;
    margin: 0 0 0.55rem;
    color: rgb(var(--film-starlight));
    font: var(--film-mono);
    letter-spacing: 0.24em;
    font-variant-numeric: tabular-nums;
  }
  .film-bar { height: 1px; background: rgba(var(--film-starlight), 0.22); overflow: hidden; }
  #film-bar-fill { display: block; width: 0; height: 100%; background: rgb(var(--film-starlight)); box-shadow: 0 0 8px rgba(var(--film-core), 0.7); transition: width 250ms linear; }
  /* Two small controls straight on the picture: no card behind them. */
  .film-pill {
    position: absolute;
    z-index: 2;
    min-height: 2rem;
    border: 1px solid rgba(var(--film-starlight), 0.4);
    border-radius: 999px;
    padding: 0.5rem 0.9rem;
    color: rgb(var(--film-starlight));
    background: rgba(var(--film-ink), 0.3);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    font: var(--film-mono);
    letter-spacing: 0.2em;
    cursor: pointer;
    transition: border-color 200ms ease, background 200ms ease, color 200ms ease;
  }
  .film-pill:hover { border-color: rgba(var(--film-starlight), 0.8); background: rgba(var(--film-ink), 0.5); }
  .film-pill:focus { outline: none; }
  .film-pill:focus-visible { outline: 1.5px solid rgba(var(--film-starlight), 0.9); outline-offset: 3px; }
  /* Fingers need bigger targets than a pointer does. */
  @media (pointer: coarse) {
    .film-pill { min-height: 2.75rem; padding: 0.75rem 1.1rem; }
  }
  #film-sound { top: max(1rem, env(safe-area-inset-top)); right: max(1rem, env(safe-area-inset-right)); }
  #film-skip { bottom: max(1rem, env(safe-area-inset-bottom)); right: max(1rem, env(safe-area-inset-right)); }
  body.entered #arrival { visibility: hidden; opacity: 0; pointer-events: none; }
  /* Replaying the arrival from the lounge: it becomes visible at once, so
     ENTER can take focus straight away, and still fades in. */
  body.replaying #arrival { transition: opacity 600ms ease, visibility 0s; }
  body:not(.entered) #sky-app { visibility: hidden; opacity: 0; transform: scale(0.985); }
  #sky-app { transition: opacity 600ms ease, transform 600ms ease; }
  body.entered #sky-app { visibility: visible; opacity: 1; transform: scale(1); }
  @media (prefers-reduced-motion: reduce) {
    #arrival { transition-duration: 150ms; }
    #sky-app { transition: opacity 150ms ease; transform: none; }
    body:not(.entered) #sky-app, body.entered #sky-app { transform: none; }
    .arrival-video { display: none; }
    .film-stage { animation: none !important; }
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
  /* ---- The lounge ----------------------------------------------------------
     One full-screen place: a top bar, the stage of real stars, the view's
     title over it, and one dock. Colours, type, spacing and timings all come
     from the tokens at the top of this stylesheet. */
  @property --atmos-a { syntax: "<color>"; inherits: true; initial-value: rgb(96 74 178 / 0.34); }
  @property --atmos-b { syntax: "<color>"; inherits: true; initial-value: rgb(46 72 150 / 0.3); }
  @property --atmos-c { syntax: "<color>"; inherits: true; initial-value: rgb(140 110 190 / 0.12); }
  #sky-app {
    position: fixed;
    inset: 0;
    z-index: 1;
    max-width: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
    text-align: left;
    color: var(--color-ink);
    font-family: var(--font-ui);
    -webkit-font-smoothing: antialiased;
  }
  #sky-app p { margin: 0; }
  #sky-app [hidden] { display: none !important; }
  #sky-app :focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }

  /* Atmosphere: soft clouds of colour over the blurred galaxy, and a
     vignette that keeps words readable. Gradients only: no point of light
     is ever decoration. Each view tints the clouds its own way. */
  .atmos {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    transition: --atmos-a 1.4s var(--ease-calm), --atmos-b 1.4s var(--ease-calm), --atmos-c 1.4s var(--ease-calm);
  }
  .atmos::before, .atmos::after { content: ""; position: absolute; }
  .atmos::before {
    inset: -12%;
    background:
      radial-gradient(ellipse 42% 36% at 70% 30%, var(--atmos-a), transparent 70%),
      radial-gradient(ellipse 38% 34% at 24% 70%, var(--atmos-b), transparent 70%),
      radial-gradient(ellipse 70% 55% at 50% 52%, var(--atmos-c), transparent 75%),
      linear-gradient(180deg, rgba(6, 9, 26, 0.5), rgba(4, 5, 16, 0.3) 55%, rgba(3, 4, 12, 0.6));
    animation: atmos-drift 140s ease-in-out infinite alternate;
  }
  .atmos::after {
    inset: 0;
    background:
      radial-gradient(ellipse 85% 75% at 50% 46%, transparent 55%, rgba(2, 3, 10, 0.62) 100%),
      linear-gradient(to top, rgba(2, 3, 10, 0.55), transparent 28%);
  }
  @keyframes atmos-drift {
    from { transform: translate3d(0, 0, 0) scale(1); }
    to { transform: translate3d(-2.5%, 1.5%, 0) scale(1.05); }
  }
  body[data-view="science"] .atmos { --atmos-a: rgb(52 112 170 / 0.34); --atmos-b: rgb(40 80 140 / 0.3); --atmos-c: rgb(90 160 200 / 0.1); }
  body[data-view="engineering"] .atmos { --atmos-a: rgb(70 92 160 / 0.36); --atmos-b: rgb(150 118 76 / 0.16); --atmos-c: rgb(90 110 170 / 0.12); }
  body[data-view="business"] .atmos { --atmos-a: rgb(84 70 150 / 0.36); --atmos-b: rgb(168 138 78 / 0.15); --atmos-c: rgb(110 90 170 / 0.12); }
  body[data-view="health"] .atmos { --atmos-a: rgb(50 120 126 / 0.3); --atmos-b: rgb(46 80 140 / 0.28); --atmos-c: rgb(110 170 160 / 0.1); }
  body[data-view="arts"] .atmos { --atmos-a: rgb(130 76 150 / 0.32); --atmos-b: rgb(80 60 150 / 0.28); --atmos-c: rgb(190 120 160 / 0.1); }

  /* ---- Top bar -------------------------------------------------------- */
  .topbar {
    position: absolute;
    z-index: 5;
    top: 0;
    left: 0;
    right: 0;
    box-sizing: border-box;
    height: var(--topbar-h);
    padding: env(safe-area-inset-top) var(--gutter) 0;
    display: flex;
    align-items: center;
    gap: var(--space-5);
    background: linear-gradient(to bottom, rgba(3, 4, 14, 0.88), rgba(3, 4, 14, 0.45) 72%, transparent);
  }
  .brand { display: flex; align-items: baseline; gap: var(--space-3); color: var(--color-ink); text-decoration: none; white-space: nowrap; min-height: var(--target); align-items: center; }
  .wordmark { font: 400 1.4rem/1 var(--font-display); letter-spacing: 0.01em; }
  .wordmark-sub { font: 500 var(--text-xs)/1 var(--font-mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-ink-muted); }
  .lounge-nav { flex: 1; min-width: 0; display: flex; justify-content: center; }
  .lounge-nav ul { display: flex; gap: var(--space-1); list-style: none; margin: 0; padding: 0; }
  .nav-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 2.5rem;
    padding: 0 var(--space-3);
    border-radius: var(--radius-pill);
    color: var(--color-ink-muted);
    text-decoration: none;
    font: 500 var(--text-sm)/1 var(--font-ui);
    white-space: nowrap;
    transition: color var(--dur-fast) var(--ease-calm), background var(--dur-fast) var(--ease-calm);
  }
  .nav-link:hover { color: var(--color-ink); background: rgba(244, 238, 226, 0.06); }
  .nav-link[aria-current="page"] { color: var(--color-ink); background: rgba(244, 238, 226, 0.1); box-shadow: inset 0 0 0 1px var(--color-line-strong); }
  /* Someone is studying in this constellation now: a small warm mark, and
     the link's accessible name says the count. */
  .nav-link[data-live]:not([data-live="0"])::after { content: ""; width: 0.35rem; height: 0.35rem; margin-left: 0.45rem; border-radius: 50%; background: var(--color-gold); box-shadow: var(--glow-live); }
  .tools { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
  .tool-button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--target);
    min-width: var(--target);
    box-sizing: border-box;
    padding: 0 var(--space-4);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-pill);
    background: rgba(10, 12, 30, 0.45);
    color: var(--color-ink-soft);
    font: 500 var(--text-sm)/1 var(--font-ui);
    cursor: pointer;
    transition: border-color var(--dur-fast) var(--ease-calm), color var(--dur-fast) var(--ease-calm);
  }
  .tool-button:hover { color: var(--color-ink); border-color: var(--color-line-strong); }
  .tool-button[aria-expanded="true"], .tool-button.is-playing { color: var(--color-gold); border-color: rgba(233, 196, 126, 0.55); }
  .tool-icon { width: 1.05rem; height: 1.05rem; fill: currentColor; }
  .about-link { color: var(--color-ink-muted); font-size: var(--text-sm); text-decoration: none; padding: var(--space-2); min-height: var(--target); display: inline-flex; align-items: center; }
  .about-link:hover { color: var(--color-ink); text-decoration: underline; }
  .about-link .tool-icon { display: none; }

  /* ---- The stage: real stars, full-screen ------------------------------
     Everything drawn here is clipped to the stage, so nothing on it can
     ever paint over the page. */
  #stage {
    position: absolute;
    z-index: 1;
    top: var(--topbar-h);
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    isolation: isolate;
    contain: paint;
    touch-action: none;
  }
  svg#sky { position: absolute; inset: 0; display: block; width: 100%; height: 100%; overflow: hidden; }
  #stage.placing { cursor: crosshair; }

  /* Constellation figures: faint lines and hollow diamonds, map decoration
     only, cool and thin so they never read as a person. */
  .figure { transition: opacity var(--dur-calm) var(--ease-calm); }
  .fig-edge { stroke: rgba(196, 200, 230, 0.14); stroke-width: 1.2; }
  .fig-node { fill: none; stroke: rgba(196, 200, 230, 0.32); stroke-width: 1.2; }
  .figure.is-room .fig-edge { stroke: rgba(196, 200, 230, 0.1); stroke-width: 1.4; }
  .figure.is-room .fig-node { stroke: rgba(196, 200, 230, 0.22); }

  /* Real stars. Core and halo are unit circles scaled here, so a star that
     goes quiet fades from glowing to recent rather than jumping. */
  .star { transition: transform var(--dur-move) var(--ease-calm), opacity var(--dur-calm) var(--ease-calm); }
  #stage.flying .star { transition-duration: var(--dur-fly), var(--dur-calm); }
  #stage.still .star, #stage.still .star *, .star.dragging { transition: none; }
  .star-core, .star-halo { transition: transform var(--dur-calm) var(--ease-calm), opacity var(--dur-calm) var(--ease-calm), fill var(--dur-calm) var(--ease-calm); }
  .star-halo { fill: url(#halo-warm); }
  .star.glowing .star-core { transform: scale(4.6); fill: var(--color-live); opacity: 1; }
  .star.glowing .star-halo { transform: scale(3); fill: url(#halo-live); opacity: 1; animation: star-breathe 6s ease-in-out infinite; }
  /* Only someone studying now has a halo: recent stars are plain, smaller
     points, so even many on one spot never read as a live person. */
  .star.recent .star-core { transform: scale(1.9); fill: var(--color-recent); opacity: 0.55; }
  .star.recent .star-halo { transform: scale(0); opacity: 0; }
  .star.trace .star-core { transform: scale(1.1); fill: var(--color-trace); opacity: 0.24; }
  .star.trace .star-halo { transform: scale(0); opacity: 0; }
  .star-sparkle { fill: rgba(255, 248, 232, 0.42); }
  .star.away { opacity: 0; pointer-events: none; }
  #stage.hide-traces .star.trace:not(.own) { opacity: 0; pointer-events: none; }
  .star.own { cursor: grab; }
  .star.own.dragging { cursor: grabbing; }
  .star-ring { fill: none; stroke: var(--color-gold); stroke-width: 1.6; }
  .star-you { fill: var(--color-gold); font: 600 15px var(--font-mono); letter-spacing: 1.5px; }
  .star.own.picked .star-ring { stroke-dasharray: 4 3; }
  #sky-app .star:focus, #sky-app .star:focus-visible { outline: none; }
  .star:focus-visible .star-ring { stroke: #ffffff; stroke-width: 2.6; }
  .star.arrived .star-core { animation: star-arrive 1.6s var(--ease-calm); }
  @keyframes star-breathe {
    0%, 100% { opacity: 0.62; }
    50% { opacity: 1; }
  }
  @keyframes star-arrive {
    from { opacity: 0.1; }
    to { opacity: 1; }
  }

  /* Doorways: in the Common Room each constellation is a soft area and a
     labelled link into its own view. The area itself never takes a click,
     so stars inside it can still be dragged. */
  #regions { position: absolute; inset: 0; pointer-events: none; transition: opacity var(--dur-calm) var(--ease-calm), visibility 0s; }
  #stage:not([data-view="common"]) #regions { opacity: 0; visibility: hidden; transition: opacity var(--dur-fast) var(--ease-calm), visibility 0s linear var(--dur-fast); }
  .region-area { position: absolute; border-radius: 50%; background: radial-gradient(closest-side, rgba(150, 140, 220, 0.09), transparent); }
  a.region {
    position: absolute;
    pointer-events: auto;
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.2rem;
    min-height: var(--target);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-1);
    color: var(--color-ink-soft);
    text-decoration: none;
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(2, 3, 10, 0.95), 0 0 12px rgba(2, 3, 10, 0.9);
    transition: background var(--dur-fast) var(--ease-calm), color var(--dur-fast) var(--ease-calm);
  }
  a.region:hover, a.region:focus-visible { color: var(--color-ink); background: rgba(10, 12, 30, 0.6); }
  .region-name { font: 600 var(--text-xs)/1 var(--font-mono); letter-spacing: 0.16em; text-transform: uppercase; }
  .region-name::after { content: " →"; opacity: 0; transition: opacity var(--dur-fast) var(--ease-calm); }
  a.region:hover .region-name::after, a.region:focus-visible .region-name::after { opacity: 1; }
  .region-live { font: 500 var(--text-xs)/1 var(--font-ui); color: var(--color-ink-muted); }
  a.region[data-live]:not([data-live="0"]) .region-live { color: var(--color-gold); }
  a.region.is-yours .region-name { color: var(--color-gold); }

  /* ---- The view's title, over the stage --------------------------------
     Words sit straight on the picture with a soft shade behind them, never
     in a box. The title never takes clicks, so stars under it still can. */
  .hero {
    position: absolute;
    z-index: 3;
    top: calc(var(--topbar-h) + var(--space-6));
    left: var(--gutter);
    width: var(--column);
    pointer-events: none;
  }
  .hero::before { content: ""; position: absolute; z-index: -1; inset: -5rem -7rem -3.5rem -5rem; background: radial-gradient(ellipse 60% 60% at 35% 45%, rgba(3, 4, 14, 0.7), transparent 72%); }
  .hero a, .hero button { pointer-events: auto; }
  .view-kicker { margin: 0 0 var(--space-2) !important; color: var(--color-ink-muted); font: 600 var(--text-xs)/1 var(--font-mono); letter-spacing: 0.18em; text-transform: uppercase; }
  #sky-app h1 { margin: 0; color: var(--color-ink); font: 400 var(--text-display)/1.04 var(--font-display); letter-spacing: -0.01em; text-wrap: balance; }
  #view-line { margin-top: var(--space-3) !important; color: var(--color-ink-soft); font-size: var(--text-md); line-height: 1.5; }
  #live-line { margin-top: var(--space-4) !important; display: flex; align-items: center; gap: var(--space-2); color: var(--color-ink); font: 500 var(--text-sm)/1.3 var(--font-ui); }
  #live-line::before { content: ""; flex: none; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--color-live); box-shadow: var(--glow-live); }
  #live-line[data-quiet]::before { background: transparent; box-shadow: inset 0 0 0 1px var(--color-ink-muted); }
  .back-link { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--target); margin: 0 0 var(--space-2) calc(-1 * var(--space-2)); padding: 0 var(--space-2); border-radius: var(--radius-1); color: var(--color-ink-soft); font: 500 var(--text-sm)/1 var(--font-ui); text-decoration: none; }
  .back-link:hover { color: var(--color-ink); background: rgba(244, 238, 226, 0.06); }

  /* ---- The dock: your star, the one action, and the legend ------------- */
  .dock {
    position: absolute;
    z-index: 4;
    left: var(--gutter);
    bottom: max(var(--space-5), env(safe-area-inset-bottom));
    box-sizing: border-box;
    width: var(--column);
    padding: var(--space-4) var(--space-5) var(--space-3);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-2);
    background: var(--color-surface);
    -webkit-backdrop-filter: blur(16px) saturate(1.15);
    backdrop-filter: blur(16px) saturate(1.15);
    box-shadow: var(--elev-1);
  }
  .dock-row { display: grid; gap: var(--space-3); }
  .dock-you { display: grid; gap: 0.2rem; min-width: 0; }
  #you-status { display: flex; align-items: center; gap: var(--space-2); color: var(--color-gold); font: 600 var(--text-xs)/1.2 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; }
  #you-status::before { content: ""; width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--color-gold); box-shadow: 0 0 10px rgba(233, 196, 126, 0.5); }
  #where { color: var(--color-ink); font: 400 var(--text-lg)/1.25 var(--font-display); }
  #dock-note { color: var(--color-ink-muted); font-size: var(--text-sm); line-height: 1.45; }
  #since { color: var(--color-ink-muted); font-size: var(--text-xs); }
  .dock-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  /* Announcements sit at the top of the star field, clear of the title
     column and the dock, so they never cover the live line. */
  #status {
    position: absolute;
    z-index: 4;
    top: calc(var(--topbar-h) + var(--space-2));
    left: calc(var(--gutter) + var(--column) + var(--space-5));
    right: var(--gutter);
    text-align: center;
    color: var(--color-ink-soft);
    font-size: var(--text-sm);
    text-shadow: 0 1px 12px rgba(2, 3, 10, 0.9);
    opacity: 0;
    transition: opacity var(--dur-calm) var(--ease-calm);
    pointer-events: none;
  }
  #status.visible { opacity: 1; }
  #status.error { color: #f1c5c5; }

  /* A quiet, compact step: chosen once, changed rarely, never a modal or a
     full-screen gate over the star field. */
  .callsign-panel { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-line); }
  #callsign-current { margin: 0; color: var(--color-ink-muted); font-size: var(--text-sm); }
  #callsign-current strong { color: var(--color-ink); font-weight: 600; }
  .link-button { padding: 0; border: 0; background: none; color: var(--color-gold); font: inherit; text-decoration: underline; cursor: pointer; }
  .link-button:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  .callsign-hint { margin: 0.2rem 0 0; color: var(--color-ink-muted); font-size: var(--text-xs); line-height: 1.4; }
  #callsign-form label { display: block; margin-top: var(--space-2); color: var(--color-ink); font: 600 var(--text-sm)/1.2 var(--font-ui); }
  .callsign-row { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
  #callsign-input {
    flex: 1 1 10rem;
    min-height: var(--target);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-1);
    background: rgba(244, 238, 226, 0.03);
    color: var(--color-ink);
    font: inherit;
  }
  #callsign-input:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  #callsign-error { margin: var(--space-2) 0 0; color: #f1c5c5; font-size: var(--text-xs); min-height: 1em; }
  #callsign-error:empty { display: none; }

  /* One primary button style, shared with the arrival's, refined for the
     lounge: sentence case in the UI face, never the browser default. */
  #sky-app .lounge-button {
    min-height: var(--target);
    padding: 0 var(--space-5);
    border: 1px solid var(--color-ink);
    border-radius: var(--radius-pill);
    background: var(--color-ink);
    color: #070814;
    box-shadow: var(--glow-live);
    font: 600 var(--text-sm)/1 var(--font-ui);
    letter-spacing: 0.01em;
    text-transform: none;
    transition: background var(--dur-fast) var(--ease-calm), box-shadow var(--dur-fast) var(--ease-calm);
  }
  #sky-app .lounge-button:hover { background: #ffffff; }
  #sky-app .lounge-button:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  .quiet-button, .chip-button {
    min-height: var(--target);
    padding: 0 var(--space-4);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-ink-soft);
    font: 500 var(--text-sm)/1 var(--font-ui);
    cursor: pointer;
    transition: color var(--dur-fast) var(--ease-calm), border-color var(--dur-fast) var(--ease-calm);
  }
  .quiet-button:hover, .chip-button:hover { color: var(--color-ink); border-color: var(--color-ink-soft); }
  .quiet-button:focus-visible, .chip-button:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }

  /* The legend says what the light means in words, beside a small sample of
     each kind of star, so colour is never the only cue. */
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); margin: var(--space-3) 0 0; padding: var(--space-3) 0 0; border-top: 1px solid var(--color-line); list-style: none; color: var(--color-ink-muted); font-size: var(--text-xs); }
  .legend li { display: inline-flex; align-items: center; gap: var(--space-2); }
  .swatch { display: inline-block; width: 0.75rem; height: 0.75rem; border-radius: 50%; position: relative; }
  .swatch-live { background: radial-gradient(circle, var(--color-live) 0 28%, rgba(255, 226, 176, 0.32) 30%, transparent 70%); }
  .swatch-recent { background: radial-gradient(circle, rgba(232, 220, 198, 0.75) 0 22%, transparent 26%); }
  .swatch-trace { background: radial-gradient(circle, rgba(156, 157, 180, 0.6) 0 12%, transparent 16%); }
  .swatch-you { box-shadow: inset 0 0 0 1.5px var(--color-gold); }
  .legend-toggle { flex-basis: 100%; }
  .chip-button { min-height: 2.25rem; padding: 0 var(--space-3); font-size: var(--text-xs); }
  .chip-button[aria-pressed="true"]::before { content: "✓ "; }
  @media (pointer: coarse) and (min-width: 761px) { .chip-button { min-height: var(--target); } }

  /* ---- Chat ----------------------------------------------------------
     A quiet conversation drawer, never a social feed: small on purpose,
     never covering the star field, text only. */
  .chat-panel {
    position: absolute;
    z-index: 6;
    top: calc(var(--topbar-h) + var(--space-2));
    right: var(--gutter);
    box-sizing: border-box;
    width: min(23rem, calc(100% - 2 * var(--gutter)));
    max-height: calc(100% - var(--topbar-h) - var(--space-6));
    display: flex;
    flex-direction: column;
    padding: var(--space-4) var(--space-5) var(--space-5);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-2);
    background: var(--color-surface-strong);
    -webkit-backdrop-filter: blur(20px) saturate(1.15);
    backdrop-filter: blur(20px) saturate(1.15);
    box-shadow: var(--elev-2);
  }
  .chat-head { display: flex; align-items: center; justify-content: space-between; }
  #chat-title { margin: 0; font: 400 var(--text-lg)/1.2 var(--font-display); color: var(--color-ink); }
  .chat-intro { margin-top: var(--space-1) !important; color: var(--color-ink-muted); font-size: var(--text-xs); line-height: 1.4; }
  .chat-messages {
    flex: 1;
    min-height: 6rem;
    max-height: 18rem;
    margin: var(--space-3) 0 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .chat-message { display: grid; gap: 0.1rem; }
  .chat-message-head { display: flex; align-items: baseline; gap: var(--space-2); }
  .chat-message-callsign { color: var(--color-gold); font: 600 var(--text-xs)/1.2 var(--font-mono); letter-spacing: 0.02em; }
  .chat-message-time { color: var(--color-ink-soft); font-size: var(--text-xs); }
  .chat-message-body { color: var(--color-ink); font-size: var(--text-sm); line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  /* Own messages are distinguished by a left rule, not colour alone. */
  .chat-message[data-own="true"] { border-left: 2px solid var(--color-gold); padding-left: var(--space-2); }
  .chat-form { display: flex; gap: var(--space-2); margin-top: var(--space-3); align-items: flex-end; }
  #chat-input {
    flex: 1;
    min-height: var(--target);
    max-height: 6rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-line-strong);
    border-radius: var(--radius-1);
    background: rgba(244, 238, 226, 0.03);
    color: var(--color-ink);
    font: inherit;
    resize: none;
  }
  #chat-input:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  #chat-input:disabled { opacity: 0.5; }
  .chat-note { margin-top: var(--space-2) !important; color: var(--color-ink-muted); font-size: var(--text-xs); }
  #chat-note:empty { display: none; }
  #chat-error { margin-top: var(--space-2) !important; color: #f1c5c5; font-size: var(--text-xs); min-height: 1em; }
  #chat-error:empty { display: none; }
  .chat-credit { margin-top: var(--space-3) !important; color: var(--color-ink-muted); font-size: var(--text-xs); line-height: 1.4; }

  /* ---- Break -------------------------------------------------------------
     A compact drawer for a short break, not another page. */
  .break-panel {
    position: absolute;
    z-index: 6;
    top: calc(var(--topbar-h) + var(--space-2));
    right: var(--gutter);
    box-sizing: border-box;
    width: min(23rem, calc(100% - 2 * var(--gutter)));
    max-height: calc(100% - var(--topbar-h) - var(--space-6));
    overflow: auto;
    padding: var(--space-4) var(--space-5) var(--space-5);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-2);
    background: var(--color-surface-strong);
    -webkit-backdrop-filter: blur(20px) saturate(1.15);
    backdrop-filter: blur(20px) saturate(1.15);
    box-shadow: var(--elev-2);
  }
  .break-head { display: flex; align-items: center; justify-content: space-between; }
  #break-title { margin: 0; font: 400 var(--text-lg)/1.2 var(--font-display); color: var(--color-ink); }
  .icon-close { width: var(--target); height: var(--target); margin-right: calc(-1 * var(--space-2)); border: 0; border-radius: 50%; background: transparent; color: var(--color-ink-soft); font-size: 1.4rem; line-height: 1; cursor: pointer; }
  .icon-close:hover { color: var(--color-ink); background: rgba(244, 238, 226, 0.08); }
  .break-intro { margin-top: var(--space-1) !important; color: var(--color-ink-muted); font-size: var(--text-sm); line-height: 1.45; }
  .break-listening { margin-top: var(--space-3) !important; color: var(--color-gold); font: 600 var(--text-xs)/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; }
  .break-modes { list-style: none; margin: var(--space-4) 0 0; padding: 0; display: grid; gap: var(--space-2); }
  .break-mode {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.15rem var(--space-3);
    width: 100%;
    min-height: var(--target);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-1);
    background: rgba(244, 238, 226, 0.03);
    color: var(--color-ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color var(--dur-fast) var(--ease-calm), background var(--dur-fast) var(--ease-calm);
  }
  .break-mode:hover { border-color: var(--color-line-strong); background: rgba(244, 238, 226, 0.06); }
  .break-mode[aria-pressed="true"] { border-color: rgba(233, 196, 126, 0.6); background: rgba(233, 196, 126, 0.07); }
  .break-mode-name { font: 600 var(--text-sm)/1.2 var(--font-ui); }
  .break-mode-line { grid-column: 1; color: var(--color-ink-muted); font-size: var(--text-xs); line-height: 1.35; }
  .break-mode-state { grid-column: 2; grid-row: 1; color: var(--color-gold); font: 600 var(--text-xs)/1.2 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase; }
  .break-mode-count { grid-column: 2; grid-row: 2; color: var(--color-ink-soft); font-size: var(--text-xs); text-align: right; }
  .break-controls { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-4); }
  .play-icon { display: inline-block; width: 0; height: 0; margin-right: var(--space-2); border-style: solid; border-width: 0.36rem 0 0.36rem 0.6rem; border-color: transparent transparent transparent currentColor; vertical-align: -0.05rem; }
  #break-play[aria-pressed="true"] .play-icon { width: 0.55rem; height: 0.7rem; border: 0; border-left: 0.18rem solid currentColor; border-right: 0.18rem solid currentColor; box-sizing: border-box; }
  #break-play[aria-pressed="true"] { background: var(--color-gold); border-color: var(--color-gold); }
  #break-mute[aria-pressed="true"] { color: var(--color-gold); border-color: rgba(233, 196, 126, 0.6); }
  .break-volume { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-4); color: var(--color-ink-soft); font-size: var(--text-sm); }
  .break-volume input { flex: 1; min-height: var(--target); accent-color: var(--color-gold); }
  #break-now { margin-top: var(--space-2) !important; color: var(--color-ink); font-size: var(--text-sm); }
  .break-credit { margin-top: var(--space-3) !important; color: var(--color-ink-muted); font-size: var(--text-xs); line-height: 1.45; }

  /* ---- A top bar in two rows ----------------------------------------
     One row holds the wordmark, all six views and the tools only from
     1440px. Below that the wordmark and tools share the first row and the
     views get a second, scrolling sideways when they do not fit, so none is
     ever hidden or overlapped. The replay control drops its words there and
     is named by its aria-label. */
  @media (max-width: 1439px), (max-aspect-ratio: 1/1) {
    #sky-app { --topbar-h: 6.25rem; }
    .topbar { flex-wrap: wrap; align-content: center; row-gap: 0; column-gap: var(--space-3); }
    .lounge-nav { order: 3; flex: 1 0 100%; justify-content: flex-start; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * var(--gutter)); padding: 0 var(--gutter); }
    .lounge-nav::-webkit-scrollbar { display: none; }
    .tools { order: 2; }
    #replay-arrival { padding: 0; justify-content: center; }
    #replay-arrival .tool-label { display: none; }
  }
  /* The second row costs the title its space above, so on wide but not
     very wide screens the title moves up to the bar. */
  @media (min-width: 961px) and (max-width: 1439px) and (min-aspect-ratio: 1/1) {
    #sky-app .hero { top: calc(var(--topbar-h) + var(--space-2)); }
  }
  /* On short laptop screens the title and the dock both tighten, so the
     live line is never hidden behind the dock. The privacy hint stays; the
     date the star was first placed gives way. */
  @media (min-width: 961px) and (max-height: 860px) and (min-aspect-ratio: 1/1) {
    #sky-app { --text-display: clamp(1.9rem, 3vw, 2.6rem); }
    #view-line { margin-top: var(--space-2) !important; font-size: var(--text-sm); }
    #live-line { margin-top: var(--space-2) !important; }
    .dock { padding: var(--space-3) var(--space-4) var(--space-2); }
    .dock-row { gap: var(--space-2); }
    .legend { margin-top: var(--space-2); padding-top: var(--space-2); }
    #since { display: none; }
  }

  /* ---- Narrow and portrait screens ------------------------------------
     The title sits on top and the dock becomes a bottom sheet. */
  @media (max-width: 960px), (max-aspect-ratio: 1/1) {
    /* The title spans the screen here, so announcements sit in the field
       below it rather than beside it. */
    #status { top: 38%; left: var(--gutter); right: var(--gutter); }
    .hero { top: calc(var(--topbar-h) + var(--space-4)); width: min(34rem, calc(100% - 2 * var(--gutter))); }
    .dock { left: 0; right: 0; bottom: 0; width: auto; border-width: 1px 0 0; border-radius: var(--radius-2) var(--radius-2) 0 0; padding: var(--space-3) var(--gutter) calc(var(--space-3) + env(safe-area-inset-bottom)); }
    .dock-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2) var(--space-4); }
    .dock-you { flex: 1 1 15rem; }
    .legend-toggle { flex-basis: auto; margin-left: auto; }
    .break-panel, .chat-panel { top: auto; bottom: 0; left: 0; right: 0; width: auto; max-height: 82%; border-radius: var(--radius-2) var(--radius-2) 0 0; padding-bottom: calc(var(--space-5) + env(safe-area-inset-bottom)); }
  }
  @media (max-width: 760px) {
    #sky-app { --gutter: 1rem; --text-display: 1.85rem; --topbar-h: 6rem; }
    .wordmark { font-size: 1.25rem; }
    .wordmark-sub { font-size: 0.6875rem; letter-spacing: 0.1em; }
    .legend-toggle { margin-left: 0; }
    .chip-button { min-height: 2.25rem; }
    .tool-label, .about-label { display: none; }
    .tool-button { padding: 0; justify-content: center; }
    /* About stays reachable on a phone, as an icon among the tools. */
    .about-link { justify-content: center; min-width: var(--target); padding: 0; border: 1px solid var(--color-line); border-radius: var(--radius-pill); background: rgba(10, 12, 30, 0.45); color: var(--color-ink-soft); }
    .about-link .tool-icon { display: block; }
    /* The wordmark and the three tools must share one row, so the tagline,
       which only repeats the arrival's, gives way. */
    .wordmark-sub { display: none; }
    .tools { gap: var(--space-1); }
    .hero { top: calc(var(--topbar-h) + var(--space-3)); }
    #view-line { font-size: var(--text-sm); margin-top: var(--space-2) !important; }
    #live-line { margin-top: var(--space-2) !important; font-size: var(--text-xs); }
    #where { font-size: var(--text-md); }
    .dock-actions { width: 100%; }
    .dock-actions > * { flex: 1 1 auto; }
    .legend { gap: var(--space-1) var(--space-3); margin-top: var(--space-2); padding-top: var(--space-2); }
  }
  @media (max-height: 560px) and (orientation: landscape) {
    .legend { display: none; }
    #dock-note { display: none; }
  }
</style>
</head>
<body data-view="common" data-has-star="${ownStar ? "true" : "false"}" data-own-star="${ownStar ? escapeAttr(ownStar.id) : ""}" data-constellation="${ownArea ?? ""}" data-has-callsign="${ownCallsign ? "true" : "false"}" data-callsign="${ownCallsign ? escapeAttr(ownCallsign) : ""}" data-regions="${escapeAttr(JSON.stringify(REGIONS))}" data-constellations="${escapeAttr(JSON.stringify(info))}" data-insets="${escapeAttr(JSON.stringify(INSETS))}">
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
  <div class="film-stage" aria-hidden="true">
    <picture class="film-layer film-galaxy">
      <source type="image/webp" srcset="/assets/arrival-galaxy-960.webp 960w, /assets/arrival-galaxy-1920.webp 1920w" sizes="100vw">
      <img src="/assets/arrival-galaxy-v3.png" alt="" decoding="async">
    </picture>
  </div>
  <video class="film-layer film-cloud" muted playsinline preload="none" aria-hidden="true" disablepictureinpicture disableremoteplayback>
    <source data-src="/assets/arrival-film-1080.webm" type="video/webm">
    <source data-src="/assets/arrival-film-1080.mp4" type="video/mp4">
  </video>
  <div class="film-layer film-grain" aria-hidden="true"></div>
  <div class="film-layer film-vignette" aria-hidden="true"></div>
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
  <div class="atmos" aria-hidden="true"></div>
  <header class="topbar">
    <a class="brand" href="#" data-view="common"><span class="wordmark">Overlap</span><span class="wordmark-sub">anonymous study lounge</span></a>
    <nav class="lounge-nav" aria-label="Lounge views">
      <ul>
        ${navLinks}
      </ul>
    </nav>
    <div class="tools">
      <button type="button" id="chat-toggle" class="tool-button" aria-expanded="false" aria-controls="chat-panel" aria-label="Common Room conversation">
        <svg class="tool-icon" viewBox="0 0 240 240" aria-hidden="true" focusable="false"><path d="M30 60a20 20 0 0 1 20-20h140a20 20 0 0 1 20 20v90a20 20 0 0 1-20 20H110l-45 35v-35H50a20 20 0 0 1-20-20z"></path></svg>
        <span class="tool-label">Chat</span>
      </button>
      <button type="button" id="break-toggle" class="tool-button" aria-expanded="false" aria-controls="break-panel" aria-label="Break: music for a short break">
        <svg class="tool-icon" viewBox="0 0 240 240" aria-hidden="true" focusable="false"><path d="M96 44v112a28 28 0 1 1-16-25V70l112-26v96a28 28 0 1 1-16-25V64z"></path></svg>
        <span class="tool-label">Break</span>
      </button>
      <button type="button" id="replay-arrival" class="tool-button" aria-label="Replay arrival experience">
        <svg class="tool-icon" viewBox="0 0 240 240" aria-hidden="true" focusable="false"><path d="M120 40a80 80 0 1 1-75.4 53.3l22.6 8A56 56 0 1 0 120 64v28L72 52l48-40z"></path></svg>
        <span class="tool-label">Replay arrival</span>
      </button>
      <a class="about-link" href="/readme/" aria-label="About Overlap"><svg class="tool-icon" viewBox="0 0 240 240" aria-hidden="true" focusable="false"><path d="M120 24a96 96 0 1 1 0 192 96 96 0 0 1 0-192zm0 24a72 72 0 1 0 0 144 72 72 0 0 0 0-144zm-12 60h24v64h-24zm12-40a14 14 0 1 1 0 28 14 14 0 0 1 0-28z"></path></svg><span class="about-label">About</span></a>
    </div>
  </header>

  <div id="stage" class="still" data-view="common">
    <svg id="sky" viewBox="0 0 ${FIRST_PAINT_WIDTH} ${FRAME_HEIGHT}" preserveAspectRatio="xMidYMid slice" role="group" aria-label="The Common Room. Every point of light is a real visitor's star: bright points are studying now, faint points are past traces.">
      <defs>
        <radialGradient id="halo-warm"><stop offset="0" stop-color="#ffe9c4" stop-opacity="0.5"/><stop offset="0.45" stop-color="#ffd9a0" stop-opacity="0.12"/><stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/></radialGradient>
        <radialGradient id="halo-live"><stop offset="0" stop-color="#fff4dc" stop-opacity="0.8"/><stop offset="0.3" stop-color="#ffe2b0" stop-opacity="0.26"/><stop offset="1" stop-color="#cfe2ff" stop-opacity="0"/></radialGradient>
      </defs>
      <g id="figures" aria-hidden="true">${CONSTELLATIONS.map((id) => renderFigure(id)).join("")}</g>
      <g id="stars">${starMarkup}</g>
    </svg>
    <div id="regions">
      ${CONSTELLATIONS.map((id) => renderDoorway(id, liveIn(id), traces.byConstellation[id])).join("\n      ")}
    </div>
  </div>

  <section class="hero" aria-labelledby="view-title">
    <a id="back-common" class="back-link" href="#" data-view="common" hidden><span aria-hidden="true">←</span> Common Room</a>
    <p id="view-kicker" class="view-kicker">The Lounge</p>
    <h1 id="view-title">The Common Room</h1>
    <p id="view-line">${COMMON_LINE}</p>
    <p id="live-line" role="status" aria-atomic="true"${glowingTotal ? "" : ` data-quiet=""`}>${liveLine}</p>
  </section>

  <div id="status" role="status" aria-live="polite"></div>

  <section class="dock" aria-label="Your star">
    <div class="dock-row">
      <div class="dock-you">
        <p id="you-status"${ownStar ? "" : " hidden"}>${ownGlowing ? "Your star is glowing" : "Your star is connecting"}</p>
        <p id="where">${escapeHtml(whereText)}</p>
        <p id="dock-note">${noteText}</p>
        ${sinceText}
      </div>
      <div class="dock-actions">
        <button type="button" id="place-star" class="lounge-button"${ownStar ? " hidden" : ""}>Place your star</button>
        <button type="button" id="settle-action" class="lounge-button" hidden></button>
        <button type="button" id="leave-area" class="quiet-button" hidden></button>
      </div>
    </div>
    <div id="callsign-panel" class="callsign-panel">
      <p id="callsign-current"${ownCallsign ? "" : " hidden"}>You are <strong id="callsign-current-name">${ownCallsign ? escapeHtml(ownCallsign) : ""}</strong>. <button type="button" id="callsign-change" class="link-button">Change</button></p>
      <form id="callsign-form"${ownCallsign ? " hidden" : ""}>
        <label for="callsign-input">Choose your callsign</label>
        <p class="callsign-hint">This is how your messages will appear. No account or profile is created. Please do not use your real name.</p>
        <div class="callsign-row">
          <input type="text" id="callsign-input" name="callsign" minlength="3" maxlength="16" autocomplete="off" placeholder="nightowl" value="${ownCallsign ? escapeAttr(ownCallsign) : ""}">
          <button type="submit" class="lounge-button">Enter the Lounge</button>
          <button type="button" id="callsign-cancel" class="quiet-button"${ownCallsign ? "" : " hidden"}>Cancel</button>
        </div>
        <p id="callsign-error" role="alert" aria-live="assertive"></p>
      </form>
    </div>
    <ul class="legend" aria-label="What the light means">
      <li data-legend="live"><span class="swatch swatch-live" aria-hidden="true"></span>Studying now</li>
      <li data-legend="recent"><span class="swatch swatch-recent" aria-hidden="true"></span>Recent</li>
      <li data-legend="trace"><span class="swatch swatch-trace" aria-hidden="true"></span>Past trace</li>
      <li data-legend="you"><span class="swatch swatch-you" aria-hidden="true"></span>You</li>
      <li class="legend-toggle"><button type="button" id="traces-toggle" class="chip-button" aria-pressed="true">Past traces</button></li>
    </ul>
  </section>

  <section id="chat-panel" class="chat-panel" aria-labelledby="chat-title" hidden>
    <div class="chat-head">
      <h2 id="chat-title">Common Room conversation</h2>
      <button type="button" id="chat-close" class="icon-close" aria-label="Close the conversation"><span aria-hidden="true">×</span></button>
    </div>
    <p class="chat-intro">Messages disappear after 24 hours.</p>
    <ul id="chat-messages" class="chat-messages" aria-live="polite" aria-label="Messages"></ul>
    <form id="chat-form" class="chat-form">
      <label for="chat-input" class="sr-only">Message</label>
      <textarea id="chat-input" maxlength="280" rows="2" placeholder="Say something quiet" disabled></textarea>
      <button type="submit" class="lounge-button" disabled>Send</button>
    </form>
    <p id="chat-note" class="chat-note">Choose a callsign to send a message.</p>
    <p id="chat-error" role="alert" aria-live="assertive"></p>
    <p class="chat-credit">Keep it kind. Do not share personal information.</p>
  </section>

  <section id="break-panel" class="break-panel" aria-labelledby="break-title" hidden>
    <div class="break-head">
      <h2 id="break-title">Break</h2>
      <button type="button" id="break-close" class="icon-close" aria-label="Close Break"><span aria-hidden="true">×</span></button>
    </div>
    <p class="break-intro">Music for a short break. Nothing plays until you press Play.</p>
    <p id="break-listening-total" class="break-listening" hidden></p>
    <ul class="break-modes">
          ${breakModes}
    </ul>
    <div class="break-controls">
      <button type="button" id="break-play" class="lounge-button" aria-pressed="false"><span class="play-icon" aria-hidden="true"></span>Play</button>
      <button type="button" id="break-stop" class="quiet-button">Stop</button>
      <button type="button" id="break-mute" class="quiet-button" aria-pressed="false">Mute</button>
    </div>
    <label class="break-volume"><span>Volume</span><input id="break-volume" type="range" min="0" max="100" value="70"></label>
    <p id="break-now" role="status" aria-live="polite">Nothing playing</p>
    <p class="break-credit">Tracks supplied by the project owner. Each visitor plays their own copy; playback is not shared.</p>
    <audio id="break-audio" preload="none" loop></audio>
  </section>
</main>
<script src="/sky.js" defer></script>
</body>
</html>`;
}
