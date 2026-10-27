import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// The lounge's full-screen shell, checked against the real HTML and the real
// sky.js: one navigation, the Common Room as the default view, and each
// constellation as its own full-screen view of real stars. Layout itself
// needs a real browser and is checked there; these check what the DOM and
// the stylesheet promise.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

type SyncStar = { id: string; x: number; y: number; brightness: string; constellation: string | null };
type Sync = { stars: SyncStar[]; liveStarIds: string[]; liveByConstellation?: Record<string, number>; tracesByConstellation?: Record<string, number>; unsettledTraces?: number; listeningByMode?: Record<string, number> };

const AREAS = ["science", "engineering", "business", "health", "arts"];
const zero = () => Object.fromEntries(AREAS.map((a) => [a, 0]));

async function open(opts: { hash?: string; cookie?: string; sync?: Sync; fetch?: (url: string, init?: { body?: string }) => Promise<unknown> } = {}) {
  const html = await (await fetch(new URL("/", baseUrl), { headers: opts.cookie ? { Cookie: opts.cookie } : {} })).text();
  const dom = new JSDOM(html, { url: new URL(opts.hash ?? "", baseUrl).toString(), runScripts: "outside-only" });
  const { window } = dom;
  window.localStorage.setItem("overlap-film-seen", "1");
  const listeners: Record<string, (e: { data: string }) => void> = {};
  const plays: string[] = [];
  Object.assign(window, {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    CSS: { escape: (s: string) => s },
    EventSource: class {
      addEventListener(type: string, cb: (e: { data: string }) => void) { listeners[type] = cb; }
      close() {}
    },
    fetch: opts.fetch ?? (async () => ({ ok: true, json: async () => ({ hasStar: false }) })),
  });
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { plays.push(this.getAttribute("src") ?? ""); return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = () => {};
  const errors: unknown[] = [];
  window.addEventListener("error", (e) => errors.push(e.error ?? e.message));
  window.eval(skyJs);
  // Every load starts on the arrival screen; these checks begin in the lounge.
  window.document.getElementById("arrival-submit")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  if (opts.sync) listeners.sync?.({ data: JSON.stringify(opts.sync) });
  const doc = window.document;
  return { window, doc, html, listeners, errors, plays, close: () => window.close() };
}

async function newStar(constellation?: string): Promise<{ cookie: string; id: string }> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const { star } = await res.json();
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  if (constellation) {
    await fetch(new URL("/api/star/constellation", baseUrl), {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ constellation }),
    });
  }
  return { cookie, id: star.id };
}

const css = (html: string): string => html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

const VIEWS: Array<[string, string, string, string]> = [
  ["", "common", "The Common Room", "Place your star. Settle in. You are not studying alone."],
  ["#science", "science", "Science", "Observe, question, test and explain."],
  ["#engineering", "engineering", "Engineering", "Build, test, solve and iterate."],
  ["#business", "business", "Business", "Plan, analyse and make decisions."],
  ["#health", "health", "Health", "Learn, care and understand people."],
  ["#arts-society", "arts", "Arts & Society", "Read, create, question and connect."],
  ["#arts", "arts", "Arts & Society", "Read, create, question and connect."],
];

