import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// The lounge's design, checked against the real HTML and the real sky.js.
// Layout (centring, spanning the viewport) needs a real browser and is
// checked there; these check what the DOM and CSS promise.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

type SyncStar = { id: string; x: number; y: number; brightness: string };

async function loadLounge(opts: { cookie?: string; sync?: { stars: SyncStar[]; liveStarIds: string[] } } = {}) {
  const res = await fetch(new URL("/", baseUrl), { headers: opts.cookie ? { Cookie: opts.cookie } : {} });
  const html = await res.text();
  const dom = new JSDOM(html, { url: baseUrl, runScripts: "outside-only" });
  const { window } = dom;
  window.localStorage.setItem("overlap-arrival-v2", "entered");
  window.localStorage.setItem("overlap-film-seen", "1");

  const listeners: Record<string, (e: { data: string }) => void> = {};
  Object.assign(window, {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    CSS: { escape: (s: string) => s },
    EventSource: class {
      addEventListener(type: string, cb: (e: { data: string }) => void) { listeners[type] = cb; }
      close() {}
    },
    fetch: async () => ({ ok: true, json: async () => ({ hasStar: false }) }),
  });
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  window.eval(skyJs);
  if (opts.sync) listeners.sync?.({ data: JSON.stringify(opts.sync) });
  return { window, doc: window.document, html, close: () => window.close() };
}

const css = (html: string): string => html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";

async function newStarCookie(): Promise<{ cookie: string; id: string }> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const { star } = await res.json();
  return { cookie: res.headers.get("set-cookie")!.split(";")[0]!, id: star.id };
}

it("after entering, focus is never on the heading: it goes to the place button", async () => {
  const l = await loadLounge();
  try {
    const focused = l.doc.activeElement;
    expect(focused?.tagName).not.toBe("H1");
    expect(focused?.id).toBe("place-star");
  } finally {
    l.close();
  }
});

it("after entering with a star, focus goes to the visitor's own star", async () => {
  const { cookie } = await newStarCookie();
  const l = await loadLounge({ cookie });
  try {
    const focused = l.doc.activeElement as Element | null;
    expect(focused?.tagName).not.toBe("H1");
    expect(focused?.getAttribute("data-own")).toBe("true");
  } finally {
    l.close();
  }
});

it("entering announces itself, once, to screen readers", async () => {
  const l = await loadLounge();
  try {
    const status = l.doc.getElementById("status");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.textContent?.trim()).toBe("You've entered the lounge.");
  } finally {
    l.close();
  }
});

it("the number of rendered stars equals the sync snapshot", async () => {
  const stars: SyncStar[] = Array.from({ length: 12 }, (_, i) => ({
    id: `snap-${i}`, x: (i + 1) / 14, y: 0.5, brightness: ["bright", "soft", "dim", "faint"][i % 4]!,
  }));
  // Start from an HTML page whose server-side stars differ from the snapshot,
  // so a renderer that only adds (never removes) would over-count.
  const l = await loadLounge({ sync: { stars, liveStarIds: [] } });
  try {
    // One <g class="star"> per star; its core also carries data-id, so count
    // the groups, not every element with an id.
    expect(l.doc.querySelectorAll("#sky g.star[data-id]")).toHaveLength(stars.length);
    for (const s of stars) expect(l.doc.querySelector(`#sky g.star[data-id="${s.id}"]`)).not.toBeNull();
  } finally {
    l.close();
  }
});

it("each old-light level draws a different core size", async () => {
  const levels = ["bright", "soft", "dim", "faint"];
  const stars = levels.map((b, i) => ({ id: `lvl-${b}`, x: 0.2 + i * 0.2, y: 0.5, brightness: b }));
  const l = await loadLounge({ sync: { stars, liveStarIds: [] } });
  try {
    const radii = levels.map((b) => Number(l.doc.querySelector(`#sky [data-id="lvl-${b}"] .star-core, #sky .star-core[data-id="lvl-${b}"]`)?.getAttribute("r")));
    for (const r of radii) expect(r).toBeGreaterThan(0);
    expect(new Set(radii).size).toBe(levels.length);
    // Older light is smaller, never larger.
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeLessThan(radii[i - 1]!);
  } finally {
    l.close();
  }
});

