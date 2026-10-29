import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// The phone lounge's controls, checked against the real HTML and sky.js.
// They are in the page at every size; the stylesheet shows them only on a
// phone (at most 600px wide or 500px tall). Layout itself needs a real
// browser: scripts/check-mobile.ts measures it and docs/evidence keeps the
// results. These check what the controls do.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");
const PHONE = "(max-width: 600px), (max-height: 500px)";

type Sync = { stars: unknown[]; liveStarIds: string[]; liveByConstellation?: Record<string, number>; tracesByConstellation?: Record<string, number> };

async function open(opts: { hash?: string; sync?: Sync } = {}) {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  const dom = new JSDOM(html, { url: new URL(opts.hash ?? "", baseUrl).toString(), runScripts: "outside-only" });
  const { window } = dom;
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
  window.document.getElementById("arrival-submit")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.document.getElementById("film-skip")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  if (opts.sync) listeners.sync?.({ data: JSON.stringify(opts.sync) });
  const doc = window.document;
  const key = (k: string, target: EventTarget = doc) =>
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, shiftKey: false }));
  const shiftTab = (target: EventTarget) =>
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, shiftKey: true }));
  return { window, doc, html, listeners, errors, key, shiftTab, close: () => window.close() };
}

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const css = async () => {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  return html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
};

it("the phone layout applies at most 600px wide or 500px tall, landscape phones included", async () => {
  const sheet = await css();
  expect(sheet).toContain(`@media ${PHONE}`);
  // The field is sized to the dynamic viewport and the safe areas.
  const phone = sheet.slice(sheet.indexOf(`@media ${PHONE}`));
  expect(phone).toMatch(/100dvh/);
  expect(phone).toMatch(/env\(safe-area-inset-top\)/);
  expect(phone).toMatch(/env\(safe-area-inset-bottom\)/);
});

it("the phone header has a status chip and one Menu button", async () => {
  const p = await open();
  try {
    const chip = p.doc.getElementById("phone-status");
    expect(chip).not.toBeNull();
    expect(chip!.closest(".topbar")).not.toBeNull();
    expect(text(chip)).toMatch(/^Nobody studying$|^\d+ studying$/);
    const menu = p.doc.getElementById("menu-toggle") as HTMLButtonElement;
    expect(menu?.tagName).toBe("BUTTON");
    expect(menu.closest(".topbar")).not.toBeNull();
    expect(text(menu)).toBe("Menu");
    expect(menu.getAttribute("aria-haspopup")).toBe("dialog");
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(menu.getAttribute("aria-controls")).toBe("menu-sheet");
  } finally {
    p.close();
  }
});

it("the status chip counts real glowing stars, from live events", async () => {
  const p = await open({ sync: { stars: [], liveStarIds: ["a", "b"] } });
  try {
    expect(text(p.doc.getElementById("phone-status"))).toBe("2 studying");
    p.listeners.sync?.({ data: JSON.stringify({ stars: [], liveStarIds: [] }) });
    expect(text(p.doc.getElementById("phone-status"))).toBe("Nobody studying");
  } finally {
    p.close();
  }
});

it("Menu opens a sheet with Conversation, Break, Replay arrival and About, each named and labelled", async () => {
  const p = await open();
  try {
    const menu = p.doc.getElementById("menu-toggle") as HTMLButtonElement;
    const sheet = p.doc.getElementById("menu-sheet")!;
    expect(sheet.hidden).toBe(true);
    menu.click();
    expect(sheet.hidden).toBe(false);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.getAttribute("aria-label") ?? text(p.doc.getElementById(sheet.getAttribute("aria-labelledby") ?? ""))).toBeTruthy();
    const items = [...sheet.querySelectorAll(".sheet-row")];
    expect(items.map((el) => text(el))).toEqual(["Conversation", "Break", "Replay arrival", "About"]);
    for (const el of items) expect(el.querySelector("svg.tool-icon")).not.toBeNull();
    expect((items[3] as HTMLAnchorElement).getAttribute("href")).toBe("/readme/");
    // Focus moves into the sheet.
    expect(sheet.contains(p.doc.activeElement)).toBe(true);
  } finally {
    p.close();
  }
});

it("Escape closes the Menu and focus returns to the Menu button", async () => {
  const p = await open();
  try {
    const menu = p.doc.getElementById("menu-toggle") as HTMLButtonElement;
    menu.click();
    p.key("Escape");
    expect(p.doc.getElementById("menu-sheet")!.hidden).toBe(true);
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(p.doc.activeElement).toBe(menu);
  } finally {
    p.close();
  }
});

it("focus stays inside an open sheet: Tab from the last item wraps to the first, Shift+Tab from the first to the last", async () => {
  const p = await open();
  try {
    (p.doc.getElementById("menu-toggle") as HTMLButtonElement).click();
    const sheet = p.doc.getElementById("menu-sheet")!;
    const focusable = [...sheet.querySelectorAll<HTMLElement>("button, a[href]")];
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    last.focus();
    p.key("Tab", last);
    expect(p.doc.activeElement).toBe(first);
    p.shiftTab(first);
    expect(p.doc.activeElement).toBe(last);
  } finally {
    p.close();
  }
});

