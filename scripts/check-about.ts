// Browser check for the About page at /about/, in Chromium and WebKit, at
// every size in the About brief: the first screen, sideways scroll, target
// sizes, measured contrast, keyboard order, back and forward, and that the
// page stays out of the lounge (no stream, no API call, no cookie), then that
// entering from it opens exactly one stream.
//
//   APP_URL=http://localhost:8080 PLAYWRIGHT=<path> node scripts/check-about.ts [SHOTS=<dir>]
//
// The About page itself writes nothing, but the check enters the lounge from
// it, so like the other browser checks it refuses any host but a local one.
// Exits 1 if any check fails.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT ?? "playwright");

const APP_URL = process.env.APP_URL ?? "http://localhost:8080";
if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(APP_URL).hostname)) {
  console.error(`check-about: refusing ${APP_URL}; it enters the lounge, and CLAUDE.md says live checks against production are read-only. Use a local throwaway server.`);
  process.exit(1);
}
const B = new URL("/", APP_URL).toString();
const ABOUT = B + "about/";
const SHOTS = process.env.SHOTS;
const SIZES: Array<[number, number]> = [[1920, 1080], [1440, 900], [1280, 800], [390, 844], [360, 844], [414, 896], [844, 390]];
const isPhone = (w: number, h: number) => w <= 600 || h <= 500;

let failures = 0;
const report = (where: string, check: string, ok: boolean, detail: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${where}  ${check}: ${detail}`);
};

// Timing entries, watched from the first byte: long tasks, layout shifts and
// the largest paint (Chromium reports all three; WebKit none of them).
const OBSERVE = `
  window.__perf = { long: [], cls: 0, lcp: 0 };
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__perf.long.push(e.duration))).observe({ type: "longtask", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__perf.cls += e.value; })).observe({ type: "layout-shift", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__perf.lcp = e.startTime; })).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  // Streams this document has open. Playwright's own request events miss a
  // stream the back-forward cache closes, so the page counts its own.
  if (window.EventSource) {
    const ES = window.EventSource;
    window.__streams = 0;
    window.EventSource = function (...a) {
      const es = new ES(...a);
      window.__streams++;
      const close = es.close.bind(es);
      let open = true;
      const done = () => { if (open) { open = false; window.__streams--; } };
      es.close = () => { done(); close(); };
      addEventListener("pagehide", done);
      return es;
    };
    window.EventSource.prototype = ES.prototype;
  }
