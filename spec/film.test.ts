import { JSDOM } from "jsdom";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";

// The arrival film, driven through the real public/sky.js against the real
// HTML the server sends. Time is faked, so a 30-second film runs in an
// instant; canvas, audio and the live stream are replaced by recorders.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");
const FILM_MS = 30_000;
const MUSIC = "/assets/arrival-film-music.mp3";

const LINES = [
  "Leaving the noise behind…",
  "Finding a quiet corner…",
  "This is a small experience before you enter the lounge…",
  "Making space to focus…",
  "Nobody here needs a name…",
  "Somewhere, someone else is studying too…",
  "Settling in…",
];

type Audio = { created: number; resumed: number; suspended: number; closed: number; gains: number[]; started: number[] };

async function loadFilm(opts: {
  storage?: Record<string, string>;
  cookie?: string;
  reducedMotion?: boolean;
  connection?: { saveData?: boolean; effectiveType?: string };
  random?: number;
} = {}) {
  const res = await fetch(new URL("/", baseUrl), { headers: opts.cookie ? { Cookie: opts.cookie } : {} });
  const dom = new JSDOM(await res.text(), { url: baseUrl, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  for (const [k, v] of Object.entries(opts.storage ?? {})) window.localStorage.setItem(k, v);

  const sources: Array<{ closed: boolean }> = [];
  const posts: string[] = [];
  const gets: string[] = [];
  const audio: Audio = { created: 0, resumed: 0, suspended: 0, closed: 0, gains: [], started: [] };

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
    createBufferSource() { return { ...node(), start: (_when: number, offset = 0) => { audio.started.push(offset); } }; }
    decodeAudioData() { return Promise.resolve({ duration: 30 }); }
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
      else gets.push(url);
      return { ok: true, json: async () => ({ hasStar: false }), arrayBuffer: async () => new ArrayBuffer(8) };
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
    gets,
    streamsOpen: () => sources.filter((s) => !s.closed).length,
    enter: () => $("arrival-submit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    key: (key: string) => doc.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true })),
    skip: () => $("film-skip")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    replay: () => $("replay-arrival")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
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

// A returning browser goes straight into the lounge, so the lounge offers
// the way back: the arrival screen, then the whole film again, on request.
const RETURNING = { "overlap-arrival-v2": "entered", "overlap-film-seen": "1" };

it("a returning visitor can replay the arrival and its film, then return with the same identity", async () => {
  const created = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = created.headers.get("set-cookie")!.split(";")[0]!;
  const starId = ((await created.json()) as { star: { id: string } }).star.id;
  const f = await loadFilm({ storage: RETURNING, cookie });
  try {
    expect(f.entered()).toBe(true);
    expect(f.streamsOpen()).toBe(1);
    const checkIns = f.posts.length;

    f.replay();
    expect(f.entered()).toBe(false);
    expect(f.filmShown()).toBe(false);
    expect(f.streamsOpen()).toBe(0);
    expect(f.doc.getElementById("arrival")?.getAttribute("aria-hidden")).not.toBe("true");
    expect(f.doc.getElementById("sky-app")?.getAttribute("aria-hidden")).toBe("true");
    expect(f.doc.activeElement).toBe(f.doc.getElementById("arrival-submit"));
    // The arrival screen is only a picture: no stream, no check-in.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.streamsOpen()).toBe(0);
    expect(f.posts).toHaveLength(checkIns);

    // Enter plays the full film again, even though it was seen before.
    f.enter();
    expect(f.filmShown()).toBe(true);
    expect(f.streamsOpen()).toBe(0);
    expect(f.posts).toHaveLength(checkIns);

    f.skip();
    expect(f.entered()).toBe(true);
    expect(f.streamsOpen()).toBe(1);
    // Only check-ins were ever sent: nothing created, renamed or reset.
    expect(f.posts.length).toBeGreaterThan(checkIns);
    expect(new Set(f.posts)).toEqual(new Set(["/api/here"]));
    expect(f.window.localStorage.getItem("overlap-arrival-v2")).toBe("entered");
    expect(f.window.localStorage.getItem("overlap-film-seen")).toBe("1");
    expect(f.doc.body.dataset.ownStar).toBe(starId);
  } finally {
    f.close();
  }
  // The server still recognises the same browser as the same star.
  const page = await (await fetch(new URL("/", baseUrl), { headers: { Cookie: cookie } })).text();
  expect(page).toContain(`data-own-star="${starId}"`);
});

it("the replay control is a keyboard-reachable button in the lounge, labelled Replay arrival experience", async () => {
  const f = await loadFilm({ storage: RETURNING });
  try {
    const button = f.doc.getElementById("replay-arrival") as HTMLButtonElement | null;
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.type).toBe("button");
    expect(button?.hidden).toBe(false);
    expect(button?.tabIndex).toBeGreaterThanOrEqual(0);
    expect(button?.getAttribute("aria-label")).toBe("Replay arrival experience");
    // The visible words are part of its accessible name.
    expect(button?.textContent?.replace(/\s+/g, " ").trim()).toBe("Replay arrival");
    expect(button?.closest(".topbar")).not.toBeNull();
    expect(button?.closest("#arrival")).toBeNull();
  } finally {
    f.close();
  }
});

it("under reduced motion a replay shows the arrival, then Enter goes straight back with no film or music", async () => {
  const f = await loadFilm({ storage: RETURNING, reducedMotion: true });
  try {
    f.replay();
    expect(f.entered()).toBe(false);
    f.enter();
    expect(f.filmShown()).toBe(false);
    expect(f.entered()).toBe(true);
    expect(f.audio.created).toBe(0);
    expect(f.gets.filter((u) => u.includes(MUSIC))).toHaveLength(0);
  } finally {
    f.close();
  }
});

it("makes no sound and fetches no music before Enter", async () => {
  const f = await loadFilm();
  try {
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.audio.created).toBe(0);
    expect(f.gets.filter((u) => u.includes(MUSIC))).toHaveLength(0);
    f.enter();
    expect(f.audio.created).toBe(1);
    expect(f.gets.filter((u) => u.includes(MUSIC))).toHaveLength(1);
  } finally {
    f.close();
  }
});

it("the author's track starts quietly and fades in over about a second", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.audio.started).toEqual([0]);
    // Silent at the start of the ramp, then a low level, well below full.
    const ramp = f.audio.gains.slice(-2);
    expect(ramp[0]).toBe(0);
    expect(ramp[1]).toBeGreaterThan(0);
    expect(ramp[1]).toBeLessThanOrEqual(0.5);
  } finally {
    f.close();
  }
});

