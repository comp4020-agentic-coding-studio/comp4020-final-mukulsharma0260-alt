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

// ---- The dock and the callsign, on a phone --------------------------------
// These load the page as a phone: matchMedia answers true for the phone
// query only.
async function openPhone(opts: { cookie?: string; sync?: Sync; fetchImpl?: (url: string, init?: { method?: string; body?: string }) => Promise<unknown> } = {}) {
  const html = await (await fetch(new URL("/", baseUrl), { headers: opts.cookie ? { Cookie: opts.cookie } : {} })).text();
  const dom = new JSDOM(html, { url: baseUrl, runScripts: "outside-only" });
  const { window } = dom;
  const listeners: Record<string, (e: { data: string }) => void> = {};
  Object.assign(window, {
    matchMedia: (q: string) => ({ matches: q === PHONE, addEventListener() {} }),
    CSS: { escape: (s: string) => s },
    EventSource: class {
      addEventListener(type: string, cb: (e: { data: string }) => void) { listeners[type] = cb; }
      close() {}
    },
    fetch: opts.fetchImpl ?? (async () => ({ ok: true, json: async () => ({ hasStar: false }) })),
  });
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  window.eval(skyJs);
  window.document.getElementById("arrival-submit")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.document.getElementById("film-skip")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  if (opts.sync) listeners.sync?.({ data: JSON.stringify(opts.sync) });
  const doc = window.document;
  const key = (k: string) => doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true }));
  return { window, doc, listeners, key, close: () => window.close() };
}

async function newStar(): Promise<{ cookie: string; id: string }> {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const { star } = await res.json();
  return { cookie: res.headers.get("set-cookie")!.split(";")[0]!, id: star.id };
}

it("with no star, the collapsed dock shows one thing: Place your star", async () => {
  const p = await openPhone();
  try {
    const dock = p.doc.querySelector(".dock")!;
    expect(dock.getAttribute("data-expanded")).toBe("false");
    const summary = p.doc.getElementById("dock-summary")!;
    expect(text(summary)).toBe("Place your star");
    expect(summary.tagName).toBe("BUTTON");
  } finally {
    p.close();
  }
});

it("with a star, the collapsed dock says it is glowing, and its toggle expands and collapses it", async () => {
  const { cookie, id } = await newStar();
  // A real snapshot carries the visitor's own star as well as its live id.
  const p = await openPhone({ cookie, sync: { stars: [{ id, x: 0.5, y: 0.5, brightness: "bright", constellation: null }], liveStarIds: [id] } });
  try {
    const dock = p.doc.querySelector(".dock")!;
    const summary = p.doc.getElementById("dock-summary") as HTMLButtonElement;
    expect(text(summary)).toBe("Your star is glowing");
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    expect(summary.getAttribute("aria-controls")).toBe("dock-body");
    expect(p.doc.getElementById("dock-body")!.hidden).toBe(true);
    summary.click();
    expect(dock.getAttribute("data-expanded")).toBe("true");
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    expect(p.doc.getElementById("dock-body")!.hidden).toBe(false);
    // The move hint and the constellation action are in the expanded dock.
    expect(text(p.doc.getElementById("dock-body"))).toMatch(/drag your star, or select it and use the arrow keys/i);
    // Escape collapses it and focus returns to the toggle.
    p.key("Escape");
    expect(dock.getAttribute("data-expanded")).toBe("false");
    expect(p.doc.activeElement).toBe(summary);
  } finally {
    p.close();
  }
});

it("the legend and Past traces sit in their own collapsible section of the dock", async () => {
  const { cookie } = await newStar();
  const p = await openPhone({ cookie });
  try {
    (p.doc.getElementById("dock-summary") as HTMLButtonElement).click();
    const details = p.doc.querySelector(".dock details.legend-section")!;
    expect(details).not.toBeNull();
    expect(details.querySelector(".legend")).not.toBeNull();
    expect(details.querySelector("#traces-toggle")).not.toBeNull();
    expect(text(details.querySelector("summary"))).toBe("What the light means");
  } finally {
    p.close();
  }
});

it("on a phone the callsign form is not in the dock; it is in the conversation, hidden until a first try to post", async () => {
  const p = await openPhone();
  try {
    const form = p.doc.getElementById("callsign-form")!;
    expect(form.closest(".dock")).toBeNull();
    expect(form.closest("#chat-panel")).not.toBeNull();
    p.doc.getElementById("menu-toggle")!.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));
    p.doc.querySelector<HTMLElement>('#menu-sheet [data-menu="chat"]')!.click();
    const panel = p.doc.getElementById("callsign-panel")!;
    expect(panel.hidden).toBe(true);
    // The composer is usable; trying to send is what asks for a callsign.
    const input = p.doc.getElementById("chat-input") as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    input.value = "hello";
    p.doc.getElementById("chat-form")!.dispatchEvent(new p.window.Event("submit", { bubbles: true, cancelable: true }));
    expect(panel.hidden).toBe(false);
    expect(p.doc.activeElement).toBe(p.doc.getElementById("callsign-input"));
    const save = form.querySelector("button[type=submit]")!;
    expect(text(save)).toBe("Save callsign");
    // The message is kept for after the callsign is saved.
    expect(input.value).toBe("hello");
  } finally {
    p.close();
  }
});

