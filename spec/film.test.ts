import { JSDOM } from "jsdom";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";

// The arrival film, driven through the real public/sky.js against the real
// HTML the server sends. Time is faked, so a 30-second film runs in an
// instant; canvas, audio and the live stream are replaced by recorders.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");
const FILM_MS = 30_000;

const LINES = [
  "Leaving the noise behind…",
  "Finding a quiet corner…",
  "Making space to focus…",
  "Nobody here needs a name…",
  "Somewhere, someone else is studying too…",
  "Settling in…",
];

type Audio = { created: number; resumed: number; suspended: number; closed: number; gains: number[] };

async function loadFilm(opts: {
  storage?: Record<string, string>;
  reducedMotion?: boolean;
  connection?: { saveData?: boolean; effectiveType?: string };
  random?: number;
} = {}) {
  const res = await fetch(new URL("/", baseUrl));
  const dom = new JSDOM(await res.text(), { url: baseUrl, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  for (const [k, v] of Object.entries(opts.storage ?? {})) window.localStorage.setItem(k, v);

  const sources: Array<{ closed: boolean }> = [];
  const posts: string[] = [];
  const audio: Audio = { created: 0, resumed: 0, suspended: 0, closed: 0, gains: [] };

  // A minimal Web Audio stand-in: enough to build a graph and record what the
  // page asks of it (when sound starts, fades and stops).
  const param = () => {
    const p = { value: 0, setValueAtTime(v: number) { p.value = v; audio.gains.push(v); return p; }, linearRampToValueAtTime(v: number) { p.value = v; audio.gains.push(v); return p; }, exponentialRampToValueAtTime(v: number) { p.value = v; return p; }, setTargetAtTime(v: number) { p.value = v; audio.gains.push(v); return p; }, cancelScheduledValues() { return p; } };
    return p;
  };
  const node = () => ({ connect: (n: unknown) => n, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), detune: param(), type: "", buffer: null, normalize: true });
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    sampleRate = 44_100;
    destination = node();
    constructor() { audio.created++; }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBiquadFilter() { return node(); }
    createConvolver() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBuffer(ch: number, len: number) { return { getChannelData: () => new Float32Array(len), numberOfChannels: ch, length: len }; }
    resume() { audio.resumed++; this.state = "running"; return Promise.resolve(); }
    suspend() { audio.suspended++; this.state = "suspended"; return Promise.resolve(); }
    close() { audio.closed++; this.state = "closed"; return Promise.resolve(); }
  }

  const ctx2d = new Proxy({}, { get: (_t, k) => (k === "createRadialGradient" || k === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}) });
  window.HTMLCanvasElement.prototype.getContext = (() => ctx2d) as never;
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  if (opts.connection) Object.defineProperty(window.navigator, "connection", { configurable: true, value: opts.connection });
  if (opts.random !== undefined) window.Math.random = () => opts.random!;

  // jsdom's window has its own timers and Date, which vitest's fake timers
  // do not reach (a 10 s advance moved the window's Date by 1 ms). Give the
  // page the test's faked clock, so advancing time really moves the film.
  Object.assign(window, {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    // Node has no animation frames; drive them from the faked timers at 60 Hz.
    requestAnimationFrame: (cb: (t: number) => void) => globalThis.setTimeout(() => cb(globalThis.performance.now()), 16),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id),
    Date: globalThis.Date,
  });
  Object.defineProperty(window, "performance", { configurable: true, value: globalThis.performance });

  Object.assign(window, {
    AudioContext: FakeAudioContext,
    matchMedia: (q: string) => ({ matches: q.includes("prefers-reduced-motion: reduce") ? Boolean(opts.reducedMotion) : false, addEventListener() {} }),
    CSS: { escape: (s: string) => s },
    EventSource: class {
      record = { closed: false };
      constructor() { sources.push(this.record); }
      addEventListener() {}
      close() { this.record.closed = true; }
    },
    fetch: async (url: string, init?: { method?: string }) => {
      if (init?.method === "POST") posts.push(url);
      return { ok: true, json: async () => ({ hasStar: false }) };
    },
  });

  window.eval(skyJs);
  const doc = window.document;
  const $ = (id: string) => doc.getElementById(id);
  return {
    window,
    doc,
    audio,
    posts,
    streamsOpen: () => sources.filter((s) => !s.closed).length,
    enter: () => $("arrival-submit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    key: (key: string) => doc.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true })),
    skip: () => $("film-skip")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    filmShown: () => doc.body.classList.contains("filming"),
    entered: () => doc.body.classList.contains("entered"),
    line: () => ($("film-line")?.textContent ?? "").trim(),
    label: () => (doc.querySelector(".film-progress-label")?.textContent ?? "").trim(),
    close: () => window.close(),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});
