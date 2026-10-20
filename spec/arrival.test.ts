import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// The arrival screen is the first thing every visitor sees, before they have
// joined the live stream. These check its promises against the HTML the
// running server sends, with no script run: what a visitor sees before
// entering is exactly what is in that HTML.
const baseUrl = inject("baseUrl");

async function arrival(): Promise<{ html: string; doc: Document; section: Element }> {
  const res = await fetch(new URL("/", baseUrl));
  const html = await res.text();
  const doc = new JSDOM(html).window.document;
  const section = doc.getElementById("arrival");
  if (!section) throw new Error("no #arrival section on /");
  return { html, doc, section };
}

const visibleText = (el: Element): string => (el.textContent ?? "").replace(/\s+/g, " ").trim();

// textContent runs adjacent elements together ("27 starsOVERLAP"), which
// defeats word boundaries, so pattern checks read each text node on its own.
const textNodes = (el: Element): string[] => {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const out: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out;
};

it("shows the exact arrival copy", async () => {
  const { section } = await arrival();
  expect(visibleText(section.querySelector(".arrival-kicker")!)).toBe("OVERLAP · ANONYMOUS STUDY LOUNGE");
  expect(visibleText(section.querySelector("#arrival-title")!)).toBe("STUDY, NOT ALONE.");
  expect(visibleText(section.querySelector(".arrival-copy")!)).toBe(
    "A quiet place for late-night study. Arrive anonymously, see that others are here, and keep each other company without profiles or pressure.",
  );
  expect(visibleText(section.querySelector("#arrival-submit")!)).toBe("ENTER THE LOUNGE →");
});

it("never calls the place a sky, channel or room on the arrival screen", async () => {
  const { section } = await arrival();
  for (const text of textNodes(section)) {
    expect(text.toLowerCase()).not.toMatch(/\bsky\b|\bchannel\b|\broom\b|old light/);
  }
});

it("the arrival screen claims no counts and no presence it cannot know yet", async () => {
  const { section } = await arrival();
  for (const text of textNodes(section)) {
    expect(text).not.toMatch(/\d+\s+stars?\b/i);
    expect(text).not.toMatch(/glowing now|looking at|online|\bhere now\b/i);
  }
});

it("the arrival screen itself has no name field, sign-in form or free-text input", async () => {
  // Scoped to the arrival screen, not the whole page: the lounge now has one
  // bounded free-text field (the callsign), an explicit, narrow exception to
  // CLAUDE.md's rule (ADR 0012), reached only after entering, never here.
  const { section } = await arrival();
  expect(section.querySelectorAll("textarea, [contenteditable]")).toHaveLength(0);
  const textInputs = [...section.querySelectorAll("input")].filter(
    (i) => !["button", "submit", "checkbox", "radio", "range", "hidden"].includes(i.type),
  );
  expect(textInputs).toHaveLength(0);
});

it("the inside of the lounge describes only what is built", async () => {
  const { doc } = await arrival();
  const app = doc.getElementById("sky-app")!;
  expect(visibleText(app.querySelector("h1")!)).toBe("The Common Room");
  expect(visibleText(app.querySelector(".wordmark")!)).toBe("Overlap");
  const text = visibleText(app).toLowerCase();
  expect(text).toContain("place your star. settle in. you are not studying alone.");
  // No fake ambience, location or discussion placeholder, nothing promised
  // that is not built. Break is built (real tracks), so music is allowed to
  // be named; Common Room chat is now built too (ADR 0012's follow-on), so
  // "chat"/"message" are allowed the same way.
  expect(text).not.toMatch(/\bambience\b|\btimer\b|discussion|simulated|prototype|observatory|\blater\b|\bsky\b|coming soon|nearby/);
  expect(app.querySelector(".discussion")).toBeNull();
  // The Common Room and exactly the five constellations, as real links.
  const views = [...app.querySelectorAll("nav.lounge-nav a[data-view]")].map((a) => a.getAttribute("data-view"));
  expect(views).toEqual(["common", "science", "engineering", "business", "health", "arts"]);
});
it("the arrival video is silent, control-free, decorative and local", async () => {
  const { section } = await arrival();
  const videos = section.querySelectorAll("video");
  expect(videos).toHaveLength(1);
  const video = videos[0]!;
  for (const attr of ["muted", "loop", "playsinline"]) expect(video.hasAttribute(attr)).toBe(true);
  expect(video.hasAttribute("controls")).toBe(false);
  expect(video.getAttribute("preload")).toBe("metadata");
  expect(video.getAttribute("aria-hidden")).toBe("true");
  // The poster is set by sky.js to the WebP the still picture already
  // chose, so the HTML names a WebP but the browser fetches no second copy.
  expect(video.hasAttribute("poster")).toBe(false);
  expect(video.getAttribute("data-poster")).toMatch(/^\/assets\/[\w.-]+\.webp$/);

  // The video loads only once the page is usable (see sky.js), so sources
  // are held in data-src, never src, in the HTML.
  const sources = [...video.querySelectorAll("source")];
  expect(sources.map((s) => s.getAttribute("type"))).toEqual(["video/webm", "video/mp4"]);
  for (const s of sources) {
    expect(s.hasAttribute("src")).toBe(false);
    expect(s.getAttribute("data-src")).toMatch(/^\/assets\/[\w.-]+\.(webm|mp4)$/);
  }
});

