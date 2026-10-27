import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// The lounge's design, checked against the real HTML and the real sky.js.
// Layout (centring, spanning the viewport) needs a real browser and is
// checked there; these check what the DOM and CSS promise.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

type SyncStar = { id: string; x: number; y: number; brightness: string; constellation: string | null };
type Sync = { stars: SyncStar[]; liveStarIds: string[]; liveByConstellation?: Record<string, number>; tracesByConstellation?: Record<string, number>; unsettledTraces?: number };

async function loadLounge(opts: { cookie?: string; hash?: string; sync?: Sync } = {}) {
  const res = await fetch(new URL("/", baseUrl), { headers: opts.cookie ? { Cookie: opts.cookie } : {} });
  const html = await res.text();
  const dom = new JSDOM(html, { url: new URL(opts.hash ?? "", baseUrl).toString(), runScripts: "outside-only" });
  const { window } = dom;
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
  // Every load starts on the arrival screen; these checks begin in the lounge.
  window.document.getElementById("arrival-submit")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  if (opts.sync) listeners.sync?.({ data: JSON.stringify(opts.sync) });
  return { window, doc: window.document, html, listeners, close: () => window.close() };
}

const css = (html: string): string => html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";

async function newStarCookie(constellation?: string): Promise<{ cookie: string; id: string }> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const { star } = await res.json();
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  if (constellation) {
    await fetch(new URL("/api/star/constellation", baseUrl), {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ constellation }),
    });
  }
  return { cookie, id: star.id };
}

const AREAS = ["science", "engineering", "business", "health", "arts"];
const zero = () => Object.fromEntries(AREAS.map((a) => [a, 0]));

it("after entering, focus is never on the heading: it goes to the place button", async () => {
  const l = await loadLounge();
  try {
    expect(l.doc.activeElement?.tagName).not.toBe("H1");
    expect(l.doc.activeElement?.id).toBe("place-star");
  } finally {
    l.close();
  }
});

