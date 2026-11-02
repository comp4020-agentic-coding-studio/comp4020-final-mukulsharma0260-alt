import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// A constellation's view must draw its figure and stars as soon as it
// opens, from current state, even if the stage measured 0x0 at that moment
// (hidden behind the arrival, or mid-way through an iOS toolbar or rotation
// change). It must never fall back to a desktop-sized frame and stay there.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

type Rect = { left: number; top: number; width: number; height: number };
const rect = (r: Rect) => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} });

async function open(opts: { hash?: string } = {}) {
  const created = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = created.headers.get("set-cookie")!.split(";")[0]!;
  const id = ((await created.json()) as { star: { id: string } }).star.id;
  await fetch(new URL("/api/star/constellation", baseUrl), {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ constellation: "science" }),
  });
  const html = await (await fetch(new URL("/", baseUrl), { headers: { Cookie: cookie } })).text();
  const dom = new JSDOM(html, { url: new URL(opts.hash ?? "", baseUrl).toString(), runScripts: "outside-only" });
  const { window } = dom;
  const observers: Array<() => void> = [];
  const listeners: Record<string, (e: { data: string }) => void> = {};
  Object.assign(window, {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    CSS: { escape: (s: string) => s },
    EventSource: class {
      addEventListener(type: string, cb: (e: { data: string }) => void) { listeners[type] = cb; }
      close() {}
    },
    // A ResizeObserver this test can fire by hand.
    ResizeObserver: class {
      cb: () => void;
      constructor(cb: () => void) { this.cb = cb; observers.push(() => this.cb()); }
      observe() {}
      disconnect() {}
    },
    fetch: async () => ({ ok: true, json: async () => ({ hasStar: true }) }),
  });
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  const doc = window.document;
  // The stage starts with no size, as it does behind the arrival screen.
  let stageRect = rect({ left: 0, top: 0, width: 0, height: 0 });
  const stage = doc.getElementById("stage")!;
  stage.getBoundingClientRect = () => stageRect;
  window.eval(skyJs);
  doc.getElementById("arrival-submit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  doc.getElementById("film-skip")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const setStage = (w: number, h: number) => { stageRect = rect({ left: 0, top: 0, width: w, height: h }); };
  const fireResize = () => observers.forEach((f) => f());
  const viewBoxW = () => Number(doc.getElementById("sky")!.getAttribute("viewBox")!.split(" ")[2]);
  return { window, doc, id, listeners, setStage, fireResize, viewBoxW, close: () => window.close() };
}

const translate = (g: Element) => {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec((g as HTMLElement).style.transform);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};

it("a view opened while the stage is 0x0 is redrawn to the real stage size once it has one", async () => {
  const p = await open();
  try {
    p.window.eval('setView("science")');
    // The stage gets its real phone size, with no window resize event.
    p.setStage(390, 700);
    p.fireResize();
    // The frame matches the stage's shape: 1000 tall, as wide as 390:700.
    expect(p.viewBoxW()).toBe(Math.round((1000 * 390) / 700));
    const own = p.doc.querySelector(`#stars .star[data-id="${p.id}"]`)!;
    const pos = translate(own);
    expect(pos).not.toBeNull();
    expect(Number.isFinite(pos!.x) && Number.isFinite(pos!.y)).toBe(true);
    // Inside the drawn frame, not off to the right of a 1600-wide desktop one.
    expect(pos!.x).toBeGreaterThanOrEqual(0);
    expect(pos!.x).toBeLessThanOrEqual(p.viewBoxW());
    expect(pos!.y).toBeGreaterThanOrEqual(0);
    expect(pos!.y).toBeLessThanOrEqual(1000);
  } finally {
    p.close();
  }
});

it("opening Science draws its figure and its own settled star, with finite positions", async () => {
  const p = await open();
  try {
    p.setStage(1440, 800);
    p.fireResize();
    p.window.eval('setView("science")');
    expect(p.doc.querySelectorAll('#figures [data-figure="science"]').length).toBe(1);
    const shown = [...p.doc.querySelectorAll("#stars .star")].filter((g) => !g.classList.contains("away"));
    expect(shown.map((g) => g.getAttribute("data-id"))).toContain(p.id);
    for (const g of shown) {
      const t = translate(g);
      expect(t && Number.isFinite(t.x) && Number.isFinite(t.y)).toBe(true);
    }
  } finally {
    p.close();
  }
});

it("a constellation with no stars settled says so plainly, not a blank field", async () => {
  const p = await open();
  try {
    p.setStage(1440, 800);
    p.fireResize();
    p.window.eval('setView("health")');
    const empty = p.doc.getElementById("view-empty")!;
    expect(empty.hidden).toBe(false);
    expect((empty.textContent ?? "").trim()).toBe("No stars settled here yet.");
    p.window.eval('setView("science")');
    expect(empty.hidden).toBe(true);
    p.window.eval('setView("common")');
    expect(empty.hidden).toBe(true);
  } finally {
    p.close();
  }
});

it("a stage with no size never leaves a desktop-sized frame behind", async () => {
  const p = await open({ hash: "#science" });
  try {
    // Entered straight into #science while the stage was 0x0.
    p.setStage(390, 700);
    p.fireResize();
    expect(p.viewBoxW()).not.toBe(1600);
  } finally {
    p.close();
  }
});
