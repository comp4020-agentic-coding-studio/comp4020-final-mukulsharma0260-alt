import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// Runs the real public/sky.js against the real HTML the server sends, with
// EventSource and fetch replaced by recorders, so the client's stream
// lifecycle can be checked without a browser.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

type FakeSource = { url: string; closed: boolean };

async function loadSky(opts: {
  cookie?: string;
  visibility?: "visible" | "hidden";
  checkedIn?: boolean;
  reducedMotion?: boolean;
  connection?: { saveData?: boolean; effectiveType?: string };
} = {}) {
  const res = await fetch(new URL("/", baseUrl), {
    headers: opts.cookie ? { Cookie: opts.cookie } : {},
  });
  const dom = new JSDOM(await res.text(), { url: baseUrl, runScripts: "outside-only" });
  const { window } = dom;

  let visibility = opts.visibility ?? "visible";
  Object.defineProperty(window.document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });

  const sources: FakeSource[] = [];
  const posts: string[] = [];
  if (opts.connection) {
    Object.defineProperty(window.navigator, "connection", { configurable: true, value: opts.connection });
  }
  // jsdom has no media pipeline; record load() calls instead of playing.
  let videoLoads = 0;
  window.HTMLMediaElement.prototype.load = () => {
    videoLoads++;
  };
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();

  Object.assign(window, {
    matchMedia: (query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce") ? Boolean(opts.reducedMotion) : false,
    }),
    CSS: { escape: (s: string) => s },
    EventSource: class {
      record: FakeSource;
      constructor(url: string) {
        this.record = { url, closed: false };
        sources.push(this.record);
      }
      addEventListener() {}
      close() {
        this.record.closed = true;
      }
    },
    fetch: async (url: string, init?: { method?: string }) => {
      if (init?.method === "POST") posts.push(url);
      // A successful placement, so placeStar runs to the end rather than
      // failing on a missing star before it reaches the live stream.
      if (url === "/api/star") {
        return { ok: true, json: async () => ({ star: { id: "placed-star", x: 0.5, y: 0.5, constellation: null } }) };
      }
      if (url === "/api/star/constellation") {
        return { ok: true, json: async () => ({ star: { id: "placed-star", x: 0.5, y: 0.5, constellation: "science" } }) };
      }
      return { ok: true, json: async () => ({ hasStar: false }) };
    },
  });

  if (opts.checkedIn !== false) window.localStorage.setItem("overlap-arrival-v2", "{}");

  window.eval(skyJs);

  return {
    window,
    sources,
    posts,
    // A video "loads" only when sky.js has copied data-src to src and asked
    // the element to load; until then the browser fetches nothing.
    videoRequested: () =>
      videoLoads > 0
      && [...window.document.querySelectorAll(".arrival-video source")].every((s) => s.hasAttribute("src")),
    finishLoading() {
      window.dispatchEvent(new window.Event("load"));
    },
    open: () => sources.filter((s) => !s.closed),
    setVisibility(next: "visible" | "hidden") {
      visibility = next;
      window.document.dispatchEvent(new window.Event("visibilitychange"));
    },
    checkIn() {
      window.document.getElementById("arrival-submit")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      window.document.getElementById("film-skip")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    },
    pressEscape() {
      window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      window.document.getElementById("film-skip")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    },
    close: () => window.close(),
  };
}

it("a viewer without a star still opens a live stream", async () => {
  const sky = await loadSky();
  try {
    expect(sky.open().map((s) => s.url)).toEqual(["/events"]);
  } finally {
    sky.close();
  }
});

it("does not count an un-checked-in visitor as looking at the sky", async () => {
  const sky = await loadSky({ checkedIn: false });
  try {
    expect(sky.open()).toHaveLength(0);
    sky.checkIn();
    expect(sky.open().map((s) => s.url)).toEqual(["/events"]);
  } finally {
    sky.close();
  }
});

it("uses a no-input anonymous arrival and lets Escape enter the sky", async () => {
  const sky = await loadSky({ checkedIn: false });
  try {
    const button = sky.window.document.getElementById("arrival-submit");
    expect(button?.textContent?.trim()).toBe("ENTER THE LOUNGE →");
    expect(sky.window.document.getElementById("signal-name")).toBeNull();
    expect(sky.open()).toHaveLength(0);
    sky.pressEscape();
    expect(sky.open().map((s) => s.url)).toEqual(["/events"]);
  } finally {
    sky.close();
  }
});

