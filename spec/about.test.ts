import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// The About page: a short visual story for a student, separate from the
// README at /readme/, which stays the plain marker-facing page. It is a
// page to read, not part of the lounge: it opens no stream, sets no cookie,
// checks nobody in, and writes nothing. Its words are real HTML, readable
// without JavaScript and without any motion.
const baseUrl = inject("baseUrl");

const get = (path: string, init?: RequestInit) => fetch(new URL(path, baseUrl), { redirect: "manual", ...init });
const page = async () => new JSDOM(await (await get("/about/")).text()).window.document;
const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const css = (doc: Document) => [...doc.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

it("serves the About page at /about/, and /about redirects there", async () => {
  const res = await get("/about/");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  const bare = await get("/about");
  expect(bare.status).toBe(301);
  expect(bare.headers.get("location")).toBe("/about/");
});

it("the README is still served, plain, at /readme/", async () => {
  const res = await get("/readme/");
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("<title>About Overlap</title>");
  expect(html).not.toContain("about-chapter");
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

it("the About page loads no lounge script, no stream, and no film", async () => {
  const html = await (await get("/about/")).text();
  expect(html).not.toMatch(/sky\.js|EventSource|\/events|\/api\//);
  expect(html).not.toMatch(/arrival-film|film-cloud|<audio/);
  // No video yet: the background is the approved galaxy artwork.
  expect(html).not.toMatch(/<video/);
  expect(html).toContain("/assets/arrival-galaxy-960.webp");
});

it("tells the story in five chapters, in order, each with its heading", async () => {
  const doc = await page();
  const chapters = [...doc.querySelectorAll("main > section.about-chapter")];
  expect(chapters.map((s) => s.id)).toEqual(["arrive", "company", "focus", "talking", "return"]);
  expect(text(doc.querySelector("h1"))).toBe("STUDY, NOT ALONE.");
  expect(doc.querySelectorAll("h1")).toHaveLength(1);
  expect(chapters.slice(1).map((s) => text(s.querySelector("h2")))).toEqual(["Quiet company", "Find your focus", "Talking, a little", "The work is still yours."]);
  for (const s of chapters) expect(s.getAttribute("aria-labelledby"), s.id).toBe(s.querySelector("h1, h2")!.id);
  expect(doc.querySelector("header")).not.toBeNull();
  expect(doc.querySelector("main")).not.toBeNull();
  expect(doc.querySelector("footer")).not.toBeNull();
  expect(doc.documentElement.getAttribute("lang")).toBe("en-AU");
});

it("every ENTER THE LOUNGE goes to the lounge, and the technical notes go to /readme/", async () => {
  const doc = await page();
  const enters = [...doc.querySelectorAll<HTMLAnchorElement>("a")].filter((a) => /enter the lounge/i.test(text(a)));
  expect(enters.length).toBeGreaterThanOrEqual(2);
  for (const a of enters) expect(a.getAttribute("href")).toBe("/");
  // Two links with the same words are told apart by their names.
  const names = enters.map((a) => a.getAttribute("aria-label") ?? text(a));
  expect(new Set(names).size).toBe(names.length);
  const notes = [...doc.querySelectorAll<HTMLAnchorElement>("a")].find((a) => text(a) === "Read the technical notes");
  expect(notes?.getAttribute("href")).toBe("/readme/");
  const how = [...doc.querySelectorAll<HTMLAnchorElement>("a")].find((a) => text(a) === "Read how it works");
  expect(how?.getAttribute("href")).toBe("#company");
});

it("says what glowing means honestly, and makes no promises it cannot keep", async () => {
  const doc = await page();
  const all = text(doc.querySelector("main")).toLowerCase();
  expect(all).toContain("glowing means a lounge is open in a visible browser tab");
  expect(all).not.toMatch(/\bsky\b|\bchannel\b|private room|therapy|cure|safe space|guarantee|deleted forever|erased/);
  // Constellations are named, and never called rooms.
  for (const name of ["Science", "Engineering", "Business", "Health", "Arts & Society"]) expect(text(doc.getElementById("focus"))).toContain(name);
  expect(text(doc.getElementById("focus")).toLowerCase()).not.toMatch(/\broom\b(?<!common room)/);
});

it("draws the constellations as outlines only, never as points of light that could pass for visitors", async () => {
  const doc = await page();
  const figures = [...doc.querySelectorAll("#focus svg.about-figure")];
  expect(figures).toHaveLength(5);
  for (const svg of figures) {
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("circle")).toHaveLength(0);
    expect(svg.querySelectorAll("line").length).toBeGreaterThan(0);
  }
});

it("the words are all there without JavaScript, and motion is opt-in", async () => {
  const doc = await page();
  const sheet = css(doc);
  // Hidden-until-revealed only applies once the script has said it runs.
  expect(sheet).not.toMatch(/(^|\})\s*\.reveal\s*\{[^}]*opacity:\s*0/);
  expect(sheet).toMatch(/\.motion\s+\.reveal[^{]*\{[^}]*opacity:\s*0/);
  expect(sheet).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  // The first screen is never held back by a fade: only later chapters reveal.
  expect(doc.querySelectorAll("#arrive .reveal, #arrive.reveal")).toHaveLength(0);
  expect(doc.querySelectorAll("main .reveal").length).toBeGreaterThan(0);
  // Nothing on the page plays sound, and there is nothing to play.
  expect(doc.querySelectorAll("audio, video")).toHaveLength(0);
});

it("the optional moving background stays off for reduced motion, Save-Data and 2g, so the still artwork remains", async () => {
  const doc = await page();
  const script = [...doc.querySelectorAll("script")].map((s) => s.textContent ?? "").join("\n");
  // A slot a future approved video can fill; empty for now, so nothing loads.
  const slot = doc.querySelector<HTMLElement>("[data-about-video]");
  expect(slot).not.toBeNull();
  expect(slot!.getAttribute("data-src") ?? "").toBe("");
  for (const guard of ["prefers-reduced-motion: reduce", "saveData", "slow-2g", "2g"]) expect(script).toContain(guard);
});

it("the lounge's visible About links open the About page", async () => {
  const doc = new JSDOM(await (await get("/")).text()).window.document;
  const about = [...doc.querySelectorAll<HTMLAnchorElement>("a")].filter((a) => /about/i.test(a.getAttribute("aria-label") ?? "") || text(a) === "About");
  expect(about.length).toBeGreaterThanOrEqual(2);
  for (const a of about) expect(a.getAttribute("href"), text(a) || a.getAttribute("aria-label")!).toBe("/about/");
});
