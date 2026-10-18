import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// Every route must render inside the full lounge shell: the page's own
// stylesheet, the entered lounge, the stage of stars, the title and the
// dock, and nothing else. A route that renders a bare or half-built view, or
// a pale empty page, fails here (and in the four-browser sweep).
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

const ROUTES: Array<[string, string]> = [
  ["#science", "Science"],
  ["#engineering", "Engineering"],
  ["#business", "Business"],
  ["#health", "Health"],
  ["#arts-society", "Arts & Society"],
  ["#arts", "Arts & Society"],
];

async function open(hash: string, cookie?: string) {
  const html = await (await fetch(new URL("/", baseUrl), { headers: cookie ? { Cookie: cookie } : {} })).text();
  const dom = new JSDOM(html, { url: new URL(hash, baseUrl).toString(), runScripts: "outside-only" });
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
  const errors: unknown[] = [];
  window.addEventListener("error", (e) => errors.push(e.error ?? e.message));
  window.eval(skyJs);
  return { window, doc: window.document, html, listeners, errors };
}

function expectShell(doc: Document, html: string) {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  expect(css.length).toBeGreaterThan(10_000);
  for (const rule of ["#stage", ".topbar", ".dock", ".hero", ".lounge-backdrop", ".star-core"]) expect(css).toContain(rule);
  expect(doc.body.classList.contains("entered")).toBe(true);
  expect(doc.getElementById("sky-app")?.getAttribute("aria-hidden")).toBe("false");
  expect(doc.querySelector(".lounge-backdrop")).not.toBeNull();
  expect(doc.getElementById("stage")).not.toBeNull();
  expect(doc.querySelector(".dock")).not.toBeNull();
  expect(doc.querySelectorAll("nav.lounge-nav a.nav-link")).toHaveLength(6);
}

const IDS: Record<string, string> = { "#science": "science", "#engineering": "engineering", "#business": "business", "#health": "health", "#arts-society": "arts", "#arts": "arts" };

for (const [hash, name] of ROUTES) {
  it(`${hash} opens ${name}'s own view, inside the full lounge shell`, async () => {
    const p = await open(hash);
    try {
      expectShell(p.doc, p.html);
      const id = IDS[hash]!;
      expect(p.doc.body.dataset.view).toBe(id);
      expect(p.doc.querySelector("#sky-app h1")?.textContent).toBe(name);
      expect(p.doc.getElementById("view-line")?.textContent?.length).toBeGreaterThan(10);
      expect(p.doc.querySelector(`nav.lounge-nav a[data-view="${id}"]`)?.getAttribute("aria-current")).toBe("page");
      expect(p.doc.getElementById("back-common")?.hidden).toBe(false);
      // Only this constellation's figure is drawn, large, behind its stars.
      expect([...p.doc.querySelectorAll("#figures .figure")].map((g) => g.getAttribute("data-figure"))).toEqual([id]);
      expect(p.errors).toEqual([]);
    } finally {
      p.window.close();
    }
  });
}

it("/ and an unknown route both show the Common Room, never a blank view", async () => {
  for (const hash of ["", "#not-a-constellation"]) {
    const p = await open(hash);
    try {
      expectShell(p.doc, p.html);
      expect(p.doc.body.dataset.view).toBe("common");
      expect(p.doc.querySelector("#sky-app h1")?.textContent).toBe("The Common Room");
      expect(p.doc.querySelectorAll("#figures .figure")).toHaveLength(5);
      expect(p.doc.getElementById("back-common")?.hidden).toBe(true);
      expect(p.errors).toEqual([]);
    } finally {
      p.window.close();
    }
  }
});

it("a constellation view survives a live sync and back/forward", async () => {
  const p = await open("#engineering");
  try {
    const zero = { science: 0, engineering: 0, business: 0, health: 0, arts: 0 };
    p.listeners.sync?.({ data: JSON.stringify({ stars: [{ id: "s1", x: 0.5, y: 0.2, brightness: "bright", constellation: "engineering" }, { id: "s2", x: 0.2, y: 0.7, brightness: "bright", constellation: "health" }], liveStarIds: ["s1"], liveByConstellation: { ...zero, engineering: 1 }, tracesByConstellation: { ...zero, engineering: 1, health: 1 }, unsettledTraces: 0 }) });
    expect(p.doc.body.dataset.view).toBe("engineering");
    expect(p.doc.querySelector('#sky g.star[data-id="s1"]')?.classList.contains("away")).toBe(false);
    expect(p.doc.querySelector('#sky g.star[data-id="s2"]')?.classList.contains("away")).toBe(true);
    p.window.history.pushState(null, "", "#health");
    p.window.dispatchEvent(new p.window.PopStateEvent("popstate"));
    expect(p.doc.body.dataset.view).toBe("health");
    expect(p.doc.querySelector('#sky g.star[data-id="s2"]')?.classList.contains("away")).toBe(false);
    p.window.history.pushState(null, "", "/");
    p.window.dispatchEvent(new p.window.PopStateEvent("popstate"));
    expect(p.doc.body.dataset.view).toBe("common");
    expect(p.doc.querySelectorAll("#sky g.star.away")).toHaveLength(0);
    expect(p.errors).toEqual([]);
  } finally {
    p.window.close();
  }
});

it("the stage clips everything drawn in it, so nothing can paint over the page", async () => {
  const p = await open("");
  try {
    const css = p.html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(css).toMatch(/#stage\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/#stage\s*\{[^}]*contain:\s*paint/);
    expect(css).toMatch(/svg#sky\s*\{[^}]*overflow:\s*hidden/);
    expect(css).not.toMatch(/vector-effect/);
  } finally {
    p.window.close();
  }
});

it("no SVG is drawn in sub-pixel units and no font is smaller than a pixel", async () => {
  const { cookie } = await (async () => {
    const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
    return { cookie: res.headers.get("set-cookie")!.split(";")[0]! };
  })();
  const p = await open("", cookie);
  try {
    for (const svg of p.doc.querySelectorAll("svg[viewBox]")) {
      const [, , w, h] = svg.getAttribute("viewBox")!.split(/\s+/).map(Number);
      expect(w, svg.id || "svg").toBeGreaterThanOrEqual(100);
      expect(h, svg.id || "svg").toBeGreaterThanOrEqual(100);
    }
    for (const c of p.doc.querySelectorAll("#sky circle[r]")) expect(Number(c.getAttribute("r"))).toBeGreaterThanOrEqual(1);
    const css = p.html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(css).not.toMatch(/\b0?\.\d+px\s+var\(--font-mono\)|font-size:\s*0?\.\d+px/);
    expect(p.doc.querySelector("#sky .star.own .star-you")?.textContent).toBe("you");
  } finally {
    p.window.close();
  }
});

it("choosing Arts & Society writes #arts-society to the address bar", async () => {
  const p = await open("");
  try {
    p.doc.querySelector<HTMLAnchorElement>('nav.lounge-nav a[data-view="arts"]')!.click();
    expect(p.window.location.hash).toBe("#arts-society");
    expect(p.doc.body.dataset.view).toBe("arts");
  } finally {
    p.window.close();
  }
});