it("closes the stream when the tab is hidden and reopens it, checking in, when visible", async () => {
  // A check-in is for a visitor with a star; one without is covered by
  // "a visitor with no star never calls /api/here".
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const sky = await loadSky({ cookie });
  try {
    expect(sky.open()).toHaveLength(1);
    const checkInsOnEntry = sky.posts.filter((p) => p === "/api/here").length;

    sky.setVisibility("hidden");
    expect(sky.open()).toHaveLength(0);

    sky.setVisibility("visible");
    expect(sky.open()).toHaveLength(1);
    expect(sky.sources).toHaveLength(2);
    expect(sky.posts.filter((p) => p === "/api/here")).toHaveLength(checkInsOnEntry + 1);
  } finally {
    sky.close();
  }
});

it("a tab opened in the background does not connect until it becomes visible", async () => {
  const sky = await loadSky({ visibility: "hidden" });
  try {
    expect(sky.sources).toHaveLength(0);
    sky.setVisibility("visible");
    expect(sky.open()).toHaveLength(1);
  } finally {
    sky.close();
  }
});

it("the arrival screen never opens the live stream or checks in, and focuses Enter", async () => {
  const sky = await loadSky({ checkedIn: false });
  try {
    sky.finishLoading();
    expect(sky.sources).toHaveLength(0);
    expect(sky.posts).not.toContain("/api/here");
    expect(sky.window.document.activeElement?.id).toBe("arrival-submit");
  } finally {
    sky.close();
  }
});

it("entering with a star checks in once the lounge is open, never before", async () => {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const sky = await loadSky({ cookie, checkedIn: false });
  try {
    expect(sky.posts).not.toContain("/api/here");
    sky.checkIn();
    expect(sky.posts).toContain("/api/here");
  } finally {
    sky.close();
  }
});

it("loads the arrival video only after the page has loaded", async () => {
  const sky = await loadSky({ checkedIn: false });
  try {
    expect(sky.videoRequested()).toBe(false);
    sky.finishLoading();
    expect(sky.videoRequested()).toBe(true);
  } finally {
    sky.close();
  }
});

it("never loads the arrival video under reduced motion, Save-Data or a 2g connection", async () => {
  const cases = [
    { reducedMotion: true },
    { connection: { saveData: true, effectiveType: "4g" } },
    { connection: { effectiveType: "2g" } },
    { connection: { effectiveType: "slow-2g" } },
  ];
  for (const opts of cases) {
    const sky = await loadSky({ checkedIn: false, ...opts });
    try {
      sky.finishLoading();
      expect(sky.videoRequested(), JSON.stringify(opts)).toBe(false);
    } finally {
      sky.close();
    }
  }
});

it("a visitor who has already entered never loads the arrival video", async () => {
  const sky = await loadSky();
  try {
    sky.finishLoading();
    expect(sky.videoRequested()).toBe(false);
  } finally {
    sky.close();
  }
});

it("placing a star before entering opens no live stream and does not check in", async () => {
  const sky = await loadSky({ checkedIn: false });
  try {
    // The arrival covers the Observatory; this proves the guard, not the
    // layout. A star may be saved, but the lounge must not be joined.
    sky.window.document.getElementById("place-star")!.dispatchEvent(new sky.window.MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sky.posts).toContain("/api/star");
    expect(sky.open()).toHaveLength(0);
    expect(sky.posts).not.toContain("/api/here");
  } finally {
    sky.close();
  }
});

it("a visitor with no star never calls /api/here, on entry or on returning to the tab", async () => {
  const sky = await loadSky({ checkedIn: false });
  try {
    sky.checkIn();
    sky.setVisibility("hidden");
    sky.setVisibility("visible");
    expect(sky.open()).toHaveLength(1);
    expect(sky.posts).not.toContain("/api/here");
  } finally {
    sky.close();
  }
});

it("reportHere refuses before entry, even when called directly", async () => {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const sky = await loadSky({ cookie, checkedIn: false });
  try {
    await sky.window.eval("reportHere()");
    expect(sky.posts).not.toContain("/api/here");
  } finally {
    sky.close();
  }
});
