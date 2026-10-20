import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// The chat drawer's client-side behaviour, checked the same way
// spec/break.test.ts checks the Break drawer: a real page, sky.js run
// against it, and a faked EventSource/fetch. XSS safety here means the
// drawer only ever uses textContent to render a message, never innerHTML or
// a template string interpolated into markup.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

async function open(opts: { fetchImpl?: (url: string, init?: { method?: string; body?: string }) => Promise<unknown> } = {}) {
  const html = await (await fetch(new URL("/", baseUrl), {})).text();
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
    fetch: opts.fetchImpl ?? (async () => ({ ok: true, json: async () => ({ hasStar: false }) })),
  });
  window.eval(skyJs);
  return { window, doc: window.document, listeners, close: () => window.close() };
}

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

it("the Chat button opens a compact drawer, labelled as the Common Room conversation", async () => {
  const p = await open();
  try {
    const toggle = p.doc.getElementById("chat-toggle") as HTMLButtonElement;
    const panel = p.doc.getElementById("chat-panel")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(text(p.doc.getElementById("chat-title"))).toBe("Common Room conversation");
  } finally {
    p.close();
  }
});

it("the composer is disabled with an honest note until a callsign exists", async () => {
  const p = await open();
  try {
    expect(p.doc.body.dataset.hasCallsign).toBe("false");
    const input = p.doc.getElementById("chat-input") as HTMLTextAreaElement;
    const submit = p.doc.querySelector("#chat-form button[type=submit]") as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(submit.disabled).toBe(true);
    expect(text(p.doc.getElementById("chat-note"))).toMatch(/choose a callsign/i);
  } finally {
    p.close();
  }
});

it("a message is rendered via textContent only: a script-like body is shown as literal text, never executed", async () => {
  const p = await open();
  try {
    const toggle = p.doc.getElementById("chat-toggle") as HTMLButtonElement;
    toggle.click();
    const payload = "<img src=x onerror=window.__xss=true>";
    p.listeners["sync"]?.({
      data: JSON.stringify({
        stars: [],
        liveStarIds: [],
        chat: [{ room: "common", messages: [{ id: "m1", callsign: "visitor-a", body: payload, createdAt: new Date().toISOString() }] }],
      }),
    });
    const list = p.doc.getElementById("chat-messages")!;
    expect(list.children).toHaveLength(1);
    const body = list.querySelector(".chat-message-body")!;
    // The payload is present as literal text content...
    expect(body.textContent).toBe(payload);
    // ...and was never parsed as markup: no actual <img> element exists.
    expect(body.querySelector("img")).toBeNull();
    expect((p.window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
  } finally {
    p.close();
  }
});

it("a live message.created event for the common room appends a message without a reload", async () => {
  const p = await open();
  try {
    p.listeners["sync"]?.({ data: JSON.stringify({ stars: [], liveStarIds: [], chat: [{ room: "common", messages: [] }] }) });
    const list = p.doc.getElementById("chat-messages")!;
    expect(list.children).toHaveLength(0);
    p.listeners["message.created"]?.({
      data: JSON.stringify({ v: 1, room: "common", message: { id: "m2", callsign: "visitor-b", body: "hello there", createdAt: new Date().toISOString() } }),
    });
    expect(list.children).toHaveLength(1);
    expect(text(list.querySelector(".chat-message-body"))).toBe("hello there");
  } finally {
    p.close();
  }
});

it("a message.created event for a different room is never appended to the Common Room list", async () => {
  const p = await open();
  try {
    p.listeners["sync"]?.({ data: JSON.stringify({ stars: [], liveStarIds: [], chat: [{ room: "common", messages: [] }] }) });
    p.listeners["message.created"]?.({
      data: JSON.stringify({ v: 1, room: "engineering", message: { id: "m3", callsign: "visitor-c", body: "wrong room", createdAt: new Date().toISOString() } }),
    });
    expect(p.doc.getElementById("chat-messages")!.children).toHaveLength(0);
  } finally {
    p.close();
  }
});

it("the visitor's own messages are marked distinctly, not only by colour", async () => {
  const p = await open();
  try {
    p.doc.body.dataset.hasCallsign = "true";
    p.doc.body.dataset.callsign = "me-myself";
    p.listeners["sync"]?.({
      data: JSON.stringify({
        stars: [],
        liveStarIds: [],
        chat: [{ room: "common", messages: [{ id: "m4", callsign: "me-myself", body: "mine", createdAt: new Date().toISOString() }] }],
      }),
    });
    const own = p.doc.querySelector(".chat-message")!;
    expect(own.getAttribute("data-own")).toBe("true");
    expect(text(own.querySelector(".chat-message-callsign"))).toMatch(/\(you\)/);
  } finally {
    p.close();
  }
});

it("Escape closes the chat drawer and returns focus to the Chat button", async () => {
  const p = await open();
  try {
    const toggle = p.doc.getElementById("chat-toggle") as HTMLButtonElement;
    toggle.click();
    p.doc.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(p.doc.getElementById("chat-panel")?.hidden).toBe(true);
    expect(p.doc.activeElement).toBe(toggle);
  } finally {
    p.close();
  }
});

it("submitting sends room=common and a bounded idempotency key, and never a client-asserted callsign", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const p = await open({
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      if (String(url).includes("/api/message")) {
        return { ok: true, json: async () => ({ message: { id: "m5", callsign: "me-myself", body: "hi" } }) };
      }
      return { ok: true, json: async () => ({ hasStar: false }) };
    },
  });
  try {
    p.doc.body.dataset.hasCallsign = "true";
    p.doc.body.dataset.callsign = "me-myself";
    const toggle = p.doc.getElementById("chat-toggle") as HTMLButtonElement;
    toggle.click();
    // renderChatComposer() only runs on open/init in this harness, so enable
    // the inputs directly to simulate the state a real callsign set would
    // have already triggered via submitCallsign's own call to it.
    const input = p.doc.getElementById("chat-input") as HTMLTextAreaElement;
    const submit = p.doc.querySelector("#chat-form button[type=submit]") as HTMLButtonElement;
    input.disabled = false;
    submit.disabled = false;
    input.value = "a real message";
    (p.doc.getElementById("chat-form") as HTMLFormElement).dispatchEvent(new p.window.Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    const call = calls.find((c) => c.url.includes("/api/message"));
    expect(call).toBeTruthy();
    const sent = JSON.parse(call!.body);
    expect(sent.room).toBe("common");
    expect(sent.body).toBe("a real message");
    expect(typeof sent.idempotencyKey).toBe("string");
    expect(sent.idempotencyKey.length).toBeGreaterThan(0);
    expect(sent.idempotencyKey.length).toBeLessThanOrEqual(64);
    expect(sent).not.toHaveProperty("callsign");
  } finally {
    p.close();
  }
});