it("one compact navigation: the wordmark, the Common Room and the five constellations", async () => {
  const p = await open();
  try {
    expect(text(p.doc.querySelector(".wordmark"))).toBe("Overlap");
    expect(text(p.doc.querySelector(".wordmark-sub"))).toBe("anonymous study lounge");
    const links = [...p.doc.querySelectorAll("nav.lounge-nav a.nav-link")];
    expect(links.map((a) => text(a))).toEqual(["Common Room", "Science", "Engineering", "Business", "Health", "Arts & Society"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#", "#science", "#engineering", "#business", "#health", "#arts-society"]);
    expect(p.doc.querySelector("nav.lounge-nav")?.getAttribute("aria-label")).toBeTruthy();
  } finally {
    p.close();
  }
});

for (const [hash, view, title, line] of VIEWS) {
  it(`${hash || "/"} opens the ${title} view directly, full-screen, with no errors`, async () => {
    const p = await open({ hash });
    try {
      expect(p.doc.body.classList.contains("entered")).toBe(true);
      expect(p.doc.body.dataset.view).toBe(view);
      expect(text(p.doc.querySelector("#sky-app h1"))).toBe(title);
      expect(text(p.doc.getElementById("view-line"))).toBe(line);
      // Exactly one link is the current page.
      const current = [...p.doc.querySelectorAll('nav.lounge-nav a[aria-current="page"]')];
      expect(current.map((a) => (a as HTMLElement).dataset.view)).toEqual([view]);
      // The stage and the star map are always there: a view is never a
      // bare or half-built page.
      expect(p.doc.getElementById("stage")).not.toBeNull();
      expect(p.doc.getElementById("sky")).not.toBeNull();
      expect(p.doc.getElementById("back-common")?.hidden).toBe(view === "common");
      expect(p.errors).toEqual([]);
    } finally {
      p.close();
    }
  });
}

it("an unknown route shows the Common Room, never a blank view", async () => {
  const p = await open({ hash: "#not-a-constellation" });
  try {
    expect(p.doc.body.dataset.view).toBe("common");
    expect(text(p.doc.querySelector("#sky-app h1"))).toBe("The Common Room");
    expect(p.errors).toEqual([]);
  } finally {
    p.close();
  }
});

const mixed: SyncStar[] = [
  { id: "eng-live", x: 0.5, y: 0.2, brightness: "bright", constellation: "engineering" },
  { id: "eng-old", x: 0.45, y: 0.25, brightness: "faint", constellation: "engineering" },
  { id: "sci-live", x: 0.2, y: 0.2, brightness: "bright", constellation: "science" },
  { id: "free-recent", x: 0.5, y: 0.5, brightness: "soft", constellation: null },
  { id: "free-old", x: 0.52, y: 0.48, brightness: "dim", constellation: null },
];
const mixedSync = (): Sync => ({
  stars: mixed,
  liveStarIds: ["eng-live", "sci-live"],
  liveByConstellation: { ...zero(), engineering: 1, science: 1 },
  tracesByConstellation: { ...zero(), engineering: 2, science: 1 },
  unsettledTraces: 2,
});

it("the Common Room shows every real star, and the live line counts only real state", async () => {
  const p = await open({ sync: mixedSync() });
  try {
    const shown = [...p.doc.querySelectorAll("#sky g.star:not(.away)")].map((g) => g.getAttribute("data-id")).sort();
    expect(shown).toEqual(["eng-live", "eng-old", "free-old", "free-recent", "sci-live"]);
    expect(text(p.doc.getElementById("live-line"))).toBe("2 studying now · 5 traces");
    expect(p.doc.getElementById("live-line")?.getAttribute("role")).toBe("status");
  } finally {
    p.close();
  }
});

it("a constellation view shows only that constellation's stars, with its own counts", async () => {
  const p = await open({ hash: "#engineering", sync: mixedSync() });
  try {
    const shown = [...p.doc.querySelectorAll("#sky g.star:not(.away)")].map((g) => g.getAttribute("data-id")).sort();
    expect(shown).toEqual(["eng-live", "eng-old"]);
    // The other stars are not deleted, only out of this view.
    expect(p.doc.querySelector('#sky g.star[data-id="sci-live"]')?.classList.contains("away")).toBe(true);
    expect(text(p.doc.getElementById("live-line"))).toBe("1 studying in Engineering now · 2 traces");
  } finally {
    p.close();
  }
});

it("a quiet constellation says so plainly, with no invented numbers", async () => {
  const p = await open({ hash: "#business", sync: { ...mixedSync() } });
  try {
    expect(text(p.doc.getElementById("live-line"))).toBe("Nobody studying in Business right now · No traces yet");
    expect(p.doc.querySelectorAll("#sky g.star:not(.away)")).toHaveLength(0);
  } finally {
    p.close();
  }
});

it("light has three levels a visitor can tell apart: studying now, recent, and a past trace", async () => {
  const p = await open({ sync: mixedSync() });
  try {
    const g = (id: string) => p.doc.querySelector(`#sky g.star[data-id="${id}"]`)!;
    expect(g("eng-live").classList.contains("glowing")).toBe(true);
    expect(g("free-recent").classList.contains("recent")).toBe(true);
    expect(g("free-old").classList.contains("trace")).toBe(true);
    expect(g("eng-old").classList.contains("trace")).toBe(true);
    // Past traces are drawn last-but-quietest: below everything else.
    const order = [...p.doc.querySelectorAll("#sky g.star")].map((n) => n.getAttribute("data-id"));
    expect(order.indexOf("free-old")).toBeLessThan(order.indexOf("eng-live"));
    // Each level is styled differently in the stylesheet, and glowing alone breathes.
    const sheet = css(p.html);
    for (const level of ["glowing", "recent", "trace"]) expect(sheet).toMatch(new RegExp(`\\.star\\.${level}\\s+\\.star-core\\s*\\{`));
    expect(sheet).toMatch(/\.star\.glowing\s+\.star-halo\s*\{[^}]*animation/);
  } finally {
    p.close();
  }
});

it("a legend explains the light without colour alone, and past traces can be hidden", async () => {
  const p = await open({ sync: mixedSync() });
  try {
    const items = [...p.doc.querySelectorAll(".legend [data-legend]")].map((el) => [(el as HTMLElement).dataset.legend, text(el)]);
    expect(items).toEqual([["live", "Studying now"], ["recent", "Recent"], ["trace", "Past trace"], ["you", "You"]]);
    const toggle = p.doc.getElementById("traces-toggle") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    toggle.click();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(p.doc.getElementById("stage")?.classList.contains("hide-traces")).toBe(true);
    // The map describes itself for screen readers.
    expect(p.doc.getElementById("sky")?.getAttribute("aria-label")).toMatch(/real visitor/);
  } finally {
    p.close();
  }
});

it("decoration is never a point of light: constellation figures use no circles", async () => {
  const p = await open({ sync: mixedSync() });
  try {
    expect(p.doc.querySelectorAll("#regions circle, #figures circle")).toHaveLength(0);
    expect(p.doc.querySelectorAll("#regions .region")).toHaveLength(5);
  } finally {
    p.close();
  }
});

it("in the Common Room each constellation is a doorway to its own view", async () => {
  const p = await open({ sync: mixedSync() });
  try {
    const door = p.doc.querySelector<HTMLAnchorElement>('#regions a.region[data-region="health"]')!;
    expect(door.getAttribute("href")).toBe("#health");
    expect(text(door.querySelector(".region-name"))).toBe("Health");
    door.click();
    expect(p.window.location.hash).toBe("#health");
    expect(p.doc.body.dataset.view).toBe("health");
    // Back to the Common Room, through the history.
    p.window.history.back();
    await new Promise((r) => setTimeout(r, 30));
    expect(p.doc.body.dataset.view).toBe("common");
  } finally {
    p.close();
  }
});

it("with no star, the Common Room has one clear primary action", async () => {
  const p = await open({ sync: mixedSync() });
  try {
    const place = p.doc.getElementById("place-star") as HTMLButtonElement;
    expect(place.hidden).toBe(false);
    expect(text(place)).toBe("Place your star");
    expect(place.classList.contains("lounge-button")).toBe(true);
  } finally {
    p.close();
  }
});

it("with a star, the Common Room says quietly that it is glowing, with no onboarding card", async () => {
  const { cookie, id } = await newStar();
  const p = await open({ cookie });
  try {
    p.listeners.sync?.({ data: JSON.stringify({ stars: [{ id, x: 0.5, y: 0.5, brightness: "bright", constellation: null }], liveStarIds: [id] }) });
    expect(p.doc.getElementById("place-star")?.hidden).toBe(true);
    expect(text(p.doc.getElementById("you-status"))).toBe("Your star is glowing");
    const own = p.doc.querySelector(`#sky g.star[data-id="${id}"]`)!;
    expect(own.querySelector(".star-ring")).not.toBeNull();
    expect(text(own.querySelector(".star-you"))).toBe("you");
  } finally {
    p.close();
  }
});

it("each constellation view offers the one honest action for this visitor", async () => {
  const none = await open({ hash: "#engineering" });
  try {
    expect(text(none.doc.getElementById("settle-action"))).toBe("Place your star in Engineering");
  } finally {
    none.close();
  }
  const free = await newStar();
  const a = await open({ hash: "#engineering", cookie: free.cookie });
  try {
    expect(text(a.doc.getElementById("settle-action"))).toBe("Study in Engineering");
  } finally {
    a.close();
  }
  const elsewhere = await newStar("science");
  const b = await open({ hash: "#engineering", cookie: elsewhere.cookie });
  try {
    expect(text(b.doc.getElementById("settle-action"))).toBe("Move my star to Engineering");
    // Moving changes the subject, never makes a second star.
    expect(text(b.doc.getElementById("dock-note"))).toMatch(/still have one star/i);
  } finally {
    b.close();
  }
  const here = await newStar("engineering");
  const c = await open({ hash: "#engineering", cookie: here.cookie });
  try {
    expect(c.doc.getElementById("settle-action")?.hidden).toBe(true);
    expect(text(c.doc.getElementById("leave-area"))).toBe("Leave Engineering");
    expect(c.doc.querySelector(`#sky g.star[data-id="${here.id}"]`)?.classList.contains("away")).toBe(false);
  } finally {
    c.close();
  }
});

it("joining a constellation from its view goes through the server, and the star appears there", async () => {
  const { cookie, id } = await newStar();
  const posts: Array<{ url: string; body: string }> = [];
  const p = await open({
    hash: "#health",
    cookie,
    fetch: async (url: string, init?: { body?: string }) => {
      posts.push({ url, body: init?.body ?? "" });
      if (url === "/api/star/constellation") return { ok: true, json: async () => ({ star: { id, x: 0.25, y: 0.75, constellation: "health" } }) };
      return { ok: true, json: async () => ({ hasStar: true, newStarIds: [], newCount: 0 }) };
    },
  });
  try {
    (p.doc.getElementById("settle-action") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(posts.filter((x) => x.url !== "/api/here")).toEqual([{ url: "/api/star/constellation", body: JSON.stringify({ constellation: "health" }) }]);
    expect(p.doc.body.dataset.constellation).toBe("health");
    expect(p.doc.querySelector(`#sky g.star[data-id="${id}"]`)?.classList.contains("away")).toBe(false);
  } finally {
    p.close();
  }
});

it("placing a first star from a constellation view creates it there in one request", async () => {
  const posts: Array<{ url: string; body: string }> = [];
  const p = await open({
    hash: "#science",
    fetch: async (url: string, init?: { body?: string }) => {
      posts.push({ url, body: init?.body ?? "" });
      if (url === "/api/star") return { ok: true, json: async () => ({ star: { id: "new-one", x: 0.2, y: 0.2, constellation: "science" } }) };
      return { ok: true, json: async () => ({ hasStar: false }) };
    },
  });
  try {
    (p.doc.getElementById("settle-action") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(posts.map((x) => x.url)).toEqual(["/api/star"]);
    expect(JSON.parse(posts[0]!.body).constellation).toBe("science");
    expect(p.doc.body.dataset.constellation).toBe("science");
  } finally {
    p.close();
  }
});

it("tapping open space in the Common Room places the first star where the tap was", async () => {
  const posts: Array<{ url: string; body: string }> = [];
  const p = await open({
    sync: { stars: [{ id: "landmark", x: 0.5, y: 0.5, brightness: "faint", constellation: null }], liveStarIds: [] },
    fetch: async (url: string, init?: { body?: string }) => {
      posts.push({ url, body: init?.body ?? "" });
      if (url === "/api/star") return { ok: true, json: async () => ({ star: { id: "tapped", ...JSON.parse(init!.body!), constellation: null } }) };
      return { ok: true, json: async () => ({ hasStar: false }) };
    },
  });
  try {
    // jsdom has no layout: give the stage a 1000 by 1000 box, so one SVG
    // unit is one pixel, and let the lounge re-measure it.
    const stage = p.doc.getElementById("stage")!;
    (stage as unknown as { getBoundingClientRect: () => object }).getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 });
    p.window.dispatchEvent(new p.window.Event("resize"));
    await new Promise((r) => setTimeout(r, 20));
    // Tap exactly where the star stored at (0.5, 0.5) is drawn.
    const at = (p.doc.querySelector('#sky g.star[data-id="landmark"]') as SVGGElement).style.transform.match(/translate\(([\d.]+)px, ([\d.]+)px\)/)!;
    stage.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true, clientX: Number(at[1]), clientY: Number(at[2]) }));
    await new Promise((r) => setTimeout(r, 20));
    expect(posts.map((x) => x.url)).toEqual(["/api/star"]);
    const body = JSON.parse(posts[0]!.body);
    expect(body.x).toBeCloseTo(0.5, 2);
    expect(body.y).toBeCloseTo(0.5, 2);
    expect(body.constellation).toBeUndefined();
    expect(text(p.doc.querySelector('#sky g.star[data-id="tapped"] .star-you'))).toBe("you");
  } finally {
    p.close();
  }
});