it("after entering with a star, focus goes to the visitor's own star on the map", async () => {
  const { cookie, id } = await newStarCookie();
  const l = await loadLounge({ cookie });
  try {
    const focused = l.doc.activeElement as Element | null;
    expect(focused?.getAttribute("data-id")).toBe(id);
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

it("the Common Room draws exactly the snapshot's real stars, settled or not, and nothing else", async () => {
  const stars: SyncStar[] = [
    { id: "g-sci", x: 0.2, y: 0.2, brightness: "bright", constellation: "science" },
    { id: "g-eng", x: 0.5, y: 0.2, brightness: "bright", constellation: "engineering" },
    { id: "t-old", x: 0.5, y: 0.5, brightness: "faint", constellation: null },
    { id: "g-free", x: 0.5, y: 0.45, brightness: "bright", constellation: null },
  ];
  const l = await loadLounge({ sync: { stars, liveStarIds: ["g-sci", "g-eng", "g-free"], liveByConstellation: { ...zero(), science: 1, engineering: 1 }, tracesByConstellation: { ...zero(), science: 1, engineering: 1 }, unsettledTraces: 2 } });
  try {
    const drawn = [...l.doc.querySelectorAll("#sky g.star[data-id]")].map((g) => g.getAttribute("data-id")).sort();
    expect(drawn).toEqual(["g-eng", "g-free", "g-sci", "t-old"]);
    expect(l.doc.querySelectorAll("#sky g.star.away")).toHaveLength(0);
    // Glowing stars wear the sparkle; a past trace has none.
    const g = (id: string) => l.doc.querySelector(`#sky g.star[data-id="${id}"]`)!;
    expect(g("g-free").classList.contains("glowing")).toBe(true);
    expect(g("g-free").querySelector(".star-sparkle")).not.toBeNull();
    expect(g("t-old").classList.contains("trace")).toBe(true);
    expect(g("t-old").querySelector(".star-sparkle")).toBeNull();
    // Map decoration never uses a circle: only stars are points of light.
    expect(l.doc.querySelectorAll("#figures circle, #regions circle")).toHaveLength(0);
    expect(l.doc.getElementById("live-line")?.textContent).toBe("3 studying now · 4 traces");
  } finally {
    l.close();
  }
});
it("each light level is drawn smaller and fainter than the one before, and glowing is brightest", async () => {
  const levels: Array<[string, string]> = [["bright", "recent"], ["soft", "recent"], ["dim", "trace"], ["faint", "trace"]];
  const stars = levels.map(([b], i) => ({ id: `lvl-${b}`, x: 0.2 + i * 0.2, y: 0.5, brightness: b, constellation: null }));
  const l = await loadLounge({ sync: { stars: [...stars, { id: "lvl-live", x: 0.1, y: 0.5, brightness: "bright", constellation: null }], liveStarIds: ["lvl-live"] } });
  try {
    expect(l.doc.querySelector('#sky [data-id="lvl-live"]')?.classList.contains("glowing")).toBe(true);
    for (const [b, level] of levels) expect(l.doc.querySelector(`#sky [data-id="lvl-${b}"]`)?.classList.contains(level), b).toBe(true);
    // The stylesheet scales and fades each level less than the one above.
    const sheet = css(l.html);
    const scale = (level: string) => Number(sheet.match(new RegExp(`\\.star\\.${level}\\s+\\.star-core\\s*\\{[^}]*scale\\(([\\d.]+)\\)`))?.[1]);
    const opacity = (level: string) => Number(sheet.match(new RegExp(`\\.star\\.${level}\\s+\\.star-core\\s*\\{[^}]*opacity:\\s*([\\d.]+)`))?.[1]);
    expect(scale("glowing")).toBeGreaterThan(scale("recent"));
    expect(scale("recent")).toBeGreaterThan(scale("trace"));
    expect(opacity("glowing")).toBeGreaterThan(opacity("recent"));
    expect(opacity("recent")).toBeGreaterThan(opacity("trace"));
  } finally {
    l.close();
  }
});
it("a live event updates the stars and counts without a reload", async () => {
  const l = await loadLounge({ sync: { stars: [], liveStarIds: [], liveByConstellation: zero(), tracesByConstellation: zero(), unsettledTraces: 0 } });
  try {
    const live = () => l.doc.querySelector('#regions a.region[data-region="arts"] .region-live')?.textContent;
    expect(live()).toBe("Quiet");
    l.listeners.star?.({ data: JSON.stringify({ change: "constellation", star: { id: "x1", x: 0.7, y: 0.7, brightness: "bright", constellation: "arts" } }) });
    l.listeners.live?.({ data: JSON.stringify({ starIds: ["x1"], liveByConstellation: { ...zero(), arts: 1 }, tracesByConstellation: { ...zero(), arts: 1 }, unsettledTraces: 0 }) });
    expect(live()).toBe("1 studying now");
    expect(l.doc.querySelector('nav.lounge-nav a[data-view="arts"]')?.getAttribute("data-live")).toBe("1");
    expect(l.doc.querySelector('#sky g.star[data-id="x1"]')?.classList.contains("glowing")).toBe(true);
    l.listeners.live?.({ data: JSON.stringify({ starIds: [], liveByConstellation: zero(), tracesByConstellation: { ...zero(), arts: 1 }, unsettledTraces: 0 }) });
    expect(live()).toBe("Quiet");
    expect(l.doc.querySelector('#sky g.star[data-id="x1"]')?.classList.contains("glowing")).toBe(false);
    // In Arts & Society's own view, its one trace is counted.
    l.window.history.pushState(null, "", "#arts-society");
    l.window.dispatchEvent(new l.window.PopStateEvent("popstate"));
    expect(l.doc.getElementById("live-line")?.textContent).toBe("Nobody studying in Arts & Society right now · 1 trace");
  } finally {
    l.close();
  }
});
it("your own star is marked by a ring and a 'you' label, and its constellation by the dock and the doorway", async () => {
  const { cookie, id } = await newStarCookie("engineering");
  const l = await loadLounge({ cookie });
  try {
    const own = l.doc.querySelector(`#sky g.star[data-id="${id}"]`)!;
    expect(own.querySelector(".star-ring")).not.toBeNull();
    expect(own.querySelector(".star-you")?.textContent).toBe("you");
    expect(own.getAttribute("data-constellation")).toBe("engineering");
    expect(l.doc.getElementById("where")?.textContent).toBe("Your star is in Engineering.");
    expect(l.doc.querySelector('#regions a.region[data-region="engineering"]')?.classList.contains("is-yours")).toBe(true);
    expect(l.doc.getElementById("leave-area")?.textContent).toBe("Leave Engineering");
    expect(l.doc.getElementById("leave-area")?.hidden).toBe(false);
  } finally {
    l.close();
  }
});
it("opening a constellation shows only its stars; the others are kept, not deleted", async () => {
  const stars: SyncStar[] = [
    { id: "in-h", x: 0.2, y: 0.7, brightness: "bright", constellation: "health" },
    { id: "free", x: 0.5, y: 0.5, brightness: "bright", constellation: null },
  ];
  const l = await loadLounge({ sync: { stars, liveStarIds: [] } });
  try {
    l.doc.querySelector<HTMLAnchorElement>('nav.lounge-nav a[data-view="health"]')!.click();
    expect(l.window.location.hash).toBe("#health");
    expect(l.doc.body.dataset.view).toBe("health");
    expect(l.doc.querySelector('#sky g.star[data-id="in-h"]')?.classList.contains("away")).toBe(false);
    expect(l.doc.querySelector('#sky g.star[data-id="free"]')?.classList.contains("away")).toBe(true);
    expect(l.doc.getElementById("view-line")?.textContent).toBe("Learn, care and understand people.");
    expect(l.doc.getElementById("settle-action")?.textContent).toBe("Place your star in Health");
    l.doc.getElementById("back-common")!.click();
    expect(l.doc.body.dataset.view).toBe("common");
    expect(l.doc.querySelectorAll("#sky g.star.away")).toHaveLength(0);
  } finally {
    l.close();
  }
});
it("a new visitor places a star in the Common Room without choosing a constellation", async () => {
  const posts: Array<{ url: string; body: string }> = [];
  const l = await loadLounge();
  try {
    Object.assign(l.window, {
      fetch: async (url: string, init?: { body?: string }) => {
        posts.push({ url, body: init?.body ?? "" });
        if (url === "/api/star") return { ok: true, json: async () => ({ star: { id: "mine", x: 0.5, y: 0.5, constellation: null } }) };
        return { ok: true, json: async () => ({ hasStar: false }) };
      },
    });
    l.doc.getElementById("place-star")!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(posts.map((p) => p.url)).toEqual(["/api/star"]);
    expect(l.doc.body.dataset.constellation).toBe("");
    expect(l.doc.getElementById("where")?.textContent).toBe("Your star is in the Common Room.");
    expect(l.doc.querySelector('#sky g.star[data-id="mine"] .star-you')?.textContent).toBe("you");
  } finally {
    l.close();
  }
});

it("your star can be moved without dragging: Enter, then tap a place", async () => {
  const { cookie, id } = await newStarCookie();
  const moves: string[] = [];
  const l = await loadLounge({ cookie, sync: { stars: [{ id, x: 0.5, y: 0.5, brightness: "bright", constellation: null }, { id: "landmark", x: 0.25, y: 0.75, brightness: "faint", constellation: null }], liveStarIds: [id] } });
  try {
    Object.assign(l.window, {
      fetch: async (url: string, init?: { body?: string }) => {
        if (url === "/api/star/move") moves.push(init!.body!);
        return { ok: true, json: async () => ({ star: { id, ...JSON.parse(init?.body ?? "{}"), constellation: null } }) };
      },
    });
    // jsdom has no layout: give the stage a 1000 by 1000 box and re-measure.
    const stage = l.doc.getElementById("stage")!;
    (stage as unknown as { getBoundingClientRect: () => object }).getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 });
    l.window.dispatchEvent(new l.window.Event("resize"));
    await new Promise((r) => setTimeout(r, 20));
    // The other star is our landmark: (0.25, 0.75) on screen.
    const landmark = l.doc.querySelector('#sky g.star[data-id="landmark"]') as SVGGElement | null;
    const at = landmark!.style.transform.match(/translate\(([\d.]+)px, ([\d.]+)px\)/)!;
    const own = l.doc.querySelector(`#sky g.star[data-id="${id}"]`)!;
    own.dispatchEvent(new l.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(own.classList.contains("picked")).toBe(true);
    stage.dispatchEvent(new l.window.MouseEvent("click", { bubbles: true, clientX: Number(at[1]), clientY: Number(at[2]) }));
    await new Promise((r) => setTimeout(r, 20));
    expect(moves).toHaveLength(1);
    const moved = JSON.parse(moves[0]!);
    expect(moved.x).toBeCloseTo(0.25, 2);
    expect(moved.y).toBeCloseTo(0.75, 2);
  } finally {
    l.close();
  }
});
it("the title: a small label, a serif heading that cannot take focus, and the line", async () => {
  const l = await loadLounge();
  try {
    const app = l.doc.getElementById("sky-app")!;
    expect(app.querySelector(".view-kicker")?.textContent?.trim()).toBe("The Lounge");
    expect(app.querySelector("h1")?.textContent?.trim()).toBe("The Common Room");
    expect(app.querySelector("#view-line")?.textContent?.trim()).toBe("Place your star. Settle in. You are not studying alone.");
    expect(app.querySelector("h1")?.hasAttribute("tabindex")).toBe(false);
    expect(app.querySelector(".wordmark")?.textContent).toBe("Overlap");
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
    expect(l.doc.getElementById("place-star")!.classList.contains("lounge-button")).toBe(true);
    expect(css(l.html)).toMatch(/#arrival-submit,\s*\.lounge-button\s*\{/);
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
  window.localStorage.setItem("overlap-film-seen", "1");
  const listeners: Record<string, (e: { data: string }) => void> = {};
  let releaseReply: () => void = () => {};
  const star = { id: "race-star", x: 0.4, y: 0.6, brightness: "bright", constellation: null };
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
  // Every load starts on the arrival screen; these checks begin in the lounge.
  window.document.getElementById("arrival-submit")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  try {
    listeners.sync?.({ data: JSON.stringify({ stars: [], liveStarIds: [] }) });
    window.document.getElementById("place-star")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    listeners.star?.({ data: JSON.stringify({ change: "created", star }) });
    expect(window.document.querySelector('#sky g.star[data-id="race-star"]')?.getAttribute("data-own")).toBe("false");
    releaseReply();
    await new Promise((r) => setTimeout(r, 20));
    const g = window.document.querySelector('#sky g.star[data-id="race-star"]');
    expect(g?.getAttribute("data-own")).toBe("true");
    expect(g?.querySelector(".star-you")?.textContent).toBe("you");
    expect(window.document.querySelectorAll("#sky g.star[data-id]")).toHaveLength(1);
  } finally {
    window.close();
  }
});
