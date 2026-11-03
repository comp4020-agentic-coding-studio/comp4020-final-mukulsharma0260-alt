// Browser check for the About page at /about/, in Chromium and WebKit, at
// every size in the About brief: the first screen, the teleprompter (one
// thought lit at a time, each fitting the screen), sideways scroll, target
// sizes, measured contrast, keyboard order, back and forward, and that the
// page stays out of the lounge (no stream, no API call, no cookie), then that
// going back to the lounge from it opens exactly one stream.
//
//   APP_URL=http://localhost:8080 PLAYWRIGHT=<path> node scripts/check-about.ts
//
// SHOTS=<dir> saves screenshots. The first chapter's NASA background video
// is checked as shipped; its failures (a broken file, a refused play, a
// hidden tab) are made inside the test browser, never on the server.
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
const MOON = /\/assets\/about-moon-576\.(mp4|webm)$/;
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
      // Only text a reader can see now: not visually hidden, fully shown. A
      // waiting teleprompter thought is dimmed on purpose; it is measured
      // when it is the one being read.
      let dim = el.getBoundingClientRect().width <= 1;
      for (let e: Element | null = el; e && !dim; e = e.parentElement) dim = parseFloat(getComputedStyle(e).opacity) < 0.99;
      if (dim) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length || rects.some((r) => r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth)) continue;
      // Words passing under the fixed header or the chapter dots are covered
      // (both sit on an opaque shade), so they are measured once clear.
      if (!el.closest(".about-bar, .about-progress")) {
        const covers = [...document.querySelectorAll(".about-bar, .about-progress")].map((c) => c.getBoundingClientRect());
        if (rects.some((r) => covers.some((c) => r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top))) continue;
      }
      const m = getComputedStyle(el).color.match(/[\d.]+/g)!.map(Number);
      const lt = lum(m[0]!, m[1]!, m[2]!);
      let worst = 21;
      for (const r of rects) for (let y = r.top + 1; y < r.bottom - 1; y += 2) for (let x = r.left + 1; x < r.right - 1; x += 2) {
        const i = (Math.floor(y * scale) * cv.width + Math.floor(x * scale)) * 4;
        const lb = lum(px[i]!, px[i + 1]!, px[i + 2]!);
        worst = Math.min(worst, (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
      }
      // Keyed by place in the document, so two runs with the same words are
      // measured separately.
      out.push([`${k}: ${t.slice(0, 40)}`, worst]);
    }
    return out;
  }, png);
  for (const [t, c] of found) seen.set(t, Math.min(seen.get(t) ?? 21, c));
}

