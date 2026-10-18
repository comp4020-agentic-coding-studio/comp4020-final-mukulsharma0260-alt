import { JSDOM } from "jsdom";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// The Break drawer: real music the visitor starts themselves, and a
// listener count that is only ever made of entered stars with a visible tab.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

const MODES = [
  ["calm", "Calm", "/assets/audio/calm.mp3"],
  ["focus", "Focus", "/assets/audio/focus.mp3"],
  ["energy", "Energy", "/assets/audio/energy.mp3"],
  ["deep-space", "Deep Space", "/assets/audio/horror.mp3"],
  ["night-walk", "Night Walk", "/assets/audio/beat-sk.mp3"],
] as const;

async function open(opts: { cookie?: string; fetch?: (url: string, init?: { body?: string }) => Promise<unknown> } = {}) {
  const html = await (await fetch(new URL("/", baseUrl), { headers: opts.cookie ? { Cookie: opts.cookie } : {} })).text();
  const dom = new JSDOM(html, { url: baseUrl, runScripts: "outside-only" });
  const { window } = dom;
  window.localStorage.setItem("overlap-arrival-v2", "entered");
  window.localStorage.setItem("overlap-film-seen", "1");
  const listeners: Record<string, (e: { data: string }) => void> = {};
  const media = { plays: [] as string[], pauses: 0 };
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
  window.HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    media.plays.push(this.getAttribute("src") ?? "");
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    this.dispatchEvent(new window.Event("play"));
    return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
    media.pauses++;
    Object.defineProperty(this, "paused", { configurable: true, value: true });
    this.dispatchEvent(new window.Event("pause"));
  };
  window.eval(skyJs);
  return { window, doc: window.document, listeners, media, close: () => window.close() };
}

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

it("the Break button opens a compact drawer; nothing plays until Play is pressed", async () => {
  const p = await open();
  try {
    const toggle = p.doc.getElementById("break-toggle") as HTMLButtonElement;
    const panel = p.doc.getElementById("break-panel")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toMatch(/break/i);
    expect(panel.hidden).toBe(true);
    // No autoplay: the one audio element has no source and preloads nothing.
    const audio = p.doc.querySelectorAll("audio");
    expect(audio).toHaveLength(1);
    expect(audio[0]!.hasAttribute("autoplay")).toBe(false);
    expect(audio[0]!.getAttribute("preload")).toBe("none");
    expect(audio[0]!.hasAttribute("src")).toBe(false);
    toggle.click();
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(p.media.plays).toEqual([]);
    const modes = [...p.doc.querySelectorAll(".break-mode")].map((b) => [(b as HTMLElement).dataset.mode, text(b.querySelector(".break-mode-name"))]);
    expect(modes).toEqual(MODES.map(([id, name]) => [id, name]));
  } finally {
    p.close();
  }
});

it("one track plays at a time, and the drawer shows which one and whether it is playing", async () => {
  const p = await open();
  try {
    (p.doc.getElementById("break-toggle") as HTMLButtonElement).click();
    (p.doc.querySelector('.break-mode[data-mode="focus"]') as HTMLButtonElement).click();
    expect(p.media.plays).toEqual([]);
    const play = p.doc.getElementById("break-play") as HTMLButtonElement;
    play.click();
    expect(p.media.plays).toEqual(["/assets/audio/focus.mp3"]);
    expect(play.getAttribute("aria-pressed")).toBe("true");
    expect(text(p.doc.getElementById("break-now"))).toBe("Playing Focus");
    expect(p.doc.querySelector('.break-mode[data-mode="focus"]')?.getAttribute("aria-pressed")).toBe("true");
    // Choosing another mode swaps the one track rather than adding a second.
    (p.doc.querySelector('.break-mode[data-mode="calm"]') as HTMLButtonElement).click();
    expect(p.doc.querySelectorAll("audio")).toHaveLength(1);
    expect(p.media.plays.at(-1)).toBe("/assets/audio/calm.mp3");
    expect(text(p.doc.getElementById("break-now"))).toBe("Playing Calm");
    play.click();
    expect(play.getAttribute("aria-pressed")).toBe("false");
    expect(text(p.doc.getElementById("break-now"))).toBe("Paused · Calm");
  } finally {
    p.close();
  }
});