it("each Menu item does what the desktop control does", async () => {
  const p = await open();
  try {
    const menu = p.doc.getElementById("menu-toggle") as HTMLButtonElement;
    const row = (name: string) => [...p.doc.querySelectorAll<HTMLElement>("#menu-sheet .sheet-row")].find((el) => text(el) === name)!;

    menu.click();
    row("Conversation").click();
    expect(p.doc.getElementById("menu-sheet")!.hidden).toBe(true);
    expect(p.doc.getElementById("chat-panel")!.hidden).toBe(false);
    // Closing the conversation returns focus to the Menu that led to it.
    p.key("Escape");
    expect(p.doc.getElementById("chat-panel")!.hidden).toBe(true);
    expect(p.doc.activeElement).toBe(menu);

    menu.click();
    row("Break").click();
    expect(p.doc.getElementById("break-panel")!.hidden).toBe(false);
    p.key("Escape");
    expect(p.doc.getElementById("break-panel")!.hidden).toBe(true);
    expect(p.doc.activeElement).toBe(menu);

    menu.click();
    row("Replay arrival").click();
    expect(p.doc.body.classList.contains("entered")).toBe(false);
    expect(p.doc.activeElement).toBe(p.doc.getElementById("arrival-submit"));
  } finally {
    p.close();
  }
});

it("the place chooser lists the six places with their counts and marks the current one", async () => {
  const live = { science: 0, engineering: 2, business: 0, health: 1, arts: 0 };
  const p = await open({ sync: { stars: [], liveStarIds: ["a", "b", "c"], liveByConstellation: live } });
  try {
    const chooser = p.doc.getElementById("place-toggle") as HTMLButtonElement;
    expect(chooser?.tagName).toBe("BUTTON");
    expect(text(chooser)).toMatch(/^Common Room/);
    expect(chooser.getAttribute("aria-expanded")).toBe("false");
    chooser.click();
    const sheet = p.doc.getElementById("place-sheet")!;
    expect(sheet.hidden).toBe(false);
    expect(sheet.getAttribute("role")).toBe("dialog");
    const rows = [...sheet.querySelectorAll<HTMLAnchorElement>("a.sheet-row")];
    expect(rows.map((r) => text(r.querySelector(".sheet-row-name")))).toEqual(["Common Room", "Science", "Engineering", "Business", "Health", "Arts & Society"]);
    expect(rows.map((r) => text(r.querySelector(".sheet-row-count")))).toEqual(["3 studying", "Quiet", "2 studying", "Quiet", "1 studying", "Quiet"]);
    expect(rows.filter((r) => r.getAttribute("aria-current") === "page").map((r) => r.dataset.view)).toEqual(["common"]);
    expect(sheet.contains(p.doc.activeElement)).toBe(true);
  } finally {
    p.close();
  }
});

it("choosing a place changes the view in place, closes the chooser and renames it", async () => {
  const p = await open();
  try {
    const chooser = p.doc.getElementById("place-toggle") as HTMLButtonElement;
    chooser.click();
    const eng = p.doc.querySelector<HTMLAnchorElement>('#place-sheet a.sheet-row[data-view="engineering"]')!;
    eng.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true, button: 0 }));
    expect(p.doc.body.dataset.view).toBe("engineering");
    expect(p.window.location.hash).toBe("#engineering");
    expect(p.doc.getElementById("place-sheet")!.hidden).toBe(true);
    expect(text(chooser)).toMatch(/^Engineering/);
    expect(p.doc.activeElement).toBe(chooser);
    chooser.click();
    expect(p.doc.querySelector('#place-sheet a.sheet-row[aria-current="page"]')?.getAttribute("data-view")).toBe("engineering");
    p.key("Escape");
    expect(p.doc.getElementById("place-sheet")!.hidden).toBe(true);
    expect(p.doc.activeElement).toBe(chooser);
  } finally {
    p.close();
  }
});

it("a quiet line names the place and its traces, for the phone field", async () => {
  const p = await open({ sync: { stars: [], liveStarIds: [], tracesByConstellation: { science: 4, engineering: 0, business: 0, health: 0, arts: 0 } } });
  try {
    const line = p.doc.getElementById("phone-line")!;
    expect(line).not.toBeNull();
    expect(line.closest("#stage")).toBeNull();
    expect(text(line)).toBe("Common Room · No traces yet");
    p.window.eval('setView("science")');
    expect(text(line)).toBe("Science · 4 traces");
  } finally {
    p.close();
  }
});

it("the desktop controls are all still there for wider screens", async () => {
  const p = await open();
  try {
    for (const id of ["chat-toggle", "break-toggle", "replay-arrival"]) expect(p.doc.getElementById(id)?.closest(".tools")).not.toBeNull();
    expect(p.doc.querySelectorAll(".lounge-nav a.nav-link")).toHaveLength(6);
    expect(p.doc.querySelector(".hero #view-title")).not.toBeNull();
    expect(p.errors).toEqual([]);
  } finally {
    p.close();
  }
});
