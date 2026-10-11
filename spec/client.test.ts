import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// Runs the real public/sky.js against the real HTML the server sends, with
// EventSource and fetch replaced by recorders, so the client's stream
// lifecycle can be checked without a browser.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

type FakeSource = { url: string; closed: boolean };

async function loadSky(opts: { cookie?: string; visibility?: "visible" | "hidden" } = {}) {
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
  Object.assign(window, {
    matchMedia: () => ({ matches: false }),
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
      return { ok: true, json: async () => ({ hasStar: false }) };
    },
  });

  window.eval(skyJs);

  return {
    sources,
    posts,
    open: () => sources.filter((s) => !s.closed),
    setVisibility(next: "visible" | "hidden") {
      visibility = next;
      window.document.dispatchEvent(new window.Event("visibilitychange"));
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

it("closes the stream when the tab is hidden and reopens it, checking in, when visible", async () => {
  const sky = await loadSky();
  try {
    expect(sky.open()).toHaveLength(1);

    sky.setVisibility("hidden");
    expect(sky.open()).toHaveLength(0);

    sky.setVisibility("visible");
    expect(sky.open()).toHaveLength(1);
    expect(sky.sources).toHaveLength(2);
    expect(sky.posts).toContain("/api/here");
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