for (const [name, connection] of [
  ["Save-Data", { saveData: true }],
  ["2g", { effectiveType: "2g" }],
  ["slow-2g", { effectiveType: "slow-2g" }],
] as const) {
  it(`on ${name} there is no film and no music, straight into the lounge`, async () => {
    const f = await loadFilm({ connection });
    try {
      f.enter();
      expect(f.filmShown()).toBe(false);
      expect(f.entered()).toBe(true);
      expect(f.audio.created).toBe(0);
      expect(f.gets.filter((u) => u.includes(MUSIC))).toHaveLength(0);
    } finally {
      f.close();
    }
  });
}

it("music fades out and stops when the film ends, so the lounge is quiet", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(f.audio.started).toHaveLength(1);
    f.skip();
    expect(f.audio.gains.at(-1)).toBe(0);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(f.audio.closed).toBe(1);
    expect(f.audio.started).toHaveLength(1);
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
    expect(pill.textContent?.trim()).toBe("UNMUTE");
    expect(f.audio.suspended).toBe(1);
    pill.dispatchEvent(new f.window.MouseEvent("click", { bubbles: true }));
    expect(pill.getAttribute("aria-pressed")).toBe("false");
    expect(pill.textContent?.trim()).toBe("MUTE");
    expect(f.audio.resumed).toBe(1);
    pill.dispatchEvent(new f.window.MouseEvent("click", { bubbles: true }));
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

it("the mood line changes every 5 seconds, in the agreed order, the invitation once", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    const seen = [f.line()];
    // Each line fades out for 600 ms before the next appears, so sample once
    // the swap has happened, a second into each 5-second slot.
    await vi.advanceTimersByTimeAsync(1_000);
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
      seen.push(f.line());
    }
    // Six 5-second slots fit in 30 seconds: the lines run in order and
    // "Settling in…" closes the film, so the first slot pairs the first two.
    expect(seen[0]).toBe(LINES[0]);
    expect(seen.slice(1)).toEqual(LINES.slice(2));
    for (const line of seen) expect(line.toLowerCase()).not.toMatch(/loading|ready/);
    expect(seen.filter((l) => l.startsWith("This is a small experience"))).toHaveLength(1);
    expect(seen.indexOf(LINES[2]!)).toBeLessThanOrEqual(2);
  } finally {
    f.close();
  }
});

it("every line is shown: the second shares the opening slot", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    expect(f.line()).toBe(LINES[0]);
    await vi.advanceTimersByTimeAsync(2_500 + 700);
    expect(f.line()).toBe(LINES[1]);
  } finally {
    f.close();
  }
});

it("the film is the author's video, full-bleed over the galaxy picture, never a drawn warp", async () => {
  const f = await loadFilm();
  try {
    const film = f.doc.getElementById("arrival-film")!;
    expect(film.querySelector("canvas")).toBeNull();
    const base = film.querySelector(".film-galaxy img");
    expect(base).not.toBeNull();
    const cloud = film.querySelector("video.film-cloud");
    expect(cloud).not.toBeNull();
    for (const attr of ["muted", "playsinline"]) expect(cloud!.hasAttribute(attr)).toBe(true);
    expect(cloud!.hasAttribute("controls")).toBe(false);
    // The cloud is never fetched before Enter.
    for (const s of cloud!.querySelectorAll("source")) expect(s.hasAttribute("src")).toBe(false);
    f.enter();
    // The film is the author's whole Luna video, silent.
    const srcs = [...cloud!.querySelectorAll("source")].map((s) => s.getAttribute("src"));
    expect(srcs).toEqual(["/assets/arrival-film-1080.webm", "/assets/arrival-film-1080.mp4"]);
  } finally {
    f.close();
  }
});

it("the film writes nothing: no POST, no live stream, until the lounge opens", async () => {
  const f = await loadFilm();
  try {
    f.enter();
    for (let t = 1_000; t < FILM_MS; t += 1_000) await vi.advanceTimersByTimeAsync(1_000);
    expect(f.posts).toEqual([]);
    expect(f.streamsOpen()).toBe(0);
    f.skip();
    expect(f.streamsOpen()).toBe(1);
  } finally {
    f.close();
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
