import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// The visitor's own star must win over a constellation's name when the two
// overlap: a press on the star drags it, never opens the constellation, and
// a drop on a name lands just clear of it. jsdom has no layout, so the star
// and the name are given rectangles here; the real browser check is in
// scripts/check-mobile.ts.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

type Rect = { left: number; top: number; width: number; height: number };
const rect = (r: Rect) => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} });

async function open() {
  const created = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = created.headers.get("set-cookie")!.split(";")[0]!;
  const html = await (await fetch(new URL("/", baseUrl), { headers: { Cookie: cookie } })).text();
  const dom = new JSDOM(html, { url: baseUrl, runScripts: "outside-only" });
  const { window } = dom;
  const posts: Array<{ url: string; body: { x: number; y: number } }> = [];
  Object.assign(window, {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    CSS: { escape: (s: string) => s },
    EventSource: class { addEventListener() {} close() {} },
    fetch: async (url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "POST" && url === "/api/star/move") posts.push({ url, body: JSON.parse(init.body!) });
      const star = { id: "x", x: 0.5, y: 0.5, constellation: null };
      return { ok: true, json: async () => ({ hasStar: true, star }) };
    },
  });
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  window.eval(skyJs);
  const doc = window.document;
  doc.getElementById("arrival-submit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  doc.getElementById("film-skip")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  // A 1000x1000 stage. The own star's core is centred at (500, 200), under
  // Engineering's name, which covers (430..570, 180..230).
  const stage = doc.getElementById("stage")!;
  const own = doc.querySelector<SVGGElement>("#stars .star.own")!;
  const name = doc.querySelector<HTMLElement>('#regions a.region[data-region="engineering"]')!;
  stage.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 1000, height: 1000 });
  // The star is measured by its core, as in a real browser.
  own.querySelector<SVGElement>(".star-core")!.getBoundingClientRect = () => rect({ left: 495, top: 195, width: 10, height: 10 });
  own.getBoundingClientRect = () => rect({ left: 487, top: 187, width: 26, height: 26 });
  name.getBoundingClientRect = () => rect({ left: 430, top: 180, width: 140, height: 50 });
  for (const a of doc.querySelectorAll<HTMLElement>("#regions a.region")) if (a !== name) a.getBoundingClientRect = () => rect({ left: -100, top: -100, width: 1, height: 1 });
  (window as unknown as { toStagePoint: (x: number, y: number) => { x: number; y: number } }).toStagePoint = (x, y) => ({ x: x / 1000, y: y / 1000 });

  const pointer = (type: string, target: Element, x: number, y: number) => {
    const e = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(e, "pointerId", { value: 1 });
    target.dispatchEvent(e);
    return e;
  };
  return { window, doc, own, name, stage, posts, pointer, close: () => window.close() };
}

it("a press on the own star's 44px target, where a name lies on top, starts a drag and is default-prevented", async () => {
  const p = await open();
  try {
    // 15px from the star's centre, on the name: inside the 44px target.
    const down = p.pointer("pointerdown", p.name, 515, 205);
    expect(down.defaultPrevented).toBe(true);
    expect(p.own.classList.contains("dragging")).toBe(true);
  } finally {
    p.close();
  }
});

it("a drag that starts on the own star never opens the constellation under it", async () => {
  const p = await open();
  try {
    p.pointer("pointerdown", p.name, 505, 200);
    p.pointer("pointermove", p.stage, 600, 400);
    p.pointer("pointerup", p.stage, 600, 400);
    const click = p.pointer("click", p.name, 505, 200);
    expect(click.defaultPrevented).toBe(true);
    expect(p.doc.body.dataset.view).toBe("common");
    expect(p.window.location.hash).toBe("");
  } finally {
    p.close();
  }
});

it("away from the star, the rest of the name still opens its constellation", async () => {
  const p = await open();
  try {
    // 60px from the star: outside its target, still on the name.
    const down = p.pointer("pointerdown", p.name, 445, 225);
    expect(p.own.classList.contains("dragging")).toBe(false);
    expect(down.defaultPrevented).toBe(false);
    p.pointer("click", p.name, 445, 225);
    expect(p.doc.body.dataset.view).toBe("engineering");
  } finally {
    p.close();
  }
});