it("the still galaxy is a responsive WebP picture, with the PNG only as a fallback", async () => {
  const { section } = await arrival();
  const picture = section.querySelector("picture.arrival-still");
  expect(picture).not.toBeNull();
  const webp = picture!.querySelector('source[type="image/webp"]');
  expect(webp?.getAttribute("srcset")).toMatch(/arrival-galaxy-960\.webp 960w/);
  expect(webp?.getAttribute("srcset")).toMatch(/arrival-galaxy-1920\.webp 1920w/);
  const img = picture!.querySelector("img");
  expect(img?.getAttribute("alt")).toBe("");
  expect(img?.getAttribute("fetchpriority")).toBe("high");
});

it("under reduced motion the video is hidden and never loaded, leaving the still image", async () => {
  const { html } = await arrival();
  const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\s{2}\}/g)].map((m) => m[1]).join("\n");
  expect(reduced).toMatch(/\.arrival-video\s*\{[^}]*display:\s*none/);
});

it("serves every arrival asset with its real content type", async () => {
  const assets: Array<[string, string]> = [
    ["/assets/arrival-galaxy-960.webp", "image/webp"],
    ["/assets/arrival-galaxy-1920.webp", "image/webp"],
    ["/assets/arrival-galaxy-v3.png", "image/png"],
    ["/assets/arrival-nebula-720.webm", "video/webm"],
    ["/assets/arrival-nebula-720.mp4", "video/mp4"],
    ["/assets/arrival-film-music.mp3", "audio/mpeg"],
    ["/assets/arrival-film-1080.webm", "video/webm"],
    ["/assets/arrival-film-1080.mp4", "video/mp4"],
  ];
  for (const [path, type] of assets) {
    const res = await fetch(new URL(path, baseUrl));
    expect(res.status, path).toBe(200);
    expect(res.headers.get("content-type"), path).toBe(type);
    await res.arrayBuffer();
  }
});

it("does not serve files outside the asset allowlist", async () => {
  for (const path of ["/assets/../src/server.ts", "/assets/%2e%2e/src/server.ts", "/assets/arrival-galaxy-v1.png", "/assets/nope.webp"]) {
    const res = await fetch(new URL(path, baseUrl));
    expect(res.status, path).toBe(404);
    await res.arrayBuffer();
  }
});

it("the film fills the viewport: fixed, inset 0, 100vw by 100dvh, media cover", async () => {
  const { html } = await arrival();
  const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const rule = (sel: string) => css.match(new RegExp(`${sel.replace(/[.#]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  const film = rule("#arrival-film");
  for (const decl of [/position:\s*fixed/, /inset:\s*0/, /width:\s*100vw/, /height:\s*100dvh/, /overflow:\s*hidden/]) {
    expect(film).toMatch(decl);
  }
  const media = rule(".film-galaxy img, .film-cloud");
  for (const decl of [/width:\s*100%/, /height:\s*100%/, /object-fit:\s*cover/]) expect(media).toMatch(decl);
});

it("serves media with byte ranges, so Safari can play the film's video and music", async () => {
  for (const path of ["/assets/arrival-nebula-720.mp4", "/assets/arrival-film-music.mp3"]) {
    const res = await fetch(new URL(path, baseUrl), { headers: { Range: "bytes=0-99" } });
    expect(res.status, path).toBe(206);
    expect(res.headers.get("accept-ranges"), path).toBe("bytes");
    expect(res.headers.get("content-range"), path).toMatch(/^bytes 0-99\/\d+$/);
    expect((await res.arrayBuffer()).byteLength, path).toBe(100);
  }
});

it("does not serve the unused warp video or the uncut Luna clip", async () => {
  for (const path of ["/assets/lounge-transition.mp4", "/assets/luna-original.mp4"]) {
    const res = await fetch(new URL(path, baseUrl));
    expect(res.status, path).toBe(404);
    await res.arrayBuffer();
  }
});