// Scroll the whole page in steps, letting each thought light. Each step is
// at most half the space clear of the header and the chapter dots, so every
// run of words comes to rest wholly clear of both at some step.
async function scrollThrough(page: Pg, each?: () => Promise<void>) {
  const total: number = await page.evaluate(() => document.documentElement.scrollHeight);
  const h: number = await page.evaluate(() => innerHeight);
  const clear: number = await page.evaluate(() => {
    const rail = document.querySelector(".about-progress")!.getBoundingClientRect();
    return (rail.top > innerHeight / 2 ? rail.top : innerHeight) - document.querySelector(".about-bar")!.getBoundingClientRect().bottom;
  });
  const step = Math.floor(Math.min(h, clear) / 2.5);
  for (let y = 0; ; y += step) {
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

      // The first screen: the chapter title and the cue to scroll, clear of
      // the bar, and no big call to action anywhere on it.
      const fold = await page.evaluate(() => {
        const bar = document.querySelector(".about-bar")!.getBoundingClientRect().bottom;
        const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const o = (s: string) => parseFloat(getComputedStyle(document.querySelector(s)!).opacity);
        const items = ["#how .chapter-kicker", "#how h1", "#how .chapter-cue"].map((s) => ({ s, top: r(s).top, bottom: r(s).bottom, bar, opacity: o(s) }));
        const ctas = [...document.querySelectorAll("main a")].filter((a) => { const b = a.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; }).map((a) => a.textContent!.trim());
        return { items, ctas };
      });
      // In place, and already shown: the first screen never waits on a fade.
      const bad = fold.items.filter((f: any) => f.top < f.bar - 1 || f.bottom > h || f.opacity < 0.99);
      report(where, "first screen", bad.length === 0 && fold.ctas.length === 0, bad.length || fold.ctas.length ? `${bad.map((f: any) => `${f.s} ${Math.round(f.top)}-${Math.round(f.bottom)} (bar ${Math.round(f.bar)}, view ${h}) opacity ${f.opacity.toFixed(2)}`).join("; ")}${fold.ctas.length ? `; links on it: ${fold.ctas.join(", ")}` : ""}` : "How Overlap works and the cue shown without scrolling or waiting; no link in the story on it");
      // The largest paint, read before any scrolling: later reveals would
      // otherwise keep moving it.
      const lcp: number = await page.evaluate(() => (window as any).__perf.lcp);

      // The teleprompter: each thought, brought to the middle of the screen,
      // is the one lit, alone, and fits whole between the bar and the
      // chapter dots (which sit at the bottom on a phone).
      const beats: number = await page.evaluate(() => document.querySelectorAll(".about-beat").length);
      const unfit: string[] = [];
      for (let i = 0; i < beats; i++) {
        // Its words brought to the middle of the space they can use.
        await page.evaluate((i: number) => {
          const kids = [...document.querySelectorAll(".about-beat")[i]!.children].map((k) => k.getBoundingClientRect());
          const mid = (Math.min(...kids.map((k) => k.top)) + Math.max(...kids.map((k) => k.bottom))) / 2;
          const bar = document.querySelector(".about-bar")!.getBoundingClientRect().bottom;
          const rail = document.querySelector(".about-progress")!.getBoundingClientRect();
          const floor = rail.top > innerHeight / 2 ? rail.top : innerHeight;
          window.scrollTo({ top: scrollY + mid - (bar + floor) / 2, behavior: "instant" });
        }, i);
        await page.waitForTimeout(900);
        const b = await page.evaluate((i: number) => {
          const all = [...document.querySelectorAll(".about-beat")];
          const el = all[i]!;
          const kids = [...el.children].map((k) => k.getBoundingClientRect());
          const top = Math.min(...kids.map((k) => k.top)), bottom = Math.max(...kids.map((k) => k.bottom));
          const right = Math.max(...kids.map((k) => k.right));
          const bar = document.querySelector(".about-bar")!.getBoundingClientRect().bottom;
          const rail = document.querySelector(".about-progress")!.getBoundingClientRect();
          const floor = rail.top > innerHeight / 2 ? rail.top : innerHeight;
          const wall = rail.top > innerHeight / 2 ? innerWidth : rail.left;
          return { top, bottom, right, bar, floor, wall, opacity: parseFloat(getComputedStyle(el).opacity), lit: all.filter((x) => x.classList.contains("is-current")).length, current: el.classList.contains("is-current") };
        }, i);
        if (b.top < b.bar - 1 || b.bottom > b.floor + 1 || b.right > b.wall + 1 || b.opacity < 0.99 || !b.current || b.lit !== 1)
          unfit.push(`thought ${i + 1}: ${Math.round(b.top)}-${Math.round(b.bottom)} between ${Math.round(b.bar)} and ${Math.round(b.floor)}, right ${Math.round(b.right)} of ${Math.round(b.wall)}, opacity ${b.opacity.toFixed(2)}, lit ${b.lit}${b.current ? "" : " (not this one)"}`);
      }
      report(where, "one thought at a time, each fitting", beats === 5 && unfit.length === 0, unfit.length ? unfit.join("; ") : `${beats} thoughts, each lit alone and whole on screen`);

      // Sideways scroll and contrast, everywhere on the page.
      const seen = new Map<string, number>();
      let wide = 0;
      await scrollThrough(page, async () => {
        wide = Math.max(wide, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
        await contrastPass(page, seen);
      });
      report(where, "no sideways scroll", wide <= 0, `scrollWidth - innerWidth = ${wide}`);
      // Every run a reader could see, keyed as contrastPass keys them.
      const words: string[] = await page.evaluate(() => {
        const out: string[] = []; let k = -1; const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode(); t; t = walk.nextNode()) {
          const x = (t.textContent ?? "").trim();
          if (!x || t.parentElement!.closest("script, style, [aria-hidden='true']")) continue;
          k++;
          // Visually hidden names (the chapter labels on a phone) are not seen.
          if (t.parentElement!.getBoundingClientRect().width > 1) out.push(`${k}: ${x.slice(0, 40)}`);
        }
        return out;
      });
      const missed = words.filter((w) => !seen.has(w));
      const low = [...seen].filter(([, c]) => c < 4.5);
      const min = Math.min(...seen.values());
      report(where, "contrast >= 4.5:1", low.length === 0 && missed.length === 0, `${words.length - missed.length}/${words.length} text runs measured, lowest ${min.toFixed(2)}:1${low.length ? `; low: ${low.map(([t, c]) => `"${t}" ${c.toFixed(2)}`).join(", ")}` : ""}${missed.length ? `; never measured: ${missed.map((t) => `"${t}"`).join(", ")}` : ""}`);

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
      // ring, never hidden under the bar or (on a phone) the chapter dots.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const order: string[] = [];
      const hidden: string[] = [];
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press(engine === "webkit" ? "Alt+Tab" : "Tab");
        // Focus scrolls smoothly; judge where the link comes to rest.
        await page.evaluate(async () => {
          for (let i = 0, y = -1; i < 40 && scrollY !== y; i++) { y = scrollY; await new Promise((ok) => setTimeout(ok, 150)); }
        });
        const f = await page.evaluate(() => {
          const a = document.activeElement as HTMLElement;
          const r = a.getBoundingClientRect();
          const bar = document.querySelector(".about-bar")!.getBoundingClientRect().bottom;
          const rail = document.querySelector(".about-progress")!.getBoundingClientRect();
          const floor = rail.top > innerHeight / 2 ? rail.top : innerHeight;
          const s = getComputedStyle(a);
          return { name: a.getAttribute("aria-label") ?? a.textContent!.trim(), ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2, covered: !!a.closest("main") && (r.top < bar - 1 || r.bottom > floor), at: `${Math.round(r.top)}-${Math.round(r.bottom)} of ${innerHeight}, bar ${Math.round(bar)}, scrollY ${Math.round(scrollY)}` };
        });
        order.push(f.name);
        if (!f.ring || f.covered) hidden.push(`${f.name}${f.ring ? "" : " (no ring)"}${f.covered ? ` (covered at ${f.at})` : ""}`);
      }
      const want = ["Overlap: back to the lounge", "Back to lounge", "How it works", "Focus", "Talking", "Return", "Return to the lounge", "Read the technical notes"];
      report(where, "keyboard order", JSON.stringify(order) === JSON.stringify(want), order.join(" → "));
      report(where, "focus visible, not under the bar", hidden.length === 0, hidden.length ? hidden.join("; ") : "ring on every stop");

      // Back and forward: a chapter dot, then into the lounge and back.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.click(".about-progress a[href='#focus']");
      await page.waitForTimeout(150);
      const hashed = new URL(page.url()).hash;
      await page.goBack(); await page.waitForTimeout(150);
      const back1 = new URL(page.url());

      // Until here the visitor has only read: nothing but GETs for the page,
      // its galaxy artwork and its background video. No stream, no API call,
      // no other file, no cookie.
      const aboutReqs = [...requests];
      const allowed = /^\/(about\/|assets\/arrival-galaxy-(960|1920)\.webp|assets\/about-moon-576\.(mp4|webm))$/;
      const strays = aboutReqs.filter((r) => r.method !== "GET" || new URL(r.url).origin !== new URL(B).origin || !allowed.test(new URL(r.url).pathname));
      report(where, "stays out of the lounge", strays.length === 0, `${aboutReqs.length} requests: ${[...new Set(aboutReqs.map((r) => new URL(r.url).pathname))].join(", ")}${strays.length ? `; strays ${strays.map((r) => `${r.method} ${r.url}`).join(", ")}` : ""}`);
      const cookies = await ctx.cookies();
      report(where, "sets no cookie", cookies.length === 0, `${cookies.length} cookies`);

      // Then this visitor places a star (as the lounge would on a tap) and
      // goes Back to lounge from the About page. A second browser in the lounge watches
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
      await page.click(".about-bar-back");
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
      report(where, "back and forward", hashed === "#focus" && back1.pathname === "/about/" && back1.hash === "" && aboutShown === "How Overlap works", `#focus then back to ${back1.pathname}${back1.hash}; lounge then back shows "${aboutShown}"`);
      report(where, "one stream after entering", atArrival === 0 && entered === 1 && backOnAbout === 0 && again === 1, `streams in the page: arrival ${atArrival}, entered ${entered}, back on About ${backOnAbout}, entered again ${again}`);
      report(where, "glows only while in the lounge", !glowAtArrival && glowEntered && !glowBack && glowAgain, `seen by another browser: arrival ${glowAtArrival ? "glowing" : "not"}, entered ${glowEntered ? "glowing" : "not"}, back on About ${glowBack ? "glowing" : "not"}, entered again ${glowAgain ? "glowing" : "not"}`);

      report(where, "no console errors", errors.length === 0, errors.length ? errors.slice(0, 3).join(" | ") : "none");
      await ctx.close();
    }

    // The moving background, as shipped. Each context counts its own video
    // requests. "broken" answers them with an empty file no browser can
    // decode; "refused" makes every play() reject, as a browser that allows
    // no autoplay would.
    const videoCtx = async (opts: Record<string, unknown>, conn: string, mode: "real" | "broken" | "refused", size: [number, number] = [390, 844]) => {
      const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, hasTouch: size[0] < 600, ...opts });
      await ctx.addInitScript(OBSERVE);
      await ctx.addInitScript(`addEventListener("load", () => { window.__loadAt = performance.now(); }); new MutationObserver(() => { if (!window.__madeAt && document.querySelector("video")) window.__madeAt = performance.now(); }).observe(document, { childList: true, subtree: true });`);
      if (conn) await ctx.addInitScript(`Object.defineProperty(Navigator.prototype, "connection", { get: () => (${conn}) });`);
      if (mode === "refused") await ctx.addInitScript(`HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException("refused by the check", "NotAllowedError")); };`);
      const seen = { fetched: 0 };
      const page = await ctx.newPage();
      page.on("request", (r: any) => { if (MOON.test(new URL(r.url()).pathname)) seen.fetched++; });
      if (mode === "broken") await ctx.route(MOON, (r: any) => r.fulfill({ status: 200, contentType: "video/mp4", body: "" }));
      const errors: string[] = [];
      page.on("console", (m: any) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e: Error) => errors.push(e.message));
      return { ctx, page, seen, errors };
    };
    const stage = (page: Pg) => page.evaluate(() => {
      const v = document.querySelector("video") as HTMLVideoElement | null;
      const slot = document.querySelector("[data-about-video]")!;
      return {
        video: document.querySelectorAll("video").length,
        inSlot: !!v && v.parentElement === slot,
        on: slot.classList.contains("is-on"),
        slotOpacity: parseFloat(getComputedStyle(slot).opacity),
        poster: /arrival-galaxy-(960|1920)\.webp/.test(getComputedStyle(document.querySelector(".about-stage")!).backgroundImage),
        playing: !!v && !v.paused,
        muted: !!v && v.muted && v.defaultMuted && v.volume >= 0,
        loop: !!v && v.loop,
        inline: !!v && v.playsInline && v.hasAttribute("playsinline"),
        controls: !!v && v.controls,
        focusable: !!v && v.tabIndex >= 0,
        audio: !!v && (((v as any).audioTracks?.length ?? 0) > 0 || (v as any).mozHasAudio === true || ((v as any).webkitAudioDecodedByteCount ?? 0) > 0),
        src: v ? new URL(v.currentSrc || v.src).pathname : "",
        lit: [...document.querySelectorAll(".about-beat")].filter((b) => parseFloat(getComputedStyle(b).opacity) < 0.99).length,
        prompter: document.documentElement.classList.contains("prompter"),
      };
    });
    const onHow = (page: Pg) => page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const where = `${engine} 390x844`;

    // Lazy: at load nothing is fetched; at the top it is fetched only after
    // its chapter has stayed in view a moment. Opened at the last chapter,
    // nothing at all until the first chapter comes back.
    {
      // Judged by the element: with preload "none" a browser that will not
      // play (headless WebKit) never fetches at all, which is fine.
      const { ctx, page, seen, errors } = await videoCtx({}, "", "real");
      await page.goto(ABOUT, { waitUntil: "load" });
      const atLoad = { fetched: seen.fetched, video: await page.evaluate(() => document.querySelectorAll("video").length) };
      await page.waitForTimeout(2000);
      const made = await page.evaluate(() => ({ at: (window as any).__madeAt ?? -1, load: (window as any).__loadAt ?? -1 }));
      report(`${where} lazy video`, "nothing made or fetched at load", atLoad.fetched === 0 && atLoad.video === 0 && made.at > 0 && made.at - made.load >= 550, `at load ${atLoad.video} video, ${atLoad.fetched} requests; made ${Math.round(made.at - made.load)}ms after load; ${seen.fetched} requests by 2s`);
      await ctx.close();
      const far = await videoCtx({}, "", "real");
      await far.page.goto(ABOUT + "#return", { waitUntil: "load" });
      await far.page.waitForTimeout(1500);
      const atReturn = await stage(far.page);
      const fetchedFar = far.seen.fetched;
      await onHow(far.page);
      await far.page.waitForTimeout(2500);
      const back = await stage(far.page);
      report(`${where} lazy video`, "made only near its chapter", atReturn.video === 0 && fetchedFar === 0 && back.video === 1 && back.inSlot, `at Return: ${atReturn.video} video, ${fetchedFar} requests; back at the top: ${back.video} video, ${far.seen.fetched} requests, ${back.src}`);
      report(`${where} lazy video`, "no console errors", errors.length === 0 && far.errors.length === 0, [...errors, ...far.errors].slice(0, 3).join(" | ") || "none");
      await far.ctx.close();
    }

    // As shipped: silent, looped, inline, no controls, never focusable; it
    // plays behind How it works only, pauses at every later chapter and
    // when the tab is hidden or the page is left, and comes back with its
    // chapter. Headless WebKit refuses a page's own play() without a gesture
    // (Safari allows a muted inline video); there the galaxy must stay.
    {
      const { ctx, page, errors } = await videoCtx({}, "", "real");
      await page.goto(ABOUT, { waitUntil: "load" });
      await page.waitForTimeout(3000);
      const top = await stage(page);
      const later: string[] = [];
      for (const id of ["focus", "talk", "return"]) {
        await page.evaluate((id: string) => { const r = document.getElementById(id)!.getBoundingClientRect(); window.scrollTo({ top: r.top + scrollY, behavior: "instant" }); }, id);
        await page.waitForTimeout(1600);
        const s = await stage(page);
        if (s.on || s.playing || s.slotOpacity > 0.01) later.push(`${id}: ${s.on ? "shown" : "hidden"}, ${s.playing ? "playing" : "paused"}, opacity ${s.slotOpacity.toFixed(2)}`);
      }
      await onHow(page); await page.waitForTimeout(2200);
      const again = await stage(page);
      await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
      await page.waitForTimeout(300);
      const hidden = await stage(page);
      await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
      await page.waitForTimeout(800);
      const shown = await stage(page);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
      await page.waitForTimeout(300);
      const left = await stage(page);
      const silent = top.muted && top.loop && top.inline && !top.controls && !top.focusable && !top.audio;
      report(`${where} video`, "silent, looped, inline, no controls, not focusable", top.video === 1 && silent, `muted ${top.muted}, loop ${top.loop}, playsinline ${top.inline}, controls ${top.controls}, focusable ${top.focusable}, audio ${top.audio}, ${top.src}`);
      if (engine === "chromium" || top.playing) {
        report(`${where} video`, "plays behind How it works only", top.on && top.playing && later.length === 0 && again.on && again.playing, `top ${top.on ? "shown" : "hidden"}/${top.playing ? "playing" : "paused"}; later chapters ${later.length ? later.join("; ") : "all hidden and paused"}; back at top ${again.on ? "shown" : "hidden"}/${again.playing ? "playing" : "paused"}`);
        report(`${where} video`, "pauses when hidden or left", !hidden.playing && shown.playing && !left.playing && !left.on, `hidden tab ${hidden.playing ? "playing" : "paused"}, shown again ${shown.playing ? "playing" : "paused"}, after pagehide ${left.playing ? "playing" : "paused"}/${left.on ? "shown" : "hidden"}`);
      } else {
        // Coming back to the chapter, WebKit may then allow play(): it must
        // then be shown and playing, or else stay hidden. Never shown paused.
        report(`${where} video, autoplay refused`, "galaxy stays", !top.on && top.slotOpacity === 0 && top.poster && later.length === 0 && (again.on === again.playing), `slot on ${top.on}, opacity ${top.slotOpacity}, galaxy ${top.poster}; later chapters ${later.length ? later.join("; ") : "all hidden"}; back at top on ${again.on}, opacity ${again.slotOpacity}`);
      }
      report(`${where} video`, "no console errors", errors.length === 0, errors.length ? errors.slice(0, 3).join(" | ") : "none");
      await ctx.close();
    }

    // Failures: an undecodable file, and a browser that refuses to play.
    // Either way the galaxy stays, with nothing blank and no error.
    for (const mode of ["broken", "refused"] as const) {
      const { ctx, page, seen, errors } = await videoCtx({}, "", mode);
      await page.goto(ABOUT, { waitUntil: "load" });
      await page.waitForTimeout(2500);
      const s = await stage(page);
      // An undecodable file is dropped once fetched; a browser that does not
      // fetch it (play refused, preload none) just never shows it.
      const gone = mode === "broken" && seen.fetched > 0 ? s.video === 0 : !s.playing;
      report(`${where} ${mode === "broken" ? "undecodable video" : "play refused"}`, "galaxy stays, no error", gone && !s.on && s.slotOpacity === 0 && s.poster && errors.length === 0, `requests ${seen.fetched}, video elements ${s.video}, slot on ${s.on}, opacity ${s.slotOpacity}, galaxy ${s.poster}, errors ${errors.length ? errors.join(" | ") : "none"}`);
      await ctx.close();
    }

    // Reduced motion, Save-Data, 2g and slow-2g: never made, never fetched.
    const guards: Array<[string, Record<string, unknown>, string]> = [
      ["reduced motion", { reducedMotion: "reduce" }, ""],
      ["Save-Data", {}, "{ saveData: true, effectiveType: '4g' }"],
      ["2g", {}, "{ saveData: false, effectiveType: '2g' }"],
      ["slow-2g", {}, "{ saveData: false, effectiveType: 'slow-2g' }"],
    ];
    for (const [name, opts, conn] of guards) {
      const { ctx, page, seen } = await videoCtx(opts, conn, "real");
      await page.goto(ABOUT, { waitUntil: "load" });
      await page.waitForTimeout(2000);
      const s = await stage(page);
      report(`${where} ${name}`, "still galaxy, no video", s.video === 0 && seen.fetched === 0 && s.poster, `video elements ${s.video}, video requests ${seen.fetched}, galaxy ${s.poster}`);
      if (name === "reduced motion") {
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        await page.waitForTimeout(400);
        const end = await stage(page);
        report(`${where} ${name}`, "every thought shown at once", !end.prompter && end.lit === 0, `teleprompter ${end.prompter}, dimmed thoughts ${end.lit}`);
      }
      await ctx.close();
    }

    // The words over the moving footage, at desktop and phone sizes:
    // measured at each thought of the first chapter while the video plays.
    for (const size of [[1920, 1080], [390, 844], [360, 844], [414, 896]] as Array<[number, number]>) {
      const at = `${engine} ${size[0]}x${size[1]} over the video`;
      const { ctx, page, errors } = await videoCtx({}, "", "real", size);
      await page.goto(ABOUT, { waitUntil: "load" });
      await page.waitForTimeout(3000);
      const playing = (await stage(page)).playing;
      if (engine === "webkit" && !playing) { await ctx.close(); continue; }
      const shots = new Map<string, number>();
      await contrastPass(page, shots);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/about-${engine}-${size[0]}x${size[1]}-video-0.png` });
      const n: number = await page.evaluate(() => document.querySelectorAll("#how .about-beat").length);
      let stillPlaying = true;
      for (let i = 0; i < n; i++) {
        await page.evaluate((i: number) => { const k = [...document.querySelectorAll("#how .about-beat")[i]!.children].map((c) => c.getBoundingClientRect()); const mid = (Math.min(...k.map((r) => r.top)) + Math.max(...k.map((r) => r.bottom))) / 2; window.scrollTo({ top: scrollY + mid - innerHeight / 2, behavior: "instant" }); }, i);
        await page.waitForTimeout(1200);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/about-${engine}-${size[0]}x${size[1]}-video-${i + 1}.png` });
        // Three frames apart, so a bright moment in the footage is caught.
        for (let f = 0; f < 3; f++) { await contrastPass(page, shots); await page.waitForTimeout(400); }
        stillPlaying &&= (await stage(page)).playing;
      }
      const low = [...shots].filter(([, c]) => c < 4.5);
      report(at, "contrast >= 4.5:1", playing && stillPlaying && shots.size > 0 && low.length === 0, `playing ${playing && stillPlaying}, ${shots.size} text runs, lowest ${Math.min(...shots.values()).toFixed(2)}:1${low.length ? `; low: ${low.map(([t, c]) => `"${t}" ${c.toFixed(2)}`).join(", ")}` : ""}`);
      report(at, "no console errors", errors.length === 0, errors.length ? errors.slice(0, 3).join(" | ") : "none");
      await ctx.close();
    }

    // Performance with the video against without it (reduced motion makes
    // none), Chromium only: the largest paint, and long tasks and layout
    // shift over the first 4 seconds, while the video starts and plays.
    if (engine === "chromium") {
      const perfOf = async (opts: Record<string, unknown>, size: [number, number]) => {
        const { ctx, page, seen } = await videoCtx(opts, "", "real", size);
        let bytes = 0;
        page.on("response", async (r: any) => { if (MOON.test(new URL(r.url()).pathname)) { try { bytes += (await r.body()).length; } catch {} } });
        await page.goto(ABOUT, { waitUntil: "load" });
        await page.waitForTimeout(4000);
        const p = await page.evaluate(() => ({ ...(window as any).__perf, load: (window as any).__loadAt, playing: !!document.querySelector("video") && !(document.querySelector("video") as HTMLVideoElement).paused }));
        await ctx.close();
        return { ...p, fetched: seen.fetched, bytes };
      };
      for (const size of [[1920, 1080], [390, 844]] as Array<[number, number]>) {
        const withV = await perfOf({}, size);
        const without = await perfOf({ reducedMotion: "reduce" }, size);
        const fmt = (p: any) => `LCP ${Math.round(p.lcp)}ms, load ${Math.round(p.load)}ms, long tasks ${p.long.length}, CLS ${p.cls.toFixed(4)}, video ${p.playing ? "playing" : "none"}, ${p.fetched} video requests, ${(p.bytes / 1024 / 1024).toFixed(2)} MB of video in 4s`;
        report(`chromium ${size[0]}x${size[1]} performance`, "video adds no long task, no shift, no slower paint", withV.playing && withV.long.length === 0 && withV.cls === 0 && withV.lcp > 0 && withV.lcp <= 1000 && withV.lcp <= without.lcp + 100, `with video: ${fmt(withV)} | without: ${fmt(without)}`);
      }
    }

    // Without JavaScript every word is there and fully shown.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(ABOUT, { waitUntil: "load" });
      const s = await page.evaluate(() => ({
        dimmed: [...document.querySelectorAll(".about-beat")].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length,
        beats: document.querySelectorAll(".about-beat").length,
        chapters: document.querySelectorAll("main > section").length,
        selectable: getComputedStyle(document.querySelector("main")!).userSelect !== "none",
      }));
      report(`${where} no JavaScript`, "readable", s.dimmed === 0 && s.beats === 5 && s.chapters === 4 && s.selectable, `${s.chapters} chapters, ${s.beats} thoughts, dimmed ${s.dimmed}, selectable ${s.selectable}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}
console.log(failures ? `${failures} failed` : "all pass");
process.exitCode = failures ? 1 : 0;
