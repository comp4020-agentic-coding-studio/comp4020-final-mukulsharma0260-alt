// The README page at /readme/: README.md rendered in full on the server,
// in the lounge's night palette. README.md stays the only source of its
// words; this file adds a frame (header, contents, footer) and styling, never
// a second copy of the argument. Everything is readable with JavaScript off;
// the only script marks the section in view in the contents list.
//
// It is a page to read, separate from the About teleprompter: no cookie is
// read or set, nothing is logged, and it loads neither sky.js nor the stream.
import { readFileSync } from "node:fs";
import { renderMarkdownDocument } from "./markdown.ts";

// The documentation artwork, served from an explicit allowlist rather than a
// directory. README.md links them as docs/assets/<name>.svg, which GitHub
// resolves from the repo root and a browser on /readme/ resolves to
// /readme/docs/assets/<name>.svg, so one relative path works in both places.
const DOC_ASSET_NAMES = [
  "overlap-banner.svg",
  "overlap-footer.svg",
  "process-banner.svg",
  "process-timeline.svg",
  "badge-node.svg",
  "badge-sqlite.svg",
  "badge-sse.svg",
  "badge-js.svg",
  "badge-fly.svg",
  "badge-adr.svg",
] as const;

export const DOC_ASSETS: ReadonlyMap<string, Buffer> = new Map(
  DOC_ASSET_NAMES.map((name) => [`/readme/docs/assets/${name}`, readFileSync(new URL(`../docs/assets/${name}`, import.meta.url))]),
);

// An SVG opened on its own is a document; this keeps it from running script
// or loading anything, whatever it contains.
export const DOC_ASSET_HEADERS = {
  "Content-Type": "image/svg+xml",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "Cache-Control": "public, max-age=3600",
};

const REPO = "https://github.com/comp4020-agentic-coding-studio/comp4020-final-mukulsharma0260-alt";

