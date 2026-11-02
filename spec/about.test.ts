import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// The About page: a cinematic teleprompter, one short thought at a time over
// a full-bleed background, separate from the README at /readme/, which stays
// the full marker-facing page. It is a page to read, not part of the lounge:
// it opens no stream, sets no cookie, checks nobody in, and writes nothing.
// Its words are real HTML, readable without JavaScript and without motion.
const baseUrl = inject("baseUrl");

const get = (path: string, init?: RequestInit) => fetch(new URL(path, baseUrl), { redirect: "manual", ...init });
const page = async () => new JSDOM(await (await get("/about/")).text()).window.document;
const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const css = (doc: Document) => [...doc.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
const script = (doc: Document) => [...doc.querySelectorAll("script")].map((s) => s.textContent ?? "").join("\n");

const BEATS = [
  "Studying alone can feel heavier than the work.",
  "Overlap gives you quiet company, not another social platform.",
  "Place one star. Let it glow while you are here.",
  "Choose a constellation when you want a calmer shared focus.",
  "Use a short-lived conversation only when a few words help.",
];

it("serves the About page at /about/, and /about redirects there", async () => {
  const res = await get("/about/");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  const bare = await get("/about");
  expect(bare.status).toBe(301);
  expect(bare.headers.get("location")).toBe("/about/");
});

it("the README is still served at /readme/, separate from the teleprompter", async () => {
  const res = await get("/readme/");
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("<title>About Overlap</title>");
  expect(html).not.toMatch(/about-beat|teleprompter/);
});

it("the About page sets no cookie, even for a visitor who has one", async () => {
  // Judged on the page itself: a missing page would set no cookie either.
  const fresh = await get("/about/");
  expect(fresh.status).toBe(200);
  expect(fresh.headers.get("set-cookie")).toBeNull();
  const created = await get("/api/star", { method: "POST", body: "{}" });
  const cookie = created.headers.get("set-cookie")!.split(";")[0]!;
  const known = await get("/about/", { headers: { Cookie: cookie } });
  expect(known.status).toBe(200);
  expect(known.headers.get("set-cookie")).toBeNull();
});

it("the About page loads no lounge script, no stream, no API and no film", async () => {
  const html = await (await get("/about/")).text();
  expect(html).not.toMatch(/sky\.js|EventSource|\/events|\/api\/|fetch\(|XMLHttpRequest|sendBeacon/);
  expect(html).not.toMatch(/arrival-film|film-cloud|<audio/);
  // No video in the page itself: the still galaxy is the background until an
  // approved one is set, and then only the script adds it.
  expect(html).not.toMatch(/<video/);
  expect(html).toContain("/assets/arrival-galaxy-960.webp");
});

it("tells the story as five thoughts, in order, then a quiet way back", async () => {
  const doc = await page();
  expect(doc.querySelectorAll("h1")).toHaveLength(1);
  const beats = [...doc.querySelectorAll("main .about-beat")];
  expect(beats.map((b) => text(b.querySelector(".beat-line")))).toEqual(BEATS);
  // The last chapter ends the story with one quiet way back, not a banner.
  const back = doc.querySelector<HTMLAnchorElement>("#return a.about-back");
  expect(back?.getAttribute("href")).toBe("/");
  expect(text(back)).toBe("Return to the lounge");
  expect(doc.documentElement.getAttribute("lang")).toBe("en-AU");
  for (const s of doc.querySelectorAll("main section")) expect(s.getAttribute("aria-labelledby"), s.id).toBe(s.querySelector("h1, h2")!.id);
});

it("the first chapter is How Overlap works, told over the background", async () => {
  const doc = await page();
  const first = doc.querySelector("main section");
  expect(first?.id).toBe("how");
  expect(text(first!.querySelector("h1"))).toBe("How Overlap works");
  expect(first!.querySelector(".about-beat")).not.toBeNull();
});

it("has no big call to action: only a small Back to lounge in the header and a quiet return at the end", async () => {
  const doc = await page();
  const toLounge = [...doc.querySelectorAll<HTMLAnchorElement>("a[href='/']")];
  // The wordmark, the header link, and the ending: nothing else goes back.
  expect(toLounge.map((a) => a.className).sort()).toEqual(["about-back", "about-bar-back", "about-wordmark"]);
  expect(text(doc.querySelector("header a.about-bar-back"))).toBe("Back to lounge");
  expect(doc.querySelector("#how a[href='/']")).toBeNull();
  expect(doc.body.textContent).not.toMatch(/ENTER THE LOUNGE/i);
  // Names are unique, so a screen reader can tell them apart.
  const names = toLounge.map((a) => a.getAttribute("aria-label") ?? text(a));
  expect(new Set(names).size).toBe(names.length);
  // The full README is still one link away.
  const notes = [...doc.querySelectorAll<HTMLAnchorElement>("a")].find((a) => text(a) === "Read the technical notes");
  expect(notes?.getAttribute("href")).toBe("/readme/");
});

it("a small chapter progress indicator links to each chapter", async () => {
  const doc = await page();
  const nav = doc.querySelector("nav.about-progress");
  expect(nav?.getAttribute("aria-label")).toBe("Chapters");
  const ids = [...doc.querySelectorAll("main section")].map((s) => `#${s.id}`);
  expect([...nav!.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(ids);
  expect(ids.length).toBeGreaterThanOrEqual(3);
});

it("shows no pretend visitors and no live numbers", async () => {
  const doc = await page();
  const all = text(doc.body).toLowerCase();
  expect(all).not.toMatch(/\d+\s+(studying|glowing|listening|online|here now)|studying now|live now/);
  expect(doc.querySelectorAll("[data-id], .star, circle")).toHaveLength(0);
  // Constellation figures are outlines: lines and hollow diamonds only.
  const figures = [...doc.querySelectorAll("svg.about-figure")];
  expect(figures.length).toBeGreaterThan(0);
  for (const svg of figures) {
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("line").length).toBeGreaterThan(0);
  }
});

it("speaks honestly, in the lounge's own words", async () => {
  const doc = await page();
  const all = text(doc.querySelector("main")).toLowerCase();
  expect(all).toContain("glowing means a lounge is open in a visible browser tab");
  expect(all).not.toMatch(/\bsky\b|\bchannel\b|chat room|private room|therapy|cure|safe space|guarantee|deleted forever|erased/);
  // Constellations are never called rooms; only the Common Room is one.
  expect(all.replace(/common room/g, "")).not.toMatch(/\broom\b/);
});

it("every word is there without JavaScript; the teleprompter dims only once its script runs", async () => {
  const doc = await page();
  const sheet = css(doc);
  expect(sheet).not.toMatch(/(^|\})\s*\.about-beat[^{,]*\{[^}]*opacity:\s*0/);
  expect(sheet).toMatch(/\.prompter\s+\.about-beat[^{]*\{[^}]*opacity/);
  expect(sheet).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  expect(doc.querySelectorAll("audio, video")).toHaveLength(0);
});

it("the moving background is optional, lazy and silent, and the still galaxy stays for reduced motion, Save-Data, 2g and failures", async () => {
  const doc = await page();
  const js = script(doc);
  // It belongs to the first chapter: shown only while that chapter is on screen.
  const slot = doc.querySelector<HTMLElement>("[data-about-video]");
  expect(slot?.getAttribute("data-for")).toBe("how");
  // Empty until an approved video's source and licence are recorded.
  expect(slot!.getAttribute("data-src") ?? "").toBe("");
  expect(slot!.getAttribute("aria-hidden")).toBe("true");
  for (const guard of ["prefers-reduced-motion: reduce", "saveData", "slow-2g", "2g"]) expect(js).toContain(guard);
  // Muted, looped, inline, never preloaded, made only near its chapter.
  for (const must of ["muted = true", "loop = true", "playsinline", 'preload = "none"', "IntersectionObserver", '"error"']) expect(js).toContain(must);
  // The poster is the credited galaxy, painted with the page.
  expect(css(doc)).toMatch(/\.about-stage[^{]*\{[^}]*arrival-galaxy-960\.webp/);
});

it("the lounge's visible About links open the About page", async () => {
  const doc = new JSDOM(await (await get("/")).text()).window.document;
  const about = [...doc.querySelectorAll<HTMLAnchorElement>("a")].filter((a) => /about/i.test(a.getAttribute("aria-label") ?? "") || text(a) === "About");
  expect(about.length).toBeGreaterThanOrEqual(2);
  for (const a of about) expect(a.getAttribute("href"), text(a) || a.getAttribute("aria-label")!).toBe("/about/");
});