it("the own star moves with the keyboard, saved through the server", async () => {
  const { cookie, id } = await newStar();
  const moves: string[] = [];
  const p = await open({
    cookie,
    fetch: async (url: string, init?: { body?: string }) => {
      if (url === "/api/star/move") moves.push(init!.body!);
      return { ok: true, json: async () => ({ star: { id, ...JSON.parse(init?.body ?? "{}"), constellation: null } }) };
    },
  });
  try {
    const own = p.doc.querySelector(`#sky g.star[data-id="${id}"]`)!;
    expect(own.getAttribute("tabindex")).toBe("0");
    const before = Number(own.getAttribute("data-x"));
    own.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    expect(moves).toHaveLength(1);
    expect(JSON.parse(moves[0]!).x).toBeGreaterThan(before);
  } finally {
    p.close();
  }
});

it("the live line and the doorways update from live events, without a reload", async () => {
  const p = await open({ sync: { stars: [], liveStarIds: [], liveByConstellation: zero(), tracesByConstellation: zero(), unsettledTraces: 0 } });
  try {
    expect(text(p.doc.getElementById("live-line"))).toBe("Nobody studying right now · No traces yet");
    p.listeners.star?.({ data: JSON.stringify({ change: "created", star: { id: "x1", x: 0.7, y: 0.75, brightness: "bright", constellation: "arts" } }) });
    p.listeners.live?.({ data: JSON.stringify({ starIds: ["x1"], liveByConstellation: { ...zero(), arts: 1 }, tracesByConstellation: { ...zero(), arts: 1 }, unsettledTraces: 0 }) });
    expect(text(p.doc.getElementById("live-line"))).toBe("1 studying now · 1 trace");
    expect(text(p.doc.querySelector('#regions a.region[data-region="arts"] .region-live'))).toBe("1 studying now");
    expect(p.doc.querySelector('#sky g.star[data-id="x1"]')?.classList.contains("glowing")).toBe(true);
    // Going quiet: the glow fades to a recent star, it does not vanish.
    p.listeners.live?.({ data: JSON.stringify({ starIds: [], liveByConstellation: zero(), tracesByConstellation: { ...zero(), arts: 1 }, unsettledTraces: 0 }) });
    const g = p.doc.querySelector('#sky g.star[data-id="x1"]')!;
    expect(g.classList.contains("glowing")).toBe(false);
    expect(g.classList.contains("recent")).toBe(true);
  } finally {
    p.close();
  }
});