it("saving a callsign from the conversation sends the waiting message, with no other free text", async () => {
  const calls: Array<{ url: string; body?: string }> = [];
  const p = await openPhone({
    fetchImpl: async (url, init) => {
      calls.push({ url, body: init?.body });
      if (url === "/api/callsign") return { ok: true, json: async () => ({ callsign: { callsign: "nightowl" } }) };
      return { ok: true, json: async () => ({ hasStar: false }) };
    },
  });
  try {
    p.doc.getElementById("menu-toggle")!.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));
    p.doc.querySelector<HTMLElement>('#menu-sheet [data-menu="chat"]')!.click();
    const input = p.doc.getElementById("chat-input") as HTMLTextAreaElement;
    input.value = "hello";
    p.doc.getElementById("chat-form")!.dispatchEvent(new p.window.Event("submit", { bubbles: true, cancelable: true }));
    (p.doc.getElementById("callsign-input") as HTMLInputElement).value = "nightowl";
    p.doc.getElementById("callsign-form")!.dispatchEvent(new p.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.map((c) => c.url)).toEqual(["/api/callsign", "/api/message"]);
    expect(JSON.parse(calls[1]!.body!)).toMatchObject({ room: "common", body: "hello" });
    expect(p.doc.getElementById("callsign-panel")!.hidden).toBe(true);
    expect(p.doc.activeElement).toBe(input);
  } finally {
    p.close();
  }
});

it("the conversation is a full-screen sheet on a phone with a Close button, and keeps focus inside", async () => {
  const sheet = await css();
  const phone = sheet.slice(sheet.indexOf(`@media ${PHONE}`));
  expect(phone).toMatch(/\.chat-panel[^{]*\{[^}]*inset:\s*0/);
  const p = await openPhone();
  try {
    p.doc.getElementById("menu-toggle")!.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));
    p.doc.querySelector<HTMLElement>('#menu-sheet [data-menu="chat"]')!.click();
    const close = p.doc.getElementById("chat-close")!;
    expect(close.getAttribute("aria-label")).toMatch(/close/i);
    close.focus();
    // Close is the first stop; Shift+Tab from it wraps to the last control.
    p.doc.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    expect(p.doc.getElementById("chat-panel")!.contains(p.doc.activeElement)).toBe(true);
    expect(p.doc.activeElement).not.toBe(close);
  } finally {
    p.close();
  }
});

it("on wider screens the callsign button says Save callsign and the form stays in the dock", async () => {
  const p = await open();
  try {
    const form = p.doc.getElementById("callsign-form")!;
    expect(form.closest(".dock")).not.toBeNull();
    expect(text(form.querySelector("button[type=submit]"))).toBe("Save callsign");
    expect(text(p.doc.getElementById("sky-app"))).not.toMatch(/Enter the Lounge/);
  } finally {
    p.close();
  }
});

it("No name, no profile appears at most once, and never in the collapsed phone dock", async () => {
  for (const o of [open, openPhone]) {
    const p = await o();
    try {
      const all = text(p.doc.getElementById("sky-app"));
      expect((all.match(/no name, no profile/gi) ?? []).length).toBeLessThanOrEqual(1);
    } finally {
      p.close();
    }
  }
  const p = await openPhone();
  try {
    // What a collapsed dock shows is its summary alone.
    const body = p.doc.getElementById("dock-body");
    expect(body?.hidden).toBe(true);
    expect(text(p.doc.getElementById("dock-summary"))).not.toMatch(/no name, no profile/i);
  } finally {
    p.close();
  }
});

// ---- Constellation names on a phone ----------------------------------------
it("on a phone each name anchors toward the middle so neighbours never meet: left, centre or right of its region", async () => {
  const p = await openPhone();
  try {
    const anchor = (id: string) => p.doc.querySelector<HTMLElement>(`#regions a.region[data-region="${id}"]`)!.style.transform;
    expect(anchor("science")).toBe("");
    expect(anchor("health")).toBe("");
    expect(anchor("engineering")).toBe("translateX(-50%)");
    expect(anchor("business")).toBe("translateX(-100%)");
    expect(anchor("arts")).toBe("translateX(-100%)");
  } finally {
    p.close();
  }
});

it("on wider screens every name still starts at its region's left edge", async () => {
  const p = await open();
  try {
    for (const a of p.doc.querySelectorAll<HTMLElement>("#regions a.region")) expect(a.style.transform).toBe("");
  } finally {
    p.close();
  }
});

it("on a phone the names stay 12px with tighter spacing, and the outlines are quieter", async () => {
  const sheet = await css();
  const phone = sheet.slice(sheet.indexOf(`@media ${PHONE}`));
  expect(phone).toMatch(/\.region-name\s*\{[^}]*letter-spacing:\s*0\.06em/);
  expect(phone).toMatch(/\.fig-edge\s*\{[^}]*stroke:\s*rgba\(196, 200, 230, 0\.0\d\)/);
  // 12px is the floor: the phone rule never shrinks the names below it.
  expect(phone).not.toMatch(/\.region-name\s*\{[^}]*font-size:\s*(0\.[0-6]\d*rem|1[01]px)/);
});