it("stars shrink gently as the lounge fills: full size to 20, about 60% at 150", async () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `fill-${n}-${i}`, x: (i % 15) / 15, y: Math.floor(i / 15) / 12, brightness: "bright" }));
  const coreR = async (n: number) => {
    const l = await loadLounge({ sync: { stars: make(n), liveStarIds: [] } });
    try {
      return Number(l.doc.querySelector(`#sky [data-id="fill-${n}-0"] .star-core, #sky .star-core[data-id="fill-${n}-0"]`)?.getAttribute("r"));
    } finally {
      l.close();
    }
  };
  const [r1, r20, r150] = [await coreR(1), await coreR(20), await coreR(150)];
  expect(r20).toBeCloseTo(r1, 6);
  expect(r150 / r1).toBeGreaterThan(0.55);
  expect(r150 / r1).toBeLessThan(0.65);
});

it("the header is centred: label, intro and a small unboxed h1", async () => {
  const l = await loadLounge();
  try {
    const app = l.doc.getElementById("sky-app")!;
    expect(app.querySelector(".lounge-kicker")?.textContent?.trim()).toBe("OVERLAP · ANONYMOUS STUDY LOUNGE");
    expect(app.querySelector("h1")?.textContent?.trim()).toBe("Overlap");
    expect(app.querySelector(".lounge-intro")?.textContent?.trim()).toBe("Place your star, settle in, and see that others are quietly here.");
    // The heading is not focusable, so it can never wear a focus box.
    expect(app.querySelector("h1")?.hasAttribute("tabindex")).toBe(false);
  } finally {
    l.close();
  }
});

it("no focus ring is large or far from its element", async () => {
  const l = await loadLounge();
  try {
    const rules = [...css(l.html).matchAll(/([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) {
      const offset = Number(body!.match(/outline-offset:\s*(-?[\d.]+)px/)?.[1] ?? 0);
      const width = Number(body!.match(/outline:\s*([\d.]+)px/)?.[1] ?? 0);
      expect(offset, selector).toBeLessThanOrEqual(3);
      expect(width, selector).toBeLessThanOrEqual(2);
    }
  } finally {
    l.close();
  }
});

it("the place button shares the arrival button's style, never the browser default", async () => {
  const l = await loadLounge();
  try {
    const btn = l.doc.getElementById("place-star")!;
    expect(btn.classList.contains("lounge-button")).toBe(true);
    const sheet = css(l.html);
    expect(sheet).toMatch(/#arrival-submit,\s*\.lounge-button\s*\{/);
  } finally {
    l.close();
  }
});

it("the backdrop is the arrival galaxy, blurred and darkened", async () => {
  const l = await loadLounge();
  try {
    const backdrop = l.doc.querySelector(".lounge-backdrop");
    expect(backdrop).not.toBeNull();
    const rule = css(l.html).match(/\.lounge-backdrop\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/arrival-galaxy-(960|1920)\.webp/);
    const blur = Number(rule.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0);
    expect(blur).toBeGreaterThanOrEqual(24);
    expect(rule).toMatch(/brightness\(0?\.\d+\)/);
  } finally {
    l.close();
  }
});

it("your new star stays yours even when its live broadcast arrives before your own reply", async () => {
  const res = await fetch(new URL("/", baseUrl));
  const dom = new JSDOM(await res.text(), { url: baseUrl, runScripts: "outside-only" });
  const { window } = dom;
  window.localStorage.setItem("overlap-arrival-v2", "entered");
  window.localStorage.setItem("overlap-film-seen", "1");
  const listeners: Record<string, (e: { data: string }) => void> = {};
  let releaseReply: () => void = () => {};
  const star = { id: "race-star", x: 0.4, y: 0.6, brightness: "bright" };
  Object.assign(window, {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    CSS: { escape: (s: string) => s },
    EventSource: class {
      addEventListener(type: string, cb: (e: { data: string }) => void) { listeners[type] = cb; }
      close() {}
    },
    // The placement reply is held back until the broadcast has landed.
    fetch: (url: string) => url === "/api/star"
      ? new Promise((resolve) => { releaseReply = () => resolve({ ok: true, json: async () => ({ star }) }); })
      : Promise.resolve({ ok: true, json: async () => ({ hasStar: false }) }),
  });
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  window.eval(skyJs);
  try {
    listeners.sync?.({ data: JSON.stringify({ stars: [], liveStarIds: [] }) });
    window.document.getElementById("place-star")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    listeners.star?.({ data: JSON.stringify({ change: "created", star }) });
    releaseReply();
    await new Promise((r) => setTimeout(r, 20));
    const g = window.document.querySelector('#sky g.star[data-id="race-star"]');
    expect(g?.getAttribute("data-own")).toBe("true");
    expect(g?.querySelector(".star-you-label")?.textContent).toBe("you");
    expect(window.document.querySelectorAll("#sky g.star[data-id]")).toHaveLength(1);
  } finally {
    window.close();
  }
});
