// Browser check that every way into a constellation draws its figure and
// exactly its settled stars, at once: the top bar, a name in the field, the
// phone's place chooser, a direct #address, back and forward, reload, and a
// resize. Runs in Chromium and WebKit.
//
//   APP_URL=http://localhost:8080 PLAYWRIGHT=<path> node scripts/check-views.ts
//
// It places stars, so like scripts/check-mobile.ts it refuses any host but a
// local one. Exits 1 if any check fails.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT ?? "playwright");

const APP_URL = process.env.APP_URL ?? "http://localhost:8080";
if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(APP_URL).hostname)) {
  console.error(`check-views: refusing ${APP_URL}; it writes stars, and CLAUDE.md says live checks against production are read-only. Use a local throwaway server.`);
  process.exit(1);
}
const B = new URL("/", APP_URL).toString();
const SIZES: Array<[number, number]> = [[1440, 900], [390, 844], [844, 390]];
const isPhone = (w: number, h: number) => w <= 600 || h <= 500;

let failures = 0;
const report = (engine: string, size: string, path: string, ok: boolean, detail: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${engine} ${size}  ${path}: ${detail}`);
};

// What the open view shows, in the next frame: its figure, and how many of
// the stars settled there are drawn inside the stage.
type Page = { evaluate: <T>(fn: (area: string) => T, area: string) => Promise<T> };
// Two frames: after a resize the first can still be laid out at the old size.
const state = (p: Page, area: string) => p.evaluate((area) => new Promise<{ view: string; figure: boolean; expected: number; drawn: number; ownIn: boolean | null }>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
  const st = document.getElementById("stage")!.getBoundingClientRect();
  const inside = (r: DOMRect) => r.width > 0 && r.left >= st.left - 1 && r.right <= st.right + 1 && r.top >= st.top - 1 && r.bottom <= st.bottom + 1;
  const settled = [...document.querySelectorAll<SVGGElement>("#stars .star")].filter((g) => g.dataset.constellation === area);
  const drawn = settled.filter((g) => !g.classList.contains("away") && inside(g.getBoundingClientRect()));
  const own = document.querySelector<SVGGElement>("#stars .star.own");
  const fig = document.querySelector(`#figures [data-figure="${area}"]`);
  resolve({
    view: document.body.dataset.view ?? "",
    figure: Boolean(fig && inside(fig.getBoundingClientRect())),
    expected: settled.length,
    drawn: drawn.length,
    ownIn: own && own.dataset.constellation === area ? inside(own.getBoundingClientRect()) : null,
  });
}))), area);

const verdict = (s: Awaited<ReturnType<typeof state>>, area: string) =>
  s.view === area && s.figure && s.drawn === s.expected && s.ownIn !== false;
const describe = (s: Awaited<ReturnType<typeof state>>) =>
  `view=${s.view} figure=${s.figure ? "drawn" : "MISSING"} stars ${s.drawn}/${s.expected}${s.ownIn === null ? "" : ` own=${s.ownIn ? "drawn" : "MISSING"}`}`;

for (const engine of ["chromium", "webkit"]) {
  const browser = await pw[engine].launch();
  try {
    for (const [w, h] of SIZES) {
      const size = `${w}x${h}`;
      const phone = isPhone(w, h);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone });
      // This browser's star is settled in Science; another is in Engineering.
      await ctx.request.post(B + "api/star", { data: {} });
      await ctx.request.post(B + "api/star/constellation", { data: { constellation: "science" } });
      const other = await browser.newContext();
      await other.request.post(B + "api/star", { data: {} });
      await other.request.post(B + "api/star/constellation", { data: { constellation: "engineering" } });
      await other.close();

      const page = await ctx.newPage();
      // Wait until the live stream has brought the other browser's settled
      // star, so a view switch is judged on current state.
      const settledIn = (area: string) => page.waitForFunction((a: string) => document.querySelectorAll(`#stars .star[data-constellation="${a}"]`).length > 0, area, { timeout: 5000 });
      const enter = async () => { await page.click("#arrival-submit"); await page.click("#film-skip"); await page.waitForTimeout(700); };
      const home = async () => { await page.evaluate(() => (window as unknown as { setView: (v: null) => void }).setView(null)); await page.waitForTimeout(50); };

      await page.goto(B + "#science");
      await enter();
      let s = await state(page, "science");
      report(engine, size, "direct #science", verdict(s, "science"), describe(s));

      await home();
      await settledIn("engineering");
      if (phone) { await page.click("#place-toggle"); await page.click('#place-sheet a.sheet-row[data-view="engineering"]'); }
      else await page.click('.lounge-nav a[data-view="engineering"]');
      s = await state(page, "engineering");
      report(engine, size, phone ? "place chooser" : "top bar", verdict(s, "engineering"), describe(s));

      await home();
      await page.click('#regions a.region[data-region="science"]');
      s = await state(page, "science");
      report(engine, size, "name in the field", verdict(s, "science"), describe(s));

      await page.goBack(); await page.waitForTimeout(50);
      await page.goForward();
      s = await state(page, "science");
      report(engine, size, "back then forward", verdict(s, "science"), describe(s));

      await page.reload(); await enter();
      s = await state(page, "science");
      report(engine, size, "reload", verdict(s, "science"), describe(s));

      await page.setViewportSize({ width: h, height: w }); await page.waitForTimeout(150);
      s = await state(page, "science");
      report(engine, size, "rotate", verdict(s, "science"), describe(s));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}
console.log(failures ? `${failures} failed` : "all pass");
process.exitCode = failures ? 1 : 0;