afterEach(() => {
  vi.useRealTimers();
});

it("Enter shows the film at once, with Skip visible from the first second", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    expect(f.filmShown()).toBe(true);
    expect(f.entered()).toBe(false);
    const skip = f.doc.getElementById("film-skip");
    expect(skip?.textContent?.trim()).toMatch(/^SKIP/);
    expect(f.doc.activeElement).toBe(skip);
  } finally {
    f.close();
  }
});

for (const [how, act] of [
  ["the Skip button", (f: Awaited<ReturnType<typeof loadFilm>>) => f.skip()],
  ["Enter", (f: Awaited<ReturnType<typeof loadFilm>>) => f.key("Enter")],
  ["Escape", (f: Awaited<ReturnType<typeof loadFilm>>) => f.key("Escape")],
] as const) {
  it(`${how} skips the film from second 0 and opens the lounge at once`, async () => {
    const f = await loadFilm();
    try {
      f.enter();
      act(f);
      expect(f.filmShown()).toBe(false);
      expect(f.entered()).toBe(true);
      expect(f.streamsOpen()).toBe(1);
    } finally {
      f.close();
    }
  });
}

it("the film runs 30 seconds, then opens the lounge with no extra wait", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    await vi.advanceTimersByTimeAsync(FILM_MS - 100);
    expect(f.entered()).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(f.filmShown()).toBe(false);
    expect(f.entered()).toBe(true);
  } finally {
    f.close();
  }
});

it("the visitor is not glowing before the lounge opens", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    await vi.advanceTimersByTimeAsync(FILM_MS - 100);
    expect(f.streamsOpen()).toBe(0);
    expect(f.posts).not.toContain("/api/here");
    await vi.advanceTimersByTimeAsync(100);
    expect(f.streamsOpen()).toBe(1);
  } finally {
    f.close();
  }
});

it("a second entry skips the film", async () => {
  const first = await loadFilm();
  let saved: Record<string, string> = {};
  try {
    first.enter();
    first.skip();
    for (let i = 0; i < first.window.localStorage.length; i++) {
      const k = first.window.localStorage.key(i)!;
      saved[k] = first.window.localStorage.getItem(k)!;
    }
  } finally {
    first.close();
  }
  // A browser that already watched or skipped goes straight into the lounge,
  // even if it is shown the arrival screen again.
  const { "overlap-arrival-v2": _entered, ...filmOnly } = saved;
  const again = await loadFilm({ storage: filmOnly });
  try {
    again.enter();
    expect(again.filmShown()).toBe(false);
    expect(again.entered()).toBe(true);
  } finally {
    again.close();
  }
});

it("makes no sound before Enter", async () => {
  const f = await loadFilm();
  try {
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.audio.created).toBe(0);
    f.enter();
    expect(f.audio.created).toBe(1);
  } finally {
    f.close();
  }
});

it("music fades out and stops when the film ends, so the lounge is quiet", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    f.skip();
    expect(f.audio.gains.at(-1)).toBe(0);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(f.audio.closed).toBe(1);
  } finally {
    f.close();
  }
});

