// Browser layout checks for the lounge at phone, tablet and laptop sizes.
//
// Run it against a running app with a throwaway database, never production:
// the "star" state places a star.
//
//   APP_URL=http://localhost:8080 node scripts/check-mobile.ts [--markdown]
//
// Playwright is not a dependency of the app. Point PLAYWRIGHT at an install
// (default: plain `playwright` resolution). Exits 1 if any check fails.
//
// A phone is at most 600px wide or 500px tall. Phones get the full set of
// checks from the mobile lounge plan; larger screens get only the checks that
// apply everywhere (no overlapping constellation names, no sideways scroll).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");

const APP_URL = process.env.APP_URL ?? "http://localhost:8080";
const MARKDOWN = process.argv.includes("--markdown");

// The check places stars, which have no delete path, so it never runs
// against anything but a local server.
if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(APP_URL).hostname)) {
  console.error(`check-mobile: refusing ${APP_URL}; it writes stars, and CLAUDE.md says live checks against production are read-only. Use a local throwaway server.`);
  process.exit(1);
}

const SIZES: Array<[number, number]> = [
  [360, 844], [390, 844], [414, 896], [430, 932], [844, 390], [768, 1024], [1024, 768],
];
const STATES = ["no-star", "star"] as const;

const isPhone = (w: number, h: number) => w <= 600 || h <= 500;

type Result = { size: string; state: string; check: string; pass: boolean; measured: string };
const results: Result[] = [];
const record = (size: string, state: string, check: string, pass: boolean, measured: string) =>
  results.push({ size, state, check, pass, measured });

const browser = await chromium.launch();
try {
  for (const [w, h] of SIZES) {
    for (const state of STATES) {
      const size = `${w}x${h}`;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: isPhone(w, h) });
      if (state === "star") {
        const res = await ctx.request.post(new URL("/api/star", APP_URL).toString(), { data: {} });
        if (!res.ok()) throw new Error(`could not place a star: ${res.status()}`);
      }
      const page = await ctx.newPage();
      await page.goto(APP_URL, { waitUntil: "load" });
      // Enter plays the film on every visit; skip it into the lounge.
      await page.click("#arrival-submit");
      await page.click("#film-skip");
      // The arrival fades out over 600ms.
      await page.waitForTimeout(900);

      const m = await page.evaluate(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const box = (sel: string) => {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const shown = !el.hidden && cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, shown };
        };
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !(el as HTMLElement).closest("[hidden]")
            && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
        };
        // Visible area of the field: the stage minus whatever sits on top of it.
        const stage = box("#stage");
        const header = box(".topbar");
        const dock = box(".dock");
        const hero = box(".hero");
        let fieldTop = stage ? Math.max(0, stage.top) : 0;
        let fieldBottom = stage ? Math.min(vh, stage.bottom) : 0;
        if (header?.shown) fieldTop = Math.max(fieldTop, header.bottom);
        if (hero?.shown && hero.top < vh / 2) fieldTop = Math.max(fieldTop, hero.bottom);
        if (dock?.shown) fieldBottom = Math.min(fieldBottom, dock.top);
        const field = Math.max(0, fieldBottom - fieldTop);

        const labels = [...document.querySelectorAll("#regions .region")].filter(visible).map((el) => {
          const r = el.getBoundingClientRect();
          return { name: el.getAttribute("data-region") ?? "", left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
        const overlaps: string[] = [];
        for (let i = 0; i < labels.length; i++) {
          for (let j = i + 1; j < labels.length; j++) {
            const a = labels[i]!, b = labels[j]!;
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push(`${a.name}/${b.name}`);
          }
        }

        const targets = [...document.querySelectorAll("#sky-app a, #sky-app button, #sky-app input, #sky-app textarea, #sky-app select")]
          .filter(visible)
          .map((el) => {
            const r = el.getBoundingClientRect();
            const name = el.id ? `#${el.id}` : (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 20);
            return { name, w: Math.round(r.width), h: Math.round(r.height) };
          });
        const small = targets.filter((t) => t.w < 44 || t.h < 44);

        const callsign = document.querySelector("#callsign-form, #callsign-current");
        const callsignInDock = Boolean(callsign && callsign.closest(".dock") && [...document.querySelectorAll(".dock #callsign-form, .dock #callsign-current")].some(visible));

        return {
          vw, vh,
          header: header?.shown ? Math.round(header.height) : 0,
          field: Math.round(field),
          fieldPct: Math.round((field / vh) * 100),
          dock: dock?.shown ? Math.round(dock.height) : 0,
          heroShown: Boolean(hero?.shown),
          overlaps,
          labelCount: labels.length,
          targets: targets.length,
          small: small.map((t) => `${t.name} ${t.w}x${t.h}`),
          callsignInDock,
          scrollX: document.documentElement.scrollWidth - vw,
        };
      });

      record(size, state, "no sideways scroll", m.scrollX <= 0, `overflow ${m.scrollX}px`);
      record(size, state, "constellation names do not overlap", m.overlaps.length === 0,
        m.overlaps.length ? `${m.labelCount} names, overlapping: ${m.overlaps.join(", ")}` : `${m.labelCount} names, none overlap`);

      if (isPhone(w, h)) {
        record(size, state, "header ≤ 52px", m.header > 0 && m.header <= 52, `${m.header}px`);
        record(size, state, "no heading block", !m.heroShown, m.heroShown ? "heading shown" : "hidden");
        record(size, state, "field ≥ 60% of viewport", m.fieldPct >= 60, `${m.field}px = ${m.fieldPct}%`);
        record(size, state, "dock ≤ 72px collapsed", m.dock > 0 && m.dock <= 72, `${m.dock}px`);
        record(size, state, "callsign not in dock", !m.callsignInDock, m.callsignInDock ? "in dock" : "not in dock");
        record(size, state, "targets ≥ 44px", m.small.length === 0,
          m.small.length ? `${m.small.length}/${m.targets} small: ${m.small.slice(0, 6).join("; ")}${m.small.length > 6 ? "; …" : ""}` : `${m.targets} targets, all ≥ 44px`);

        // The conversation opens as a full-screen sheet on a phone.
        // On a phone the conversation is reached through the Menu.
        if (await page.isVisible("#menu-toggle")) {
          await page.click("#menu-toggle");
          await page.click('#menu-sheet [data-menu="chat"]');
        } else {
          await page.click("#chat-toggle");
        }
        await page.waitForTimeout(400);
        const sheet = await page.evaluate(() => {
          const r = document.getElementById("chat-panel")!.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
        });
        const full = sheet.left <= 0 && sheet.top <= 0 && sheet.w >= m.vw && sheet.h >= m.vh;
        record(size, state, "conversation is full-screen", full, `${sheet.w}x${sheet.h} at ${sheet.left},${sheet.top}`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
if (MARKDOWN) {
  console.log("| Size | State | Check | Result | Measured |");
  console.log("|---|---|---|---|---|");
  for (const r of results) console.log(`| ${r.size} | ${r.state} | ${r.check} | ${r.pass ? "pass" : "**fail**"} | ${r.measured} |`);
  console.log(`\n${results.length - failed.length} of ${results.length} checks pass.`);
} else {
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.size} ${r.state}  ${r.check}: ${r.measured}`);
  console.log(`${results.length - failed.length}/${results.length} pass`);
}
process.exitCode = failed.length ? 1 : 0;