`;

// The lowest contrast of any visible text against the pixels really behind
// it: a screenshot with all text made transparent, sampled under each line.
type Pg = any;
async function contrastPass(page: Pg, seen: Map<string, number>) {
  await page.addStyleTag({ content: "* { color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; }", }).then((h: any) => h.evaluate((el: Element) => el.setAttribute("data-check", "")));
  const png = (await page.screenshot()).toString("base64");
  await page.evaluate(() => document.querySelector("style[data-check]")?.remove());
  const found: Array<[string, number]> = await page.evaluate(async (png: string) => {
    const img = new Image();
    img.src = "data:image/png;base64," + png;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext("2d")!;
    cx.drawImage(img, 0, 0);
    const px = cx.getImageData(0, 0, cv.width, cv.height).data;
    const scale = img.width / innerWidth;
    const lum = (r: number, g: number, b: number) => {
      const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const out: Array<[string, number]> = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let k = -1;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = (n.textContent ?? "").trim();
      const el = n.parentElement!;
      if (!t || el.closest("script, style, [aria-hidden='true']")) continue;
      k++;
      const range = document.createRange(); range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length || rects.some((r) => r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth)) continue;
      const m = getComputedStyle(el).color.match(/[\d.]+/g)!.map(Number);
      const lt = lum(m[0]!, m[1]!, m[2]!);
      let worst = 21;
      for (const r of rects) for (let y = r.top + 1; y < r.bottom - 1; y += 2) for (let x = r.left + 1; x < r.right - 1; x += 2) {
        const i = (Math.floor(y * scale) * cv.width + Math.floor(x * scale)) * 4;
        const lb = lum(px[i]!, px[i + 1]!, px[i + 2]!);
        worst = Math.min(worst, (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
      }
      // Keyed by place in the document, so two runs with the same words
      // (the two ENTER links) are measured separately.
      out.push([`${k}: ${t.slice(0, 40)}`, worst]);
    }
    return out;
  }, png);
  for (const [t, c] of found) seen.set(t, Math.min(seen.get(t) ?? 21, c));
}

// Scroll the whole page a half screen at a time, letting each reveal finish.
async function scrollThrough(page: Pg, each?: () => Promise<void>) {
  const total: number = await page.evaluate(() => document.documentElement.scrollHeight);
  const h: number = await page.evaluate(() => innerHeight);
  for (let y = 0; ; y += Math.floor(h / 2)) {
    await page.evaluate((y: number) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await page.waitForTimeout(750);
    if (each) await each();
    if (y + h >= total) break;
  }
}

for (const engine of ["chromium", "webkit"]) {
  const browser = await pw[engine].launch();
  try {
    for (const [w, h] of SIZES) {
      const where = `${engine} ${w}x${h}`;
      const phone = isPhone(w, h);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone });
      await ctx.addInitScript(OBSERVE);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("console", (m: any) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e: Error) => errors.push(e.message));
      const requests: Array<{ method: string; url: string }> = [];
      page.on("request", (r: any) => requests.push({ method: r.method(), url: r.url() }));

      await page.goto(ABOUT, { waitUntil: "load" });
      await page.waitForTimeout(400);
      if (SHOTS && (w === 1920 || w === 390)) await page.screenshot({ path: `${SHOTS}/about-${w}x${h}.png` });

      // The first screen: title, the short line and Enter, clear of the bar.
      const fold = await page.evaluate(() => {
        const bar = document.querySelector(".about-bar")!.getBoundingClientRect().bottom;
        const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const o = (s: string) => parseFloat(getComputedStyle(document.querySelector(s)!).opacity);
        return ["h1", "#arrive .about-lead", "#arrive .about-enter"].map((s) => ({ s, top: r(s).top, bottom: r(s).bottom, bar, opacity: o(s) }));
      });
      // In place, and already shown: the first screen never waits on a fade.
      const bad = fold.filter((f: any) => f.top < f.bar - 1 || f.bottom > h || f.opacity < 0.99);
      report(where, "first screen", bad.length === 0, bad.length ? bad.map((f: any) => `${f.s} ${Math.round(f.top)}-${Math.round(f.bottom)} (bar ${Math.round(f.bar)}, view ${h}) opacity ${f.opacity.toFixed(2)}`).join("; ") : "title, line and Enter shown without scrolling or waiting");
      // The largest paint, read before any scrolling: later reveals would
      // otherwise keep moving it.
      const lcp: number = await page.evaluate(() => (window as any).__perf.lcp);

      // Sideways scroll and contrast, everywhere on the page.
      const seen = new Map<string, number>();
      let wide = 0;
      await scrollThrough(page, async () => {
        wide = Math.max(wide, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
        await contrastPass(page, seen);
      });
      report(where, "no sideways scroll", wide <= 0, `scrollWidth - innerWidth = ${wide}`);
      const words: number = await page.evaluate(() => {
        let n = 0; const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode(); t; t = walk.nextNode()) if ((t.textContent ?? "").trim() && !t.parentElement!.closest("script, style, [aria-hidden='true']")) n++;
        return n;
      });
      const low = [...seen].filter(([, c]) => c < 4.5);
      const min = Math.min(...seen.values());
      report(where, "contrast >= 4.5:1", low.length === 0 && seen.size === words, `${seen.size}/${words} text runs measured, lowest ${min.toFixed(2)}:1${low.length ? `; low: ${low.map(([t, c]) => `"${t}" ${c.toFixed(2)}`).join(", ")}` : ""}`);

      // Every link is at least 44px each way.
      const small = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => ({ t: a.getAttribute("aria-label") ?? a.textContent!.trim(), r: a.getBoundingClientRect() })).filter((x) => x.r.width < 44 || x.r.height < 44).map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`));
      report(where, "targets >= 44px", small.length === 0, small.length ? small.join("; ") : "every link");

      // Timing, Chromium only (WebKit reports none of these entries).
      const perf = await page.evaluate(() => (window as any).__perf);
      if (engine === "chromium") {
        const longest = Math.max(0, ...perf.long);
        report(where, "no long task over 50ms", perf.long.length === 0, `${perf.long.length} long tasks, longest ${Math.round(longest)}ms`);
        report(where, "largest paint within 1s", lcp > 0 && lcp <= 1000, `LCP ${Math.round(lcp)}ms`);
        report(where, "no layout shift", perf.cls === 0, `CLS ${perf.cls.toFixed(4)}`);
      }

      // Keyboard: Tab walks the links in reading order, each with a visible
      // ring, never hidden under the sticky bar.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const order: string[] = [];
      const hidden: string[] = [];
      for (let i = 0; i < 7; i++) {
        await page.keyboard.press(engine === "webkit" ? "Alt+Tab" : "Tab");
        // Focus scrolls smoothly; judge where the link comes to rest.
        await page.evaluate(async () => {
          for (let i = 0, y = -1; i < 40 && scrollY !== y; i++) { y = scrollY; await new Promise((ok) => setTimeout(ok, 150)); }
        });
        const f = await page.evaluate(() => {
          const a = document.activeElement as HTMLElement;
          const r = a.getBoundingClientRect();
          const bar = document.querySelector(".about-bar")!.getBoundingClientRect().bottom;
          const s = getComputedStyle(a);
          return { name: a.getAttribute("aria-label") ?? a.textContent!.trim(), ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2, covered: !a.closest(".about-bar") && (r.top < bar - 1 || r.bottom > innerHeight), at: `${Math.round(r.top)}-${Math.round(r.bottom)} of ${innerHeight}, bar ${Math.round(bar)}, scrollY ${Math.round(scrollY)}` };
        });
        order.push(f.name);
        if (!f.ring || f.covered) hidden.push(`${f.name}${f.ring ? "" : " (no ring)"}${f.covered ? ` (covered at ${f.at})` : ""}`);
      }
      const want = ["Overlap: go to the lounge", "Enter the lounge, from the top bar", "Enter the lounge", "Read how it works", "Enter the lounge, from the end of the page", "Read the technical notes", "Back to top"];
      report(where, "keyboard order", JSON.stringify(order) === JSON.stringify(want), order.join(" → "));
      report(where, "focus visible, not under the bar", hidden.length === 0, hidden.length ? hidden.join("; ") : "ring on every stop");

      // Back and forward: an in-page link, then into the lounge and back.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.click("#arrive a[href='#company']");
      await page.waitForTimeout(150);
      const hashed = new URL(page.url()).hash;
      await page.goBack(); await page.waitForTimeout(150);
      const back1 = new URL(page.url());

      // Until here the visitor has only read: nothing but GETs for the page
      // and its artwork, no stream, no API call, no cookie.
      const aboutReqs = [...requests];
      const strays = aboutReqs.filter((r) => r.method !== "GET" || new URL(r.url).origin !== new URL(B).origin || /^\/(events|api\/)/.test(new URL(r.url).pathname));
      report(where, "stays out of the lounge", strays.length === 0, `${aboutReqs.length} requests: ${[...new Set(aboutReqs.map((r) => new URL(r.url).pathname))].join(", ")}${strays.length ? `; strays ${strays.map((r) => `${r.method} ${r.url}`).join(", ")}` : ""}`);
      const cookies = await ctx.cookies();
      report(where, "sets no cookie", cookies.length === 0, `${cookies.length} cookies`);

      // Then this visitor places a star (as the lounge would on a tap) and
      // enters from the About page. A second browser in the lounge watches
      // whether that star glows: the server's own count of its open streams.
      const id: string = (await (await ctx.request.post(B + "api/star", { data: {} })).json()).star.id;
      const wctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const watcher = await wctx.newPage();
      await watcher.goto(B); await watcher.click("#arrival-submit"); await watcher.click("#film-skip");
      const glow = async (want: boolean) => {
        try { await watcher.waitForFunction(([id, want]: [string, boolean]) => (document.querySelector(`#stars .star[data-id="${id}"]`)?.getAttribute("data-level") === "glowing") === want, [id, want], { timeout: 4000 }); return want; }
        catch { return !want; }
      };
      const streams = () => page.evaluate(() => (window as any).__streams ?? 0);
      await page.click("#arrive .about-enter");
      await page.waitForURL(B);
      await page.waitForTimeout(300);
      const atArrival = await streams();
      const glowAtArrival = await glow(false);
      await page.click("#arrival-submit"); await page.click("#film-skip");
      await page.waitForTimeout(900);
      const entered = await streams();
      const glowEntered = await glow(true);
      await page.goBack(); await page.waitForURL(ABOUT); await page.waitForTimeout(300);
      const backOnAbout = await streams();
      const glowBack = await glow(false);
      const aboutShown = await page.evaluate(() => document.querySelector("h1")?.textContent ?? "");
      await page.goForward(); await page.waitForURL(B); await page.waitForTimeout(300);
      await page.click("#arrival-submit"); await page.click("#film-skip");
      await page.waitForTimeout(900);
      const again = await streams();
      const glowAgain = await glow(true);
      await wctx.close();
      report(where, "back and forward", hashed === "#company" && back1.pathname === "/about/" && back1.hash === "" && aboutShown === "STUDY, NOT ALONE.", `#company then back to ${back1.pathname}${back1.hash}; lounge then back shows "${aboutShown}"`);
      report(where, "one stream after entering", atArrival === 0 && entered === 1 && backOnAbout === 0 && again === 1, `streams in the page: arrival ${atArrival}, entered ${entered}, back on About ${backOnAbout}, entered again ${again}`);
      report(where, "glows only while in the lounge", !glowAtArrival && glowEntered && !glowBack && glowAgain, `seen by another browser: arrival ${glowAtArrival ? "glowing" : "not"}, entered ${glowEntered ? "glowing" : "not"}, back on About ${glowBack ? "glowing" : "not"}, entered again ${glowAgain ? "glowing" : "not"}`);

      report(where, "no console errors", errors.length === 0, errors.length ? errors.slice(0, 3).join(" | ") : "none");
      await ctx.close();
    }

    // The still artwork stays for reduced motion, Save-Data and 2g. The page
    // ships no video, so to prove the guards the test hands the slot a
    // stand-in address that it answers itself with an empty response; no
    // video file exists anywhere.
    const variants: Array<[string, Record<string, unknown>, string, boolean]> = [
      ["motion allowed", {}, "", true],
      ["reduced motion", { reducedMotion: "reduce" }, "", false],
      ["Save-Data", {}, "{ saveData: true, effectiveType: '4g' }", false],
      ["2g", {}, "{ saveData: false, effectiveType: '2g' }", false],
      ["slow-2g", {}, "{ saveData: false, effectiveType: 'slow-2g' }", false],
    ];
    for (const [name, opts, conn, wantVideo] of variants) {
      const where = `${engine} 390x844 ${name}`;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...opts });
      if (conn) await ctx.addInitScript(`Object.defineProperty(Navigator.prototype, "connection", { get: () => (${conn}) });`);
      let fetched = 0;
      await ctx.route("**/about/", async (r: any) => {
        const res = await r.fetch();
        await r.fulfill({ response: res, body: (await res.text()).replace('data-src=""', 'data-src="/check-about-stand-in.mp4"') });
      });
      await ctx.route("**/check-about-stand-in.mp4", (r: any) => { fetched++; return r.fulfill({ status: 204, body: "" }); });
      const page = await ctx.newPage();
      await page.goto(ABOUT, { waitUntil: "load" });
      await page.waitForTimeout(1200);
      const s = await page.evaluate(() => ({
        video: document.querySelectorAll("video").length,
        motion: document.documentElement.classList.contains("motion"),
        hiddenText: [...document.querySelectorAll(".reveal")].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.95).length,
      }));
      const okVideo = wantVideo ? s.video === 1 : s.video === 0 && fetched === 0;
      report(where, wantVideo ? "a set video would start" : "still artwork, no video", okVideo, `video elements ${s.video}, video requests ${fetched}`);
      if (name === "reduced motion") report(where, "every word shown at once", !s.motion && s.hiddenText === 0, `motion class ${s.motion}, hidden reveals ${s.hiddenText}`);
      await ctx.close();
    }

    // Without JavaScript every word is there and visible.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(ABOUT, { waitUntil: "load" });
      const s = await page.evaluate(() => ({
        hidden: [...document.querySelectorAll(".reveal")].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.95).length,
        chapters: document.querySelectorAll("main > section").length,
        selectable: getComputedStyle(document.querySelector("main")!).userSelect !== "none",
      }));
      report(`${engine} 390x844 no JavaScript`, "readable", s.hidden === 0 && s.chapters === 5 && s.selectable, `${s.chapters} chapters, hidden reveals ${s.hidden}, selectable ${s.selectable}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}
console.log(failures ? `${failures} failed` : "all pass");
process.exitCode = failures ? 1 : 0;