it("no fake discussion or location feature appears, not even as a disabled placeholder card", async () => {
  const p = await open();
  try {
    const app = text(p.doc.getElementById("sky-app")).toLowerCase();
    expect(app).not.toMatch(/discussion|coming soon|\bnearby\b|location|\bkm\b/);
    // Common Room chat is a real, built feature (ADR 0012's follow-on); its
    // composer is legitimately disabled until a callsign exists, which is a
    // real functional gate, not a decorative "coming soon" placeholder.
    const disabled = [...p.doc.querySelectorAll("#sky-app [disabled]")];
    expect(disabled.every((el) => el.id === "chat-input" || el.closest("#chat-form"))).toBe(true);
  } finally {
    p.close();
  }
});

it("the stage clips everything drawn in it, and nothing uses vector-effect", async () => {
  const p = await open();
  try {
    const sheet = css(p.html);
    expect(sheet).toMatch(/#stage\s*\{[^}]*overflow:\s*hidden/);
    expect(sheet).not.toMatch(/vector-effect/);
  } finally {
    p.close();
  }
});

it("colours, type, spacing and motion come from one set of tokens", async () => {
  const p = await open();
  try {
    const sheet = css(p.html);
    const root = sheet.match(/#sky-app\s*\{([^}]*)\}/)?.[1] ?? "";
    for (const token of ["--color-ink", "--color-ink-muted", "--color-live", "--color-gold", "--font-display", "--font-ui", "--font-mono", "--space-2", "--radius-1", "--dur-calm", "--ease-calm", "--glow-live"]) {
      expect(root, token).toContain(`${token}:`);
    }
    // Under reduced motion nothing in the lounge drifts, breathes or glides.
    expect(sheet).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*#sky-app \*/);
  } finally {
    p.close();
  }
});