it("mute is an accessible pill, suspends the sound, and is remembered", async () => {
  const f = await loadFilm();
  let saved: Record<string, string> = {};
  try {
    f.enter();
    const pill = f.doc.getElementById("film-sound")!;
    expect(pill.tagName).toBe("BUTTON");
    expect(pill.getAttribute("aria-pressed")).toBe("false");
    expect(pill.textContent?.trim()).toBe("MUTE");
    pill.dispatchEvent(new f.window.MouseEvent("click", { bubbles: true }));
    expect(pill.getAttribute("aria-pressed")).toBe("true");
    expect(pill.textContent?.trim()).toBe("SOUND");
    expect(f.audio.suspended).toBe(1);
    for (let i = 0; i < f.window.localStorage.length; i++) {
      const k = f.window.localStorage.key(i)!;
      saved[k] = f.window.localStorage.getItem(k)!;
    }
  } finally {
    f.close();
  }
  const { "overlap-arrival-v2": _e, "overlap-film-seen": _s, ...muteOnly } = saved;
  const again = await loadFilm({ storage: muteOnly });
  try {
    again.enter();
    const pill = again.doc.getElementById("film-sound")!;
    expect(pill.getAttribute("aria-pressed")).toBe("true");
    expect(again.audio.created).toBe(0);
  } finally {
    again.close();
  }
});

it("under reduced motion there is no film and no music, straight into the lounge", async () => {
  const f = await loadFilm({ reducedMotion: true });
  try {
    f.enter();
    expect(f.filmShown()).toBe(false);
    expect(f.entered()).toBe(true);
    expect(f.audio.created).toBe(0);
  } finally {
    f.close();
  }
});

it("the bar is labelled ARRIVING and never says loading or ready", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    for (let t = 0; t < FILM_MS; t += 2_500) {
      const text = (f.doc.getElementById("arrival-film")?.textContent ?? "").toLowerCase();
      expect(text).not.toMatch(/loading|ready/);
      expect(f.label()).toMatch(/^ARRIVING/);
      await vi.advanceTimersByTimeAsync(2_500);
    }
  } finally {
    f.close();
  }
});

it("shows the seconds remaining, counting down", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    expect(f.doc.getElementById("film-remaining")?.textContent?.trim()).toBe("30s");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.doc.getElementById("film-remaining")?.textContent?.trim()).toBe("20s");
  } finally {
    f.close();
  }
});

it("the mood line changes every 5 seconds, using only the agreed lines", async () => {
  const f = await loadFilm({ random: 0 });
  try {
    f.enter();
    const seen = [f.line()];
    // Each line fades out for 600 ms before the next appears, so sample once
    // the swap has happened, a second into each 5-second slot.
    await vi.advanceTimersByTimeAsync(1_000);
    // Five changes fit in the film; sampling all six slots covers every line.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
      seen.push(f.line());
    }
    for (const line of seen) {
      expect(LINES).toContain(line);
      expect(line.toLowerCase()).not.toMatch(/loading|ready/);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(new Set(seen)).toEqual(new Set(LINES));
  } finally {
    f.close();
  }
});

it("a new visit starts from a different mood line", async () => {
  const first = await loadFilm({ random: 0 });
  const second = await loadFilm({ random: 0.5 });
  try {
    first.enter();
    second.enter();
    expect(first.line()).not.toBe(second.line());
  } finally {
    first.close();
    second.close();
  }
});

it("every media file the server can serve is credited in docs/credits.md", async () => {
  const credits = readFileSync("docs/credits.md", "utf8");
  const media = readdirSync("public/assets").filter((f) => /\.(mp4|webm|mov|mp3|m4a|ogg|wav|aac|flac|png|webp|jpe?g|gif|avif)$/i.test(f));
  expect(media.length).toBeGreaterThan(0);
  for (const file of media) {
    expect(credits, `${file} has no entry in docs/credits.md`).toContain(file);
    const res = await fetch(new URL(`/assets/${file}`, baseUrl));
    await res.arrayBuffer();
  }
});