it("a star dropped on a name is saved just clear of the name, as fractions", async () => {
  const p = await open();
  try {
    p.pointer("pointerdown", p.own, 500, 200);
    p.pointer("pointermove", p.stage, 470, 300);
    // Drop at (480, 200): inside the name box (430..570, 180..230). The
    // nearest clear point is above its top edge.
    p.pointer("pointermove", p.stage, 480, 200);
    p.pointer("pointerup", p.stage, 480, 200);
    await new Promise((r) => setTimeout(r, 20));
    expect(p.posts).toHaveLength(1);
    const { x, y } = p.posts[0]!.body;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(1);
    const px = x * 1000, py = y * 1000;
    const inside = px > 430 && px < 570 && py > 180 && py < 230;
    expect(inside).toBe(false);
    // Nearest edge: the top, 20px up; never the far side.
    expect(py).toBeLessThanOrEqual(180);
    expect(py).toBeGreaterThan(150);
  } finally {
    p.close();
  }
});

it("Tab reaches the own star and arrow keys still move it", async () => {
  const p = await open();
  try {
    expect(p.own.getAttribute("tabindex")).toBe("0");
    p.own.focus();
    const before = p.own.style.transform;
    p.own.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(p.own.style.transform).not.toBe(before);
  } finally {
    p.close();
  }
});

// ---- Text selection --------------------------------------------------------
it("a press on open field is default-prevented, so dragging there never starts a text selection", async () => {
  const p = await open();
  try {
    const field = p.doc.getElementById("sky")!;
    const down = p.pointer("pointerdown", field, 800, 800);
    expect(down.defaultPrevented).toBe(true);
    // An existing selection is cleared when a map gesture starts.
    let cleared = 0;
    p.window.getSelection = (() => ({ removeAllRanges: () => { cleared++; }, toString: () => "" })) as unknown as typeof p.window.getSelection;
    p.pointer("pointerdown", field, 700, 700);
    expect(cleared).toBe(1);
  } finally {
    p.close();
  }
});

it("presses on forms, buttons and links outside the field are left alone", async () => {
  const p = await open();
  try {
    for (const sel of ["#chat-input", "#callsign-input", "#chat-toggle", ".about-link"]) {
      const el = p.doc.querySelector(sel)!;
      const down = p.pointer("pointerdown", el, 10, 10);
      expect(down.defaultPrevented, sel).toBe(false);
    }
  } finally {
    p.close();
  }
});

it("the stage, its names and its figures can never be selected as text, and only the field blocks touch scrolling", async () => {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  // Comments are dropped so a rule's selector is read on its own.
  const sheet = html.slice(html.indexOf("<style>"), html.indexOf("</style>")).replace(/\/\*[\s\S]*?\*\//g, "");
  expect(sheet).toMatch(/#stage\s*\{[^}]*-webkit-user-select:\s*none[^}]*user-select:\s*none/);
  expect(sheet).toMatch(/#stage\s*\{[^}]*touch-action:\s*none/);
  // Nothing else turns off touch scrolling.
  const blockers = [...sheet.matchAll(/([^{}]+)\{[^}]*touch-action:\s*none/g)].map((m) => m[1]!.trim());
  expect(blockers).toEqual(["#stage"]);
  // The page as a whole stays selectable: /readme/, forms and messages.
  expect(sheet).not.toMatch(/(^|\n)\s*(html|body|#sky-app)\s*\{[^}]*user-select:\s*none/);
});

it("tap the star, then tap the field: the star moves there, even in a browser that sends no click after the first tap", async () => {
  const p = await open();
  try {
    // A tap on the star (WebKit sends no click after a prevented touch press).
    p.pointer("pointerdown", p.own, 500, 200);
    p.pointer("pointerup", p.stage, 500, 200);
    expect(p.own.classList.contains("picked")).toBe(true);
    // Then a tap on open field: press, release, click.
    const field = p.doc.getElementById("sky")!;
    p.pointer("pointerdown", field, 800, 700);
    p.pointer("pointerup", field, 800, 700);
    const click = p.pointer("click", field, 800, 700);
    expect(click.defaultPrevented).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(p.posts.map((m) => [Math.round(m.body.x * 1000), Math.round(m.body.y * 1000)])).toEqual([[800, 700]]);
  } finally {
    p.close();
  }
});
