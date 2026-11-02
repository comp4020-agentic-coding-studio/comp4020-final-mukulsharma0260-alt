import { JSDOM } from "jsdom";
import { readdirSync, readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";
import { renderMarkdownDocument } from "../src/markdown.ts";

// /readme/ is README.md rendered on the server in the lounge's palette. The
// renderer supports what the README uses (tables, images, centred blocks,
// details, separators, heading ids) and nothing that could run in the page.
const baseUrl = inject("baseUrl");
const get = (path: string) => fetch(new URL(path, baseUrl));
const doc = async () => new JSDOM(await (await get("/readme/")).text()).window.document;

it("renders tables, images, centred blocks, details, separators and heading ids", () => {
  const { html, headings } = renderMarkdownDocument(
    [
      '<p align="center"><img src="docs/assets/x.svg" alt="Banner" width="100%"></p>',
      "",
      "## What good means here",
      "",
      "| Enforced | Check |",
      "|---|:---:|",
      "| A thing | `spec/a.test.ts` |",
      "",
      "---",
      "",
      "<details>",
      "<summary>More</summary>",
      "",
      "Inside **bold**.",
      "",
      "</details>",
    ].join("\n"),
  );
  const d = new JSDOM(html).window.document;
  expect(d.querySelector('p[align="center"] img')?.getAttribute("src")).toBe("docs/assets/x.svg");
  expect(headings).toEqual([{ level: 2, id: "what-good-means-here", text: "What good means here" }]);
  expect(d.querySelector("h2")?.id).toBe("what-good-means-here");
  expect(d.querySelectorAll("table th")).toHaveLength(2);
  expect(d.querySelector("td code")?.textContent).toBe("spec/a.test.ts");
  expect(d.querySelector("hr")).not.toBeNull();
  expect(d.querySelector("details summary")?.textContent).toBe("More");
  expect(d.querySelector("details strong")?.textContent).toBe("bold");
});

it("drops anything that could run: scripts, handlers, styles and javascript: links", () => {
  const { html } = renderMarkdownDocument(
    [
      "<script>alert(1)</script>",
      '<p align="center" onclick="alert(1)" style="x"><img src="javascript:alert(1)" onerror="alert(1)" alt="x"></p>',
      "[click](javascript:alert(1)) and <a href=\"javascript:alert(1)\">a</a>",
      '<iframe src="https://example.com"></iframe>',
      "[off-site](//evil.example) [insecure](http://x.example) ![data](data:image/svg+xml;base64,PHN2Zz4=)",
    ].join("\n\n"),
  );
  const d = new JSDOM(html).window.document;
  expect(d.querySelector("script, iframe, style, [onclick], [onerror], [style]")).toBeNull();
  for (const el of d.querySelectorAll("[href], [src]")) {
    expect(el.getAttribute("href") ?? el.getAttribute("src")).not.toMatch(/javascript:/i);
  }
  expect(d.querySelector('[href^="//"], [href^="http:"], [src^="data:"]')).toBeNull();
  expect(d.body.textContent).toContain("<script>alert(1)</script>");
});

it("serves every README image from an allowlist, with no script able to run in an SVG", async () => {
  const md = readFileSync("README.md", "utf8");
  const srcs = [...md.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]!);
  expect(srcs.length).toBeGreaterThan(0);
  for (const src of srcs) {
    expect(src, "README images are repo files, so GitHub and /readme/ both resolve them").toMatch(/^docs\/assets\/[a-z0-9-]+\.(svg|jpg)$/);
    const res = await get(new URL(src, new URL("/readme/", baseUrl)).pathname);
    expect(res.status, src).toBe(200);
    expect(res.headers.get("content-type")).toBe(src.endsWith(".svg") ? "image/svg+xml" : "image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toMatch(/default-src 'none'.*sandbox/);
  }
  expect((await get("/readme/docs/assets/nope.svg")).status).toBe(404);
  expect((await get("/readme/docs/assets/../../../src/server.ts")).status).toBe(404);
});

it("the README screenshot is captioned as synthetic, never as visitors", () => {
  const md = readFileSync("README.md", "utf8");
  const at = md.indexOf("lounge-local-synthetic.jpg");
  expect(at).toBeGreaterThan(-1);
  expect(md.slice(at, at + 400)).toMatch(/synthetic test browser/);
});

it("the documentation artwork is labelled as illustration, never as visitors", () => {
  for (const name of ["overlap-banner.svg", "process-banner.svg"]) {
    const svg = readFileSync(`docs/assets/${name}`, "utf8");
    expect(svg).toMatch(/<title[^>]*>[^<]+<\/title>/);
    expect(svg).toMatch(/NOT LIVE ACTIVITY/);
    expect(svg, "constellation nodes are hollow diamonds, never star dots").not.toMatch(/<circle/);
    expect(svg).not.toMatch(/<script|href=|xlink:href|@import|url\(http/i);
    expect(svg, "motion is opt-in").toMatch(/prefers-reduced-motion: no-preference/);
  }
});

it("frames the README with a skip link, contents and a way back, and loads nothing from the lounge", async () => {
  const d = await doc();
  expect(d.querySelector("a.skip")?.getAttribute("href")).toBe("#readme");
  const ids = [...d.querySelectorAll(".doc h2")].map((h) => h.id);
  const toc = [...d.querySelectorAll(".toc a")].map((a) => a.getAttribute("href"));
  expect(toc).toEqual(ids.map((id) => `#${id}`));
  expect([...d.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/" && /lounge/i.test(a.textContent ?? ""))).toBe(true);
  const html = d.documentElement.outerHTML;
  expect(html).not.toMatch(/sky\.js|EventSource|\/events|\/api\//);
});

it("sets no cookie and keeps motion behind a reduced-motion check", async () => {
  const res = await get("/readme/");
  expect(res.headers.get("set-cookie")).toBeNull();
  const css = new JSDOM(await res.text()).window.document.querySelector("style")?.textContent ?? "";
  expect(css).toMatch(/prefers-reduced-motion: reduce[^}]*\{[^}]*scroll-behavior: auto/);
});

it("the ADR badge counts the decision records that exist, so it cannot drift", () => {
  const adrs = readdirSync("docs/adr").filter((f) => /^\d{4}-.*\.md$/.test(f)).length;
  const badge = readFileSync("docs/assets/badge-adr.svg", "utf8");
  expect(badge, "rerun node scripts/build-doc-art.ts after adding an ADR").toContain(`${adrs} ADRs`);
  for (const doc of ["README.md", "PROCESS.md"]) {
    expect(readFileSync(doc, "utf8"), doc).toContain(`alt="decisions: ${adrs} ADRs"`);
  }
});

it("a contents jump marks its own section, even one too short to reach the top", async () => {
  const html = await (await get("/readme/")).text();
  const dom = new JSDOM(html, { url: new URL("/readme/#known-limits", baseUrl).toString(), runScripts: "dangerously" });
  const current = () => dom.window.document.querySelector(".toc a[aria-current]")?.getAttribute("href");
  expect(current()).toBe("#known-limits");
  dom.window.location.hash = "#sources";
  await new Promise((r) => dom.window.setTimeout(r, 0));
  expect(current()).toBe("#sources");
  dom.window.close();
});

it("/readme redirects permanently to /readme/, setting no cookie", async () => {
  const bare = await fetch(new URL("/readme", baseUrl), { redirect: "manual" });
  expect(bare.status).toBe(301);
  expect(bare.headers.get("location")).toBe("/readme/");
  expect(bare.headers.get("set-cookie")).toBeNull();
  const followed = await get("/readme");
  expect(followed.status).toBe(200);
  expect(new URL(followed.url).pathname).toBe("/readme/");
  expect(followed.headers.get("set-cookie")).toBeNull();
  const headings = [...new JSDOM(await followed.text()).window.document.querySelectorAll(".doc h2")].map((h) => h.textContent);
  expect(headings).toEqual(renderMarkdownDocument(readFileSync("README.md", "utf8")).headings.filter((h) => h.level === 2).map((h) => h.text));
});