it("mute, volume, stop, close and Escape all work, and focus returns to the Break button", async () => {
  const p = await open();
  try {
    const toggle = p.doc.getElementById("break-toggle") as HTMLButtonElement;
    toggle.click();
    (p.doc.getElementById("break-play") as HTMLButtonElement).click();
    const audio = p.doc.querySelector("audio")!;
    const mute = p.doc.getElementById("break-mute") as HTMLButtonElement;
    mute.click();
    expect(audio.muted).toBe(true);
    expect(mute.getAttribute("aria-pressed")).toBe("true");
    const volume = p.doc.getElementById("break-volume") as HTMLInputElement;
    expect(volume.type).toBe("range");
    volume.value = "30";
    volume.dispatchEvent(new p.window.Event("input", { bubbles: true }));
    expect(audio.volume).toBeCloseTo(0.3);
    (p.doc.getElementById("break-stop") as HTMLButtonElement).click();
    expect(text(p.doc.getElementById("break-now"))).toBe("Stopped");
    expect(audio.hasAttribute("src")).toBe(false);
    p.doc.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(p.doc.getElementById("break-panel")?.hidden).toBe(true);
    expect(p.doc.activeElement).toBe(toggle);
    toggle.click();
    (p.doc.getElementById("break-close") as HTMLButtonElement).click();
    expect(p.doc.getElementById("break-panel")?.hidden).toBe(true);
  } finally {
    p.close();
  }
});

it("a listener count appears only from real live state, and never for zero", async () => {
  const p = await open();
  try {
    (p.doc.getElementById("break-toggle") as HTMLButtonElement).click();
    const total = p.doc.getElementById("break-listening-total")!;
    expect(total.hidden).toBe(true);
    p.listeners.live?.({ data: JSON.stringify({ starIds: [], listeningByMode: { calm: 2, focus: 0, energy: 0, "deep-space": 1, "night-walk": 0 } }) });
    expect(total.hidden).toBe(false);
    expect(text(total)).toBe("3 listening now");
    expect(text(p.doc.querySelector('.break-mode[data-mode="calm"] .break-mode-count'))).toBe("2 listening");
    expect(p.doc.querySelector<HTMLElement>('.break-mode[data-mode="focus"] .break-mode-count')?.hidden).toBe(true);
    p.listeners.live?.({ data: JSON.stringify({ starIds: [], listeningByMode: { calm: 0, focus: 0, energy: 0, "deep-space": 0, "night-walk": 0 } }) });
    expect(total.hidden).toBe(true);
  } finally {
    p.close();
  }
});

it("playing tells the server which mode, and stopping clears it", async () => {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const posts: string[] = [];
  const p = await open({
    cookie,
    fetch: async (url: string, init?: { body?: string }) => {
      if (url === "/api/listening") posts.push(init!.body!);
      return { ok: true, json: async () => ({ hasStar: true, newStarIds: [], newCount: 0 }) };
    },
  });
  try {
    (p.doc.getElementById("break-toggle") as HTMLButtonElement).click();
    (p.doc.querySelector('.break-mode[data-mode="energy"]') as HTMLButtonElement).click();
    (p.doc.getElementById("break-play") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 20));
    (p.doc.getElementById("break-stop") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toEqual([JSON.stringify({ mode: "energy" }), JSON.stringify({ mode: null })]);
  } finally {
    p.close();
  }
});

it("serves every Break track as audio/mpeg with byte ranges", async () => {
  for (const [, , src] of MODES) {
    const res = await fetch(new URL(src, baseUrl), { headers: { Range: "bytes=0-99" } });
    expect(res.status, src).toBe(206);
    expect(res.headers.get("content-type"), src).toBe("audio/mpeg");
    expect((await res.arrayBuffer()).byteLength, src).toBe(100);
  }
});

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

// Each shipped track is level with the others (so switching mode never jumps
// in loudness), never clips, and carries no embedded metadata.
it.skipIf(!hasFfmpeg)("every Break track is loudness-matched, unclipped and stripped of metadata", { timeout: 120_000 }, () => {
  for (const [, , src] of MODES) {
    const file = `public${src}`;
    expect(existsSync(file), file).toBe(true);
    // ffmpeg writes its loudness report to stderr.
    const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 }).stderr;
    const summary = err.slice(err.lastIndexOf("Summary:"));
    const loudness = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
    const peak = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
    expect(loudness, file).toBeGreaterThan(-17);
    expect(loudness, file).toBeLessThan(-15);
    expect(peak, file).toBeLessThan(0);
    const tags = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags", "-of", "json", file], { encoding: "utf8" });
    const found = Object.keys(JSON.parse(tags).format?.tags ?? {}).filter((k) => k !== "encoder");
    expect(found, file).toEqual([]);
  }
});