const STYLE = `
  :root {
    color-scheme: dark;
    --navy: #0b1020; --navy-2: #11152b; --surface: #141933; --raised: #1a2042;
    --line: rgba(232, 234, 243, 0.12); --line-strong: rgba(167, 139, 250, 0.38);
    --ink: #e8eaf3; --ink-soft: #c9cbe0; --muted: #a3a6c2;
    --indigo: #6366f1; --violet: #a78bfa; --violet-soft: rgba(167, 139, 250, 0.12); --gold: #f5d58a;
    --font-display: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    --font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    --column: 46rem; --rail: 13rem; --gutter: clamp(1rem, 4vw, 2.5rem);
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      color-scheme: light;
      --navy: #f6f5fb; --navy-2: #eeecf8; --surface: #ffffff; --raised: #f3f1fb;
      --line: rgba(33, 28, 66, 0.12); --line-strong: rgba(99, 102, 241, 0.35);
      --ink: #1b1834; --ink-soft: #35304f; --muted: #5d5a75;
      --indigo: #4f46e5; --violet: #6d4fc8; --violet-soft: rgba(109, 79, 200, 0.09); --gold: #8a5a00;
    }
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; scroll-padding-top: 1.5rem; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  body {
    margin: 0; color: var(--ink); background: var(--navy);
    background-image: radial-gradient(60rem 30rem at 85% -10%, rgba(99, 102, 241, 0.18), transparent 70%),
      radial-gradient(40rem 24rem at -10% 20%, rgba(167, 139, 250, 0.08), transparent 70%);
    background-attachment: fixed;
    font: 1.0625rem/1.65 var(--font-ui);
    -webkit-text-size-adjust: 100%;
  }
  a { color: var(--violet); text-underline-offset: 0.18em; text-decoration-thickness: 1px; }
  a:hover { color: var(--ink); }
  :focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; border-radius: 4px; }
  .skip { position: absolute; left: var(--gutter); top: -3rem; padding: 0.5rem 0.9rem; background: #f5d58a; color: #0b1020; border-radius: 6px; font-weight: 600; z-index: 2; }
  .skip:focus { top: 0.75rem; }

  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; max-width: calc(var(--column) + var(--rail) + 4rem); margin: 0 auto; padding: 1.1rem var(--gutter); }
  .wordmark { display: inline-flex; align-items: center; gap: 0.55rem; color: var(--ink); font: 700 1.2rem/1 var(--font-display); text-decoration: none; letter-spacing: -0.01em; }
  .wordmark svg { width: 1.35rem; height: 1.35rem; }
  .topbar nav { display: flex; gap: 0.25rem 1.1rem; flex-wrap: wrap; justify-content: flex-end; font-size: 0.9rem; }
  .topbar nav a { color: var(--muted); text-decoration: none; padding: 0.55rem 0.15rem; min-height: 2.75rem; display: inline-flex; align-items: center; }
  .topbar nav a:hover { color: var(--ink); }

  .layout { display: grid; grid-template-columns: minmax(0, var(--column)) var(--rail); gap: 3.5rem; justify-content: center; padding: 0 var(--gutter) 3rem; }
  .doc { min-width: 0; }
  .toc { position: sticky; top: 1.5rem; align-self: start; font-size: 0.875rem; padding-top: 0.5rem; }
  .toc h2 { margin: 0 0 0.6rem; color: var(--muted); font: 600 0.72rem/1 var(--font-ui); letter-spacing: 0.16em; text-transform: uppercase; border: 0; padding: 0; }
  .toc ol { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--line); }
  .toc a { display: block; padding: 0.35rem 0 0.35rem 0.9rem; margin-left: -1px; color: var(--muted); text-decoration: none; border-left: 2px solid transparent; }
  .toc a:hover { color: var(--ink); }
  .toc a[aria-current="true"] { color: var(--ink); border-left-color: var(--gold); }

  .doc > :first-child { margin-top: 0; }
  .doc h1 { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .doc h2 { margin: 3rem 0 1rem; padding-top: 1.6rem; border-top: 1px solid var(--line); font: 700 clamp(1.45rem, 3.4vw, 1.85rem)/1.2 var(--font-display); letter-spacing: -0.01em; color: var(--ink); }
  .doc h2::before { content: ""; display: block; width: 2.5rem; height: 2px; margin-bottom: 1rem; background: linear-gradient(90deg, var(--violet), var(--gold)); }
  .doc h3 { margin: 2rem 0 0.6rem; font-size: 1.1rem; color: var(--ink); }
  .doc p, .doc li { color: var(--ink-soft); }
  .doc strong { color: var(--ink); }
  .doc p[align="center"], .doc div[align="center"] { text-align: center; }
  .doc img { max-width: 100%; height: auto; vertical-align: middle; }
  .doc p[align="center"] img { margin: 0.15rem 0.1rem; }
  .doc picture img, .doc > p:first-of-type img { display: block; width: 100%; border-radius: 18px; box-shadow: 0 30px 80px -30px rgba(99, 102, 241, 0.45); }
  .doc hr { border: 0; height: 1px; margin: 2.5rem 0; background: linear-gradient(90deg, transparent, var(--line-strong), transparent); }
  .doc hr + h2 { border-top: 0; padding-top: 0; }
  .doc p[align="center"] img:not([width]) { height: 1.5rem; width: auto; }
  .doc ul, .doc ol { padding-left: 1.3rem; }
  .doc li { margin: 0.35rem 0; }
  .doc li::marker { color: var(--violet); }
  .doc code { font: 0.86em var(--font-mono); padding: 0.12em 0.4em; border-radius: 5px; background: var(--violet-soft); color: var(--ink); overflow-wrap: anywhere; }
  .doc pre { overflow-x: auto; padding: 1rem 1.1rem; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
  .doc pre code { padding: 0; background: none; }
  .doc blockquote { margin: 1.5rem 0; padding: 0.9rem 1.2rem; border-left: 3px solid var(--violet); background: var(--violet-soft); border-radius: 0 10px 10px 0; font: 1.12rem/1.55 var(--font-display); }
  .doc blockquote p { margin: 0; color: var(--ink); }
  .table-wrap { overflow-x: auto; margin: 1.25rem 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .doc table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
  .doc th, .doc td { padding: 0.7rem 0.9rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  .doc th { color: var(--muted); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; background: var(--raised); }
  .doc tr:last-child td { border-bottom: 0; }
  .doc details { margin: 1rem 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .doc summary { cursor: pointer; padding: 0.85rem 1.1rem; min-height: 2.75rem; color: var(--ink); font-weight: 600; list-style: none; display: flex; gap: 0.6rem; align-items: center; }
  .doc summary::-webkit-details-marker { display: none; }
  .doc summary::before { content: ""; width: 0.5rem; height: 0.5rem; border: solid var(--gold); border-width: 0 2px 2px 0; transform: rotate(-45deg); transition: transform 160ms ease; flex: none; }
  .doc details[open] > summary::before { transform: rotate(45deg); }
  .doc details > :not(summary) { margin-left: 1.1rem; margin-right: 1.1rem; }
  @media (prefers-reduced-motion: reduce) { .doc summary::before { transition: none; } }

  .foot { max-width: calc(var(--column) + var(--rail) + 4rem); margin: 0 auto; padding: 0 var(--gutter) 3rem; color: var(--muted); font-size: 0.9rem; }
  .foot img { display: block; width: 100%; height: auto; border-radius: 14px; margin-bottom: 1.2rem; opacity: 0.9; }
  .foot p { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 1.5rem; margin: 0; }
  .foot a { color: var(--ink-soft); }

  @media (max-width: 62rem) {
    .layout { grid-template-columns: minmax(0, 1fr); gap: 0; max-width: calc(var(--column) + 2 * var(--gutter)); margin: 0 auto; }
    .toc { position: sticky; top: 0; z-index: 1; order: -1; margin: 0 calc(-1 * var(--gutter)) 1.25rem; padding: 0 var(--gutter); background: color-mix(in srgb, var(--navy) 92%, transparent); border-bottom: 1px solid var(--line); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
    .toc h2 { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .toc ol { display: flex; gap: 1.1rem; border: 0; overflow-x: auto; scrollbar-width: none; white-space: nowrap; }
    .toc ol::-webkit-scrollbar { display: none; }
    .toc a { padding: 0; margin: 0; border: 0; min-height: 2.75rem; display: flex; align-items: center; font-size: 0.85rem; }
    .toc a[aria-current="true"] { border: 0; color: var(--gold); }
    html { scroll-padding-top: 3.5rem; }
  }
  @media (max-width: 600px) {
    body { font-size: 1rem; }
    .topbar { flex-direction: column; align-items: flex-start; gap: 0; padding-top: 0.8rem; padding-bottom: 0.2rem; }
    .topbar nav { justify-content: flex-start; gap: 0 1rem; font-size: 0.85rem; }
    .doc p[align="center"] img:not([width]) { height: 1.3rem; }
    .doc > p:first-of-type img { border-radius: 12px; }
    .doc th, .doc td { padding: 0.6rem 0.7rem; }
  }
`;

