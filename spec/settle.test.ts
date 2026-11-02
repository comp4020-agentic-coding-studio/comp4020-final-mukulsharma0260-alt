import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { expect, inject, it } from "vitest";

// Settling is one explicit action, reachable from the Common Room: the
// place sheet offers "Settle my star in X" for each constellation and
// "Leave X" for the one the star is in. Navigation alone never changes
// where the star is. The server decides, from the cookie, on every call.
const baseUrl = inject("baseUrl");
const skyJs = readFileSync(new URL("../public/sky.js", import.meta.url), "utf8");

async function newStar() {
  const res = await fetch(new URL("/api/star", baseUrl), { method: "POST", body: "{}" });
  const { star } = (await res.json()) as { star: { id: string } };
  return { cookie: res.headers.get("set-cookie")!.split(";")[0]!, id: star.id };
}

const settleOverHttp = (cookie: string | undefined, body: unknown) =>
  fetch(new URL("/api/star/constellation", baseUrl), {
    method: "POST",
    headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// A page whose fetch really reaches the server with this browser's cookie.
async function open(cookie: string, phone = false) {
  const html = await (await fetch(new URL("/", baseUrl), { headers: { Cookie: cookie } })).text();
  const dom = new JSDOM(html, { url: baseUrl, runScripts: "outside-only" });
  const { window } = dom;
  const calls: string[] = [];
  Object.assign(window, {
    matchMedia: (q: string) => ({ matches: phone && q.includes("600px"), addEventListener() {} }),
    CSS: { escape: (s: string) => s },
    EventSource: class { addEventListener() {} close() {} },
    fetch: async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
      // Only the settling calls: a visitor with a star also checks in.
      if (init?.method === "POST" && url === "/api/star/constellation") calls.push(`${url} ${init.body ?? ""}`);
      return fetch(new URL(url, baseUrl), { ...init, headers: { ...(init?.headers ?? {}), Cookie: cookie } });
    },
  });
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  window.eval(skyJs);
  const doc = window.document;
  doc.getElementById("arrival-submit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  doc.getElementById("film-skip")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  // Only what the sheet offers counts: a control hidden itself, or in a
  // hidden row, is not there to press. (The sheet itself is closed until
  // opened; that does not change what it offers.)
  const shown = (el: HTMLButtonElement | null) => (el && !el.hidden && !el.closest("li[hidden]") ? el : null);
  const settle = (area: string) => shown(doc.querySelector<HTMLButtonElement>(`#place-sheet [data-settle="${area}"]`));
  const leave = () => shown(doc.querySelector<HTMLButtonElement>("#place-sheet [data-leave]"));
  const flush = () => new Promise((r) => setTimeout(r, 60));
  return { window, doc, calls, settle, leave, flush, close: () => window.close() };
}

it("from the Common Room, the place sheet offers to settle the star in each constellation, by name", async () => {
  const { cookie } = await newStar();
  const p = await open(cookie);
  try {
    expect(p.doc.body.dataset.view).toBe("common");
    for (const [area, name] of [["science", "Science"], ["engineering", "Engineering"], ["business", "Business"], ["health", "Health"], ["arts", "Arts & Society"]]) {
      const b = p.settle(area);
      expect(b?.tagName, area).toBe("BUTTON");
      expect(b!.getAttribute("aria-label")).toBe(`Settle my star in ${name}`);
    }
    // Nothing to leave yet.
    expect(p.leave()).toBeNull();
    // The dock offers the way to it on every screen.
    const open = p.doc.getElementById("study-in")!;
    expect(open.hidden).toBe(false);
    expect(open.classList.contains("phone-only")).toBe(false);
  } finally {
    p.close();
  }
});

it("Common Room to Engineering in one action: one server call, the view opens, and the star is drawn there", async () => {
  const { cookie, id } = await newStar();
  const p = await open(cookie);
  try {
    p.settle("engineering")!.click();
    await p.flush();
    expect(p.calls).toEqual(['/api/star/constellation {"constellation":"engineering"}']);
    expect(p.doc.body.dataset.view).toBe("engineering");
    expect(p.doc.body.dataset.constellation).toBe("engineering");
    const g = p.doc.querySelector(`#stars .star[data-id="${id}"]`)!;
    expect(g.classList.contains("away")).toBe(false);
    expect(g.getAttribute("data-constellation")).toBe("engineering");
    // A reload finds it there: the server stored it.
    const html = await (await fetch(new URL("/", baseUrl), { headers: { Cookie: cookie } })).text();
    expect(html).toContain('data-constellation="engineering"');
  } finally {
    p.close();
  }
});

it("Leave Engineering returns the star to the Common Room and its view", async () => {
  const { cookie } = await newStar();
  await settleOverHttp(cookie, { constellation: "engineering" });
  const p = await open(cookie);
  try {
    const leave = p.leave()!;
    expect(leave.textContent!.trim()).toBe("Leave Engineering");
    // Settling where it already is would do nothing, so it is not offered.
    expect(p.settle("engineering")).toBeNull();
    leave.click();
    await p.flush();
    expect(p.calls).toEqual(['/api/star/constellation {"leave":true}']);
    expect(p.doc.body.dataset.constellation).toBe("");
    expect(p.doc.body.dataset.view).toBe("common");
  } finally {
    p.close();
  }
});

it("a quick second press while the first is still on its way sends nothing more", async () => {
  const { cookie } = await newStar();
  const p = await open(cookie);
  try {
    const b = p.settle("science")!;
    b.click();
    b.click();
    p.settle("health")?.click();
    await p.flush();
    expect(p.calls).toEqual(['/api/star/constellation {"constellation":"science"}']);
    expect(p.doc.body.dataset.constellation).toBe("science");
  } finally {
    p.close();
  }
});

it("two visitors settle in two constellations, and each one's move is their own", async () => {
  const a = await newStar();
  const b = await newStar();
  const pa = await open(a.cookie);
  const pb = await open(b.cookie);
  try {
    pa.settle("engineering")!.click();
    pb.settle("science")!.click();
    await pa.flush();
    await pb.flush();
    const read = async (cookie: string) => (await (await fetch(new URL("/", baseUrl), { headers: { Cookie: cookie } })).text()).match(/<body[^>]*data-constellation="([a-z]*)"/)![1];
    expect(await read(a.cookie)).toBe("engineering");
    expect(await read(b.cookie)).toBe("science");
  } finally {
    pa.close();
    pb.close();
  }
});

it("a forged request naming another visitor's star moves only the sender's own, and no cookie moves nothing", async () => {
  const a = await newStar();
  const b = await newStar();
  const res = await settleOverHttp(b.cookie, { constellation: "health", starId: a.id, id: a.id });
  expect(res.status).toBe(200);
  const { star } = (await res.json()) as { star: { id: string; constellation: string } };
  expect(star.id).toBe(b.id);
  const aPage = await (await fetch(new URL("/", baseUrl), { headers: { Cookie: a.cookie } })).text();
  expect(aPage).toMatch(/<body[^>]*data-constellation=""/);
  expect((await settleOverHttp(undefined, { constellation: "health", starId: a.id })).status).toBe(400);
  expect((await settleOverHttp(b.cookie, { constellation: "nowhere" })).status).toBe(400);
});
