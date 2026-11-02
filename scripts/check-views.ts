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

// A point inside a name where a tap really reaches it: the name is on top
// there, and it is outside the own star's 44px target, which wins over a
// name (scripts are told this, not left to chance). Throws if the name has
// no such point.
type Tappable = { evaluate: <T, A>(fn: (a: A) => T, a: A) => Promise<T> };
async function tappablePoint(p: Tappable, area: string) {
  const pt = await p.evaluate((area: string) => {
    const a = document.querySelector<HTMLElement>(`#regions a.region[data-region="${area}"]`)!;
    const r = a.getBoundingClientRect();
    const core = document.querySelector("#stars .star.own .star-core")?.getBoundingClientRect();
    const cx = core ? core.left + core.width / 2 : -1e6, cy = core ? core.top + core.height / 2 : -1e6;
    const ys = [0.5, 0.3, 0.7, 0.15, 0.85], xs = [0.5, 0.3, 0.7, 0.15, 0.85, 0.05, 0.95];
    for (const fy of ys) for (const fx of xs) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (Math.hypot(x - cx, y - cy) <= 24) continue;
      if (document.elementFromPoint(x, y)?.closest("a.region") === a) return { x, y };
    }
    return null;
  }, area);
  if (!pt) throw new Error(`check-views: the ${area} name has no point a tap can reach (all under the own star's target or covered)`);
  return pt;
}

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
      const otherId: string = (await (await other.request.post(B + "api/star", { data: {} })).json()).star.id;
      await other.request.post(B + "api/star/constellation", { data: { constellation: "engineering" } });
      await other.close();

      const page = await ctx.newPage();
      // Wait until this page knows the other browser's star is settled in
      // Engineering (from its first snapshot or the live stream), so a view
      // switch is judged on current state. By id: the database is shared
      // across sizes and engines, so "any Engineering star" can be an older
      // one and would not wait at all.
      const otherSettled = () => page.waitForFunction((id: string) => document.querySelector(`#stars .star[data-id="${id}"]`)?.getAttribute("data-constellation") === "engineering", otherId, { timeout: 5000 });
      const enter = async () => { await page.click("#arrival-submit"); await page.click("#film-skip"); await page.waitForTimeout(700); };
      const home = async () => { await page.evaluate(() => (window as unknown as { setView: (v: null) => void }).setView(null)); await page.waitForTimeout(50); };

      await page.goto(B + "#science");
      await enter();
      let s = await state(page, "science");
      report(engine, size, "direct #science", verdict(s, "science"), describe(s));

      await home();
      await otherSettled();
      if (phone) { await page.click("#place-toggle"); await page.click('#place-sheet a.sheet-row[data-view="engineering"]'); }
      else await page.click('.lounge-nav a[data-view="engineering"]');
      s = await state(page, "engineering");
      report(engine, size, phone ? "place chooser" : "top bar", verdict(s, "engineering"), describe(s));

      await home();
      const at = await tappablePoint(page, "science");
      if (phone) await page.touchscreen.tap(at.x, at.y);
      else await page.mouse.click(at.x, at.y);
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

      // Deliberately: the own star over a name. A press on the star picks
      // the star up and never opens the constellation; the name is still
      // reachable from the rest of its box, the top bar and the chooser.
      {
        const c2 = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone });
        await c2.request.post(B + "api/star", { data: {} });
        const p2 = await c2.newPage();
        await p2.goto(B); await p2.click("#arrival-submit"); await p2.click("#film-skip"); await p2.waitForTimeout(700);
        const star = await p2.evaluate(() => {
          const w = window as unknown as { toStagePoint: (x: number, y: number) => { x: number; y: number }; moveOwnLocally: (x: number, y: number) => void };
          const r = document.querySelector('#regions a.region[data-region="engineering"]')!.getBoundingClientRect();
          const q = w.toStagePoint(r.left + r.width / 2, r.top + r.height / 2);
          w.moveOwnLocally(q.x, q.y);
          const core = document.querySelector("#stars .star.own .star-core")!.getBoundingClientRect();
          return { x: core.left + core.width / 2, y: core.top + core.height / 2 };
        });
        if (phone) await p2.touchscreen.tap(star.x, star.y); else await p2.mouse.click(star.x, star.y);
        await p2.waitForTimeout(150);
        const picked = await p2.evaluate(() => ({ view: document.body.dataset.view, picked: document.querySelector("#stars .star.own")!.classList.contains("picked") }));
        report(engine, size, "star over a name: press picks the star", picked.view === "common" && picked.picked, `view=${picked.view} picked=${picked.picked}`);
        await p2.keyboard.press("Escape");
        await p2.evaluate(() => (window as unknown as { setPicked: (on: boolean) => void }).setPicked(false));
        const elsewhere = await tappablePoint(p2, "engineering");
        if (phone) await p2.touchscreen.tap(elsewhere.x, elsewhere.y); else await p2.mouse.click(elsewhere.x, elsewhere.y);
        let s2 = await state(p2, "engineering");
        report(engine, size, "star over a name: rest of the name opens it", s2.view === "engineering", `view=${s2.view}`);
        await p2.evaluate(() => (window as unknown as { setView: (v: null) => void }).setView(null));
        if (phone) { await p2.click("#place-toggle"); await p2.click('#place-sheet a.sheet-row[data-view="engineering"]'); }
        else await p2.click('.lounge-nav a[data-view="engineering"]');
        s2 = await state(p2, "engineering");
        report(engine, size, `star over a name: ${phone ? "chooser" : "top bar"} opens it`, s2.view === "engineering", `view=${s2.view}`);
        await c2.close();
      }
    }
  } finally {
    await browser.close();
  }
}
console.log(failures ? `${failures} failed` : "all pass");
process.exitCode = failures ? 1 : 0;