// Marks the contents entry for the section in view. Without it the page is
// the same, only without the highlight.
const SCRIPT = `
(() => {
  const links = new Map([...document.querySelectorAll('.toc a')].map((a) => [a.getAttribute('href').slice(1), a]));
  if (!('IntersectionObserver' in window) || links.size === 0) return;
  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id);
    const first = [...links.keys()].find((id) => seen.has(id));
    if (!first) return;
    for (const [id, a] of links) id === first ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current');
  }, { rootMargin: '0px 0px -60% 0px' });
  for (const id of links.keys()) { const h = document.getElementById(id); if (h) io.observe(h); }
})();
`;

const MARK = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5l2.3 7.2 7.2 2.3-7.2 2.3L12 21.5l-2.3-7.2L2.5 12l7.2-2.3z" fill="none" stroke="#f5d58a" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

export function renderReadmePage(): string {
  const md = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const { html, headings } = renderMarkdownDocument(md);
  const sections = headings.filter((h) => h.level === 2);
  const toc = sections.map((h) => `<li><a href="#${h.id}">${h.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</a></li>`).join("");
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Overlap</title><meta name="description" content="Overlap's README: what good means for an anonymous study lounge, what is enforced and what is judged."><meta name="theme-color" content="#0b1020"><style>${STYLE}</style></head><body>
<a class="skip" href="#readme">Skip to the README</a>
<header class="topbar">
  <a class="wordmark" href="/">${MARK}Overlap</a>
  <nav aria-label="Overlap"><a href="/">Enter the lounge</a><a href="/about/">About</a><a href="${REPO}/blob/main/PROCESS.md">Process</a><a href="${REPO}">Source</a></nav>
</header>
<div class="layout">
  <main class="doc" id="readme" tabindex="-1">
${html}
  </main>
  <nav class="toc" aria-label="On this page"><h2>On this page</h2><ol>${toc}</ol></nav>
</div>
<footer class="foot">
  <p><span>This page is <a href="${REPO}/blob/main/README.md">README.md</a>, rendered by the app.</span><a href="/">Back to the lounge</a></p>
</footer>
<script>${SCRIPT}</script>
</body></html>`;
}
