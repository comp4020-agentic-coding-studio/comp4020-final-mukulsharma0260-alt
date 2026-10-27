const statusEl = document.getElementById("status");
const arrivalButton = document.getElementById("arrival-submit");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SVG_NS = "http://www.w3.org/2000/svg";
const HOUR_MS = 60 * 60 * 1000;

let statusTimer;
let realtime;
let skyActive = false;

// Every load starts on the arrival screen (ADR 0008). An earlier version
// remembered "entered" here and skipped the arrival for returning browsers;
// that flag is removed so no browser keeps skipping it.
try {
  window.localStorage.removeItem("overlap-arrival-v2");
} catch {
  // Blocked storage only means there was nothing to remove.
}

// The same test measureInsets uses for the stacked phone layout.
function narrowScreen() {
  return window.matchMedia?.("(max-width: 960px), (max-aspect-ratio: 1/1)")?.matches ?? false;
}

// A few messages are too long for one line on a phone, where the second line
// would fall on the stars, so they have a shorter phone version.
function phoneText(full, short) {
  return narrowScreen() ? short : full;
}

// On a phone, announcements sit in the strip the star field always leaves
// free just below the title (measureInsets), so they never cover a star, a
// constellation's name or the dock. Wider screens place them with CSS alone.
function placeStatus() {
  if (!narrowScreen()) {
    statusEl.style.removeProperty("top");
    return;
  }
  const lines = [...document.querySelectorAll(".hero > *")].filter((el) => !el.hidden && el.getBoundingClientRect?.().height);
  const bottom = Math.max(0, ...lines.map((el) => el.getBoundingClientRect().bottom));
  if (bottom) statusEl.style.top = `${Math.round(bottom + 4)}px`;
}

function announce(text, { transient = true } = {}) {
  clearTimeout(statusTimer);
  statusEl.textContent = text;
  statusEl.classList.remove("error");
  placeStatus();
  statusEl.classList.add("visible");
  if (transient) {
    statusTimer = setTimeout(() => {
      statusEl.classList.remove("visible");
    }, 2600);
  }
}

function announceError(text) {
  clearTimeout(statusTimer);
  statusEl.textContent = text;
  placeStatus();
  statusEl.classList.add("visible", "error");
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// ---- The lounge -------------------------------------------------------------
// One full-screen place. The Common Room shows every real star; each
// constellation is its own full-screen view of only its stars. Every point
// of light is a real visitor's star, drawn from the server: the page's first
// paint, then the /events stream. Nothing here is invented, and no
// constellation choice is kept in this browser.

const AREAS = ["science", "engineering", "business", "health", "arts"];
// Address-bar names: #arts-society for Arts & Society (#arts still works).
// Anything else is the Common Room.
const SLUGS = { science: "science", engineering: "engineering", business: "business", health: "health", arts: "arts-society" };
const ROUTES = { ...Object.fromEntries(Object.entries(SLUGS).map(([id, slug]) => [slug, id])), arts: "arts" };
const COMMON_LINE = "Place your star. Settle in. You are not studying alone.";

function readJson(key, fallback) {
  try {
    return JSON.parse(document.body.dataset[key] || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

const REGIONS = readJson("regions", {});
const INFO = readJson("constellations", {});
const INSETS = readJson("insets", { wide: { l: 0.36, r: 0.04, t: 0.07, b: 0.07 }, narrow: { l: 0.06, r: 0.06, t: 0.26, b: 0.34 } });

const svg = document.getElementById("sky");
const stage = document.getElementById("stage");
const starsLayer = document.getElementById("stars");
const figuresLayer = document.getElementById("figures");
const navLinks = [...document.querySelectorAll(".lounge-nav a.nav-link")];
const doorways = new Map([...document.querySelectorAll("#regions a.region")].map((a) => [a.dataset.region, a]));
const doorwayAreas = new Map([...document.querySelectorAll("#regions .region-area")].map((d) => [d.dataset.area, d]));

const SPARKLE = "M0 -15L1.1 -1.1L15 0L1.1 1.1L0 15L-1.1 1.1L-15 0L-1.1 -1.1Z";
const OWN_STAR_LABEL = "Your star. Drag it, use the arrow keys, or press Enter and then tap a place to move it.";
const FRAME_HEIGHT = 1000;
// After the next paint, or at once where there is no painting at all.
const nextFrame = (fn) => (window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(fn, 0));

const stars = new Map();
// Each star's <g>, by id, so a redraw never searches the DOM per star.
const starNodes = new Map();
let liveIds = new Set();
let liveBy = Object.fromEntries(AREAS.map((a) => [a, Number(doorways.get(a)?.dataset.live ?? 0)]));
let tracesBy = Object.fromEntries(AREAS.map((a) => [a, Number(doorways.get(a)?.dataset.traces ?? 0)]));
let listeningBy = {};
let view = "common";

const ownId = () => document.body.dataset.ownStar || undefined;
const ownArea = () => document.body.dataset.constellation || null;
const hasStar = () => document.body.dataset.hasStar === "true";

// The first paint's stars, read back from the server's markup, so the room
// is whole before the live stream connects.
for (const g of starsLayer?.querySelectorAll("g.star[data-id]") ?? []) {
  starNodes.set(g.dataset.id, g);
  stars.set(g.dataset.id, {
    id: g.dataset.id,
    x: Number(g.dataset.x),
    y: Number(g.dataset.y),
    brightness: g.dataset.brightness || "faint",
    constellation: g.dataset.constellation || null,
  });
  if (g.dataset.level === "glowing") liveIds.add(g.dataset.id);
}

function traceText(n) {
  return n === 0 ? "No traces yet" : n === 1 ? "1 trace" : `${n} traces`;
}

function applyCounts(data) {
  const ids = data.starIds ?? data.liveStarIds;
  if (Array.isArray(ids)) liveIds = new Set(ids);
  if (data.liveByConstellation) liveBy = { ...liveBy, ...data.liveByConstellation };
  if (data.tracesByConstellation) tracesBy = { ...tracesBy, ...data.tracesByConstellation };
  if (data.listeningByMode) listeningBy = { ...data.listeningByMode };
}

function clampToRegion(area, x, y) {
  const r = REGIONS[area];
  if (!r) return { x, y };
  return { x: Math.min(r.x1, Math.max(r.x0, x)), y: Math.min(r.y1, Math.max(r.y0, y)) };
}

// Three levels of light: studying now (an entered, visible tab), recent
// (seen within a day) and a past trace. A star that goes quiet becomes
// recent, never disappears.
function levelOf(star) {
  if (liveIds.has(star.id)) return "glowing";
  return star.brightness === "bright" || star.brightness === "soft" ? "recent" : "trace";
}

// ---- The frame: where a stored position is drawn --------------------------
// The stage fills the screen. Its SVG is FRAME_HEIGHT units tall and as
// wide as the stage's shape, so stars stay round and nothing is sub-pixel.
// The visible part of the Common Room (or of one constellation's region) is
// spread over the stage, inside margins that keep it clear of the title,
// the dock and the edges. Those margins are measured from the page itself.
let frame = { w: 1600, h: FRAME_HEIGHT, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, inset: INSETS.wide };

function measureInsets() {
  const rect = stage?.getBoundingClientRect?.();
  if (!rect || !rect.width || !rect.height) return null;
  const hero = document.querySelector(".hero")?.getBoundingClientRect?.();
  const dock = document.querySelector(".dock")?.getBoundingClientRect?.();
  const narrow = window.matchMedia?.("(max-width: 960px), (max-aspect-ratio: 1/1)")?.matches ?? false;
  const pad = 0.035;
  if (!hero || !dock || !hero.width || !dock.width) return narrow ? INSETS.narrow : INSETS.wide;
  if (narrow) {
    return {
      l: pad,
      r: pad,
      t: Math.min(0.5, Math.max(0, (hero.bottom - rect.top) / rect.height) + pad),
      b: Math.min(0.5, Math.max(0, (rect.bottom - dock.top) / rect.height) + pad),
    };
  }
  return {
    l: Math.min(0.6, (Math.max(hero.right, dock.right) - rect.left) / rect.width) + pad,
    r: pad,
    t: pad * 1.6,
    b: pad * 1.6,
  };
}

function updateFrame() {
  const rect = stage?.getBoundingClientRect?.();
  const w = rect && rect.width && rect.height ? Math.round((FRAME_HEIGHT * rect.width) / rect.height) : 1600;
  const box = view === "common" ? { x0: 0, y0: 0, x1: 1, y1: 1 } : REGIONS[view] ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const inset = measureInsets() ?? INSETS.wide;
  frame = { w, h: FRAME_HEIGHT, box, inset };
  svg?.setAttribute("viewBox", `0 0 ${w} ${FRAME_HEIGHT}`);
}

// Stored fraction (of the Common Room) → SVG units on the stage.
function toFrame(x, y) {
  const { w, h, box, inset } = frame;
  const u = (x - box.x0) / (box.x1 - box.x0 || 1);
  const v = (y - box.y0) / (box.y1 - box.y0 || 1);
  // A constellation's region is spread over the available space but kept
  // in proportion, so its stars are not stretched.
  const availW = w * (1 - inset.l - inset.r);
  const availH = h * (1 - inset.t - inset.b);
  if (view === "common") return { px: w * inset.l + u * availW, py: h * inset.t + v * availH };
  const aspect = ((box.x1 - box.x0) / (box.y1 - box.y0)) * 1.2;
  let bw = availW;
  let bh = bw / aspect;
  if (bh > availH) {
    bh = availH;
    bw = bh * aspect;
  }
  const ox = w * inset.l + (availW - bw) / 2;
  const oy = h * inset.t + (availH - bh) / 2;
  return { px: ox + u * bw, py: oy + v * bh };
}

// SVG units on the stage → stored fraction (of the Common Room).
function fromFrame(px, py) {
  const a = toFrame(frame.box.x0, frame.box.y0);
  const b = toFrame(frame.box.x1, frame.box.y1);
  const u = (px - a.px) / (b.px - a.px || 1);
  const v = (py - a.py) / (b.py - a.py || 1);
  return {
    x: clamp01(frame.box.x0 + u * (frame.box.x1 - frame.box.x0)),
    y: clamp01(frame.box.y0 + v * (frame.box.y1 - frame.box.y0)),
  };
}

function placeNode(g, star) {
  const { px, py } = toFrame(star.x, star.y);
  const t = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
  if (g.style.transform !== t) g.style.transform = t;
}

// Draws (or redraws) one star in place. Ownership is decided on every draw:
// the live broadcast of a visitor's own new star can arrive before their own
// placement reply.
function drawStar(star, mine = ownId()) {
  let g = starNodes.get(star.id);
  if (!g) {
    g = svgEl("g", { "data-id": star.id });
    starsLayer.appendChild(g);
    starNodes.set(star.id, g);
  }
  const own = star.id === mine;
  const level = levelOf(star);
  const away = view !== "common" && star.constellation !== view;
  // Transient states (picked, dragging, arrived) are kept from the current
  // class rather than looked up one by one.
  const was = g.getAttribute("class") ?? "";
  const keep = ["picked", "dragging", "arrived"].filter((c) => was.includes(` ${c}`)).map((c) => ` ${c}`).join("");
  const cls = `star ${level}${own ? " own" : ""}${away ? " away" : ""}${keep}`;
  if (was !== cls) g.setAttribute("class", cls);
  // With a thousand stars every redraw must stay cheap, so attributes are
  // only written when they change.
  const set = (name, value) => {
    if (value === null) {
      if (g.hasAttribute(name)) g.removeAttribute(name);
    } else if (g.getAttribute(name) !== value) {
      g.setAttribute(name, value);
    }
  };
  set("data-constellation", star.constellation ?? null);
  set("data-x", String(star.x));
  set("data-y", String(star.y));
  set("data-level", level);
  set("data-brightness", star.brightness ?? "faint");
  if (!cls.includes(" dragging")) placeNode(g, star);

  // Rebuild the star's insides only when its kind has changed; the light
  // level itself is a class, so going quiet fades rather than jumps.
  const look = `${level === "glowing"}|${own}`;
  if (g.getAttribute("data-look") === look) return g;
  g.setAttribute("data-look", look);
  g.setAttribute("data-own", String(own));
  g.replaceChildren();
  g.append(svgEl("circle", { class: "star-halo", r: 10 }));
  if (level === "glowing") g.append(svgEl("path", { class: "star-sparkle", d: SPARKLE }));
  g.append(svgEl("circle", { class: "star-core", r: 1 }));
  const title = svgEl("title", {});
  if (own) {
    g.append(svgEl("circle", { class: "star-ring", r: 13 }));
    const you = svgEl("text", { class: "star-you", y: -21, "text-anchor": "middle" });
    you.textContent = "you";
    g.append(you);
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", OWN_STAR_LABEL);
    title.textContent = "Your star";
  } else {
    g.removeAttribute("tabindex");
    g.removeAttribute("role");
    g.removeAttribute("aria-label");
    title.textContent = level === "glowing" ? "A visitor studying now" : level === "recent" ? "A visitor, seen recently" : "A past trace";
  }
  g.append(title);
  return g;
}

// Past traces at the back, then recent stars, then glowing ones; your own
// star on top.
function rankOf(g) {
  if (g.getAttribute("data-own") === "true") return 3;
  return { trace: 0, recent: 1, glowing: 2 }[g.getAttribute("data-level")] ?? 0;
}

function orderStars() {
  const groups = [...starsLayer.children];
  const ranks = groups.map(rankOf);
  // Already in order (the usual case): touch nothing.
  if (ranks.every((r, i) => i === 0 || ranks[i - 1] <= r)) return;
  const sorted = groups.map((g, i) => [g, ranks[i]]).sort((a, b) => a[1] - b[1]);
  for (const [g] of sorted) starsLayer.appendChild(g);
}

// The constellation figures: all five, small, in the Common Room; in a
// constellation's view only its own, drawn large behind its stars.
function drawFigures() {
  if (!figuresLayer) return;
  const frag = document.createDocumentFragment();
  for (const id of AREAS) {
    if (view !== "common" && id !== view) continue;
    const info = INFO[id];
    const r = REGIONS[id];
    if (!info || !r) continue;
    const g = svgEl("g", { class: `figure${view === id ? " is-room" : ""}`, "data-figure": id });
    const pt = ([u, w]) => toFrame(r.x0 + (r.x1 - r.x0) * u, r.y0 + (r.y1 - r.y0) * w);
    for (const [a, b] of info.edges) {
      const p = pt(info.nodes[a]);
      const q = pt(info.nodes[b]);
      g.append(svgEl("line", { class: "fig-edge", x1: Math.round(p.px), y1: Math.round(p.py), x2: Math.round(q.px), y2: Math.round(q.py) }));
    }
    const d = view === id ? 9 : 6;
    for (const n of info.nodes) {
      const p = pt(n);
      g.append(svgEl("path", { class: "fig-node", d: `M${Math.round(p.px)} ${Math.round(p.py) - d}l${d} ${d}l-${d} ${d}l-${d} -${d}z` }));
    }
    frag.append(g);
  }
  figuresLayer.replaceChildren(frag);
}

// Doorways sit over their region of the Common Room, in screen percentages.
function placeDoorways() {
  for (const [id, a] of doorways) {
    const r = REGIONS[id];
    if (!r) continue;
    const p = toFrame(r.x0, r.y0);
    const q = toFrame(r.x1, r.y1);
    const area = doorwayAreas.get(id);
    const left = (p.px / frame.w) * 100;
    const top = (p.py / frame.h) * 100;
    a.style.left = `${left.toFixed(2)}%`;
    a.style.top = `${top.toFixed(2)}%`;
    if (area) {
      area.style.left = `${left.toFixed(2)}%`;
      area.style.top = `${top.toFixed(2)}%`;
      area.style.width = `${(((q.px - p.px) / frame.w) * 100).toFixed(2)}%`;
      area.style.height = `${(((q.py - p.py) / frame.h) * 100).toFixed(2)}%`;
    }
  }
}

function renderStars() {
  for (const [id, g] of starNodes) {
    if (!stars.has(id)) {
      g.remove();
      starNodes.delete(id);
    }
  }
  // Whose star is whose is read once per redraw, not once per star.
  const mine = ownId();
  for (const s of stars.values()) drawStar(s, mine);
  orderStars();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el && el.textContent !== value) el.textContent = value;
  return el;
}

// The title, the live line, the doorways, the navigation and the dock: all
// from the current view and real counts.
function renderChrome() {
  const area = ownArea();
  const inRoom = view !== "common";
  const name = inRoom ? INFO[view]?.name ?? "" : "";

  document.body.dataset.view = view;
  if (stage) stage.dataset.view = view;
  for (const a of navLinks) {
    const current = a.dataset.view === view;
    if (current) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
    if (a.dataset.view !== "common") {
      const n = liveBy[a.dataset.view] ?? 0;
      a.dataset.live = String(n);
      a.setAttribute("aria-label", `${INFO[a.dataset.view]?.name}, ${n ? `${n} studying now` : "quiet"}`);
    }
  }
  for (const [id, a] of doorways) {
    const n = liveBy[id] ?? 0;
    a.dataset.live = String(n);
    a.classList.toggle("is-yours", area === id);
    a.querySelector(".region-live").textContent = n ? `${n} studying now` : "Quiet";
    a.setAttribute("aria-label", `${INFO[id]?.name}: ${n ? `${n} studying now` : "quiet"}. Open ${INFO[id]?.name}.`);
  }

  setText("view-kicker", inRoom ? "Constellation" : "The Lounge");
  setText("view-title", inRoom ? name : "The Common Room");
  setText("view-line", inRoom ? INFO[view]?.line ?? "" : COMMON_LINE);
  document.getElementById("back-common").hidden = !inRoom;

  const liveTotal = inRoom ? liveBy[view] ?? 0 : liveIds.size;
  const traceTotal = inRoom ? tracesBy[view] ?? 0 : stars.size;
  const liveWords = inRoom
    ? liveTotal ? `${liveTotal} studying in ${name} now` : `Nobody studying in ${name} right now`
    : liveTotal ? `${liveTotal} studying now` : "Nobody studying right now";
  const liveLine = setText("live-line", `${liveWords} · ${traceText(traceTotal)}`);
  if (liveTotal) liveLine.removeAttribute("data-quiet");
  else liveLine.setAttribute("data-quiet", "");

  svg?.setAttribute("aria-label", inRoom
    ? `${name}. Every point of light is a real visitor's star in ${name}: bright points are studying now, faint points are past traces.`
    : "The Common Room. Every point of light is a real visitor's star: bright points are studying now, faint points are past traces.");

  renderDock();
}

function renderDock() {
  const area = ownArea();
  const inRoom = view !== "common";
  const name = inRoom ? INFO[view]?.name ?? "" : "";
  const own = stars.get(ownId());
  const glowing = own ? liveIds.has(own.id) : false;

  const youStatus = document.getElementById("you-status");
  youStatus.hidden = !hasStar();
  setText("you-status", glowing ? "Your star is glowing" : "Your star is connecting");
  setText("where", !hasStar() ? "You have no star yet" : `Your star is in ${area ? INFO[area]?.name : "the Common Room"}.`);

  const place = document.getElementById("place-star");
  const settle = document.getElementById("settle-action");
  const leave = document.getElementById("leave-area");
  place.hidden = hasStar() || inRoom;
  settle.hidden = true;
  leave.hidden = true;

  let note;
  if (!inRoom) {
    note = hasStar()
      ? area ? `Your star stays in ${INFO[area]?.name}. Drag it there, or select it and use the arrow keys.` : "Drag your star, or select it and use the arrow keys."
      : "No name, no profile. Tap an open space, or press the button.";
  } else if (!hasStar()) {
    settle.hidden = false;
    settle.textContent = `Place your star in ${name}`;
    note = `Your star appears among ${name}'s stars, and in the Common Room.`;
  } else if (area === view) {
    leave.hidden = false;
    leave.textContent = `Leave ${name}`;
    note = `Drag your star within ${name}, or select it and use the arrow keys.`;
  } else if (area) {
    settle.hidden = false;
    settle.textContent = `Move my star to ${name}`;
    note = `You still have one star: it moves from ${INFO[area]?.name} to ${name}.`;
  } else {
    settle.hidden = false;
    settle.textContent = `Study in ${name}`;
    note = `Your one star moves into ${name}. It stays in the Common Room too.`;
  }
  if (area && !inRoom) {
    leave.hidden = false;
    leave.textContent = `Leave ${INFO[area]?.name}`;
  }
  setText("dock-note", note);
}

function render() {
  renderStars();
  renderChrome();
}

// Re-measure and redraw everything that depends on the stage's shape.
function relayout() {
  updateFrame();
  drawFigures();
  placeDoorways();
  for (const s of stars.values()) {
    const g = starNodes.get(s.id);
    if (g && !g.classList.contains("dragging")) placeNode(g, s);
  }
}

// ---- Views ----------------------------------------------------------------
// The Common Room and the five constellations are views of the same stars.
// Changing view flies the stars to their new places (and fades out those
// that are not in it) instead of loading another page.
function setView(next, { push = true } = {}) {
  const target = next && AREAS.includes(next) ? next : "common";
  const changed = target !== view;
  view = target;
  if (push) {
    const hash = view === "common" ? "" : `#${SLUGS[view]}`;
    if (window.location.hash !== hash) {
      window.history.pushState(null, "", hash || window.location.pathname + window.location.search);
    }
  }
  if (changed && skyActive && !reducedMotion) {
    stage?.classList.add("flying");
    clearTimeout(setView.timer);
    setView.timer = setTimeout(() => stage?.classList.remove("flying"), 1000);
  }
  setPicked(false);
  updateFrame();
  render();
  drawFigures();
  placeDoorways();
  if (changed) refreshChatForView();
  // On a narrow screen the navigation scrolls sideways: keep the current
  // view's link in sight.
  if (changed) navLinks.find((a) => a.dataset.view === view)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

function routeFromHash() {
  const slug = decodeURIComponent(window.location.hash.replace(/^#/, "")).toLowerCase();
  setView(ROUTES[slug] ?? null, { push: false });
}

window.addEventListener("popstate", routeFromHash);
window.addEventListener("hashchange", routeFromHash);

// ---- Joining a constellation -----------------------------------------------
async function chooseConstellation(body) {
  let res;
  try {
    res = await fetch("/api/star/constellation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    announceError(phoneText("Could not reach the lounge. Check your connection and try again.", "Could not connect. Check your connection."));
    return false;
  }
  if (!res.ok) {
    announceError("That did not save. Please try again.");
    return false;
  }
  const { star } = await res.json();
  // The server decides where the star is now (inside the region it chose).
  document.body.dataset.constellation = star.constellation ?? "";
  stars.set(star.id, { ...stars.get(star.id), id: star.id, x: star.x, y: star.y, constellation: star.constellation ?? null, brightness: "bright" });
  render();
  renderChatComposer();
  return true;
}

async function settleIn(area) {
  if (!hasStar()) {
    // No position: the server gives the new star its own spot in the region.
    if (await placeStar(undefined, undefined, area)) {
      announce(`Your star is in ${INFO[area]?.name} now.`);
    }
    return;
  }
  if (await chooseConstellation({ constellation: area })) {
    announce(`Your star is in ${INFO[area]?.name} now.`);
    starNodes.get(ownId())?.focus();
  }
}

async function leaveConstellation() {
  const area = ownArea();
  if (await chooseConstellation({ leave: true })) {
    announce(area ? phoneText(`Your star left ${INFO[area]?.name}. It is in the Common Room.`, "Your star is back in the Common Room.") : "Your star is in the Common Room.");
    if (view !== "common") setView(null);
  }
}

// ---- Live stream ------------------------------------------------------------
function startRealtime() {
  realtime?.close();
  realtime = new EventSource("/events");

  realtime.addEventListener("sync", (event) => {
    // A sync replaces what this browser knows: exactly its stars and counts.
    const data = JSON.parse(event.data);
    stars.clear();
    for (const s of data.stars ?? []) stars.set(s.id, s);
    applyCounts(data);
    render();
    renderBreak();
    // Every room this stream is a member of (Common Room, plus a settled
    // constellation if any) comes back here; replace each one's history.
    for (const c of data.chat ?? []) replaceChatRoom(c.room, c.messages ?? []);
  });
  realtime.addEventListener("star", (event) => {
    const { change, star } = JSON.parse(event.data);
    if (!star?.id) return;
    // While you drag your own star, your pointer leads; your own move
    // coming back must not snap it.
    if (star.id === ownId() && dragging) return;
    stars.set(star.id, { ...stars.get(star.id), ...star });
    if (star.id === ownId()) {
      document.body.dataset.constellation = star.constellation ?? "";
      // Settling or leaving changes which room this visitor may post to.
      renderChatComposer();
    }
    render();
    if (change === "created") arrive(star.id);
  });
  realtime.addEventListener("live", (event) => {
    applyCounts(JSON.parse(event.data));
    render();
    renderBreak();
  });
  realtime.addEventListener("message.created", (event) => {
    const { room, message } = JSON.parse(event.data);
    receiveChatMessage(room, message);
  });
  realtime.addEventListener("message.expired", (event) => {
    const { room, ids } = JSON.parse(event.data);
    removeChatMessages(room, ids ?? []);
  });
  realtime.addEventListener("error", () => {
    setText("live-line", "Reconnecting to the lounge…");
  });
}

function arrive(id) {
  if (reducedMotion) return;
  const g = starNodes.get(id);
  g?.classList.add("arrived");
  setTimeout(() => g?.classList.remove("arrived"), 1600);
}

// Live means an open AND visible tab that has entered the lounge (ADRs 0005
// and 0006). A hidden tab drops its stream, so its glow goes out on the
// server and every count drops with it; showing the tab again reconnects,
// gets a fresh snapshot, and checks in like a return visit.
function stopRealtime() {
  realtime?.close();
  realtime = undefined;
}

// The only way into the live stream and the /api/here check-in. It refuses
// until the visitor has entered the lounge, and while the tab is hidden, so
// no other code path can count someone as here early.
function joinLounge({ checkIn = true } = {}) {
  if (!skyActive || document.visibilityState === "hidden") return;
  startRealtime();
  if (checkIn) reportHere();
  // A visible tab that is still playing counts as listening again.
  if (breakPlaying()) reportListening(breakMode);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopRealtime();
    return;
  }
  joinLounge();
});

function relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

// ---- Placing and moving your own star -----------------------------------
// Three ways, so dragging is never the only one: drag it; select it and use
// the arrow keys (Shift for a bigger step); or select it with Enter or a
// tap, then tap a place. A star in a constellation stays inside it here as
// it does on the server.

let dragging = false;
let picked = false;

function toStagePoint(clientX, clientY) {
  const pt = svg?.createSVGPoint?.();
  const ctm = svg?.getScreenCTM?.();
  if (pt && ctm) {
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return fromFrame(p.x, p.y);
  }
  const rect = stage.getBoundingClientRect();
  return fromFrame(((clientX - rect.left) / (rect.width || 1)) * frame.w, ((clientY - rect.top) / (rect.height || 1)) * frame.h);
}

function postMove(x, y) {
  return fetch("/api/star/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y }),
  }).then(async (res) => {
    if (!res.ok) throw new Error("move failed");
    // The server's answer is where the star really is.
    const { star } = await res.json();
    if (star && !dragging) {
      stars.set(star.id, { ...stars.get(star.id), x: star.x, y: star.y, constellation: star.constellation ?? null });
      drawStar(stars.get(star.id));
    }
  });
}

let saveTimer;
function saveMove(x, y) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    postMove(x, y).catch(() => {
      announceError(phoneText("Could not save your star's new position. Check your connection and try again.", "Could not save. Check your connection."));
    });
  }, 300);
}

function moveOwnLocally(x, y) {
  const star = stars.get(ownId());
  if (!star) return { x, y };
  const p = star.constellation ? clampToRegion(star.constellation, x, y) : { x, y };
  Object.assign(star, p);
  const g = starNodes.get(star.id);
  if (g) {
    placeNode(g, star);
    g.dataset.x = String(p.x);
    g.dataset.y = String(p.y);
  }
  return p;
}

function setPicked(on) {
  if (picked === on) return;
  picked = on;
  starNodes.get(ownId())?.classList.toggle("picked", on);
  stage?.classList.toggle("placing", on);
  if (on) announce(phoneText("Tap a place to move your star there. Press Escape to cancel.", "Tap a place for your star. Esc cancels."), { transient: false });
}

// Can this visitor's star be shown in the current view?
function ownStarInView() {
  return view === "common" || ownArea() === view;
}

function wireStage() {
  const own = () => starNodes.get(ownId());

  stage.addEventListener("pointerdown", (e) => {
    const g = own();
    if (!g || !g.contains(e.target) || !ownStarInView()) return;
    dragging = true;
    stage.setPointerCapture?.(e.pointerId);
    g.classList.add("dragging");
    g.dataset.dragStart = `${e.clientX},${e.clientY}`;
  });

  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const { x, y } = toStagePoint(e.clientX, e.clientY);
    moveOwnLocally(x, y);
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    const g = own();
    g?.classList.remove("dragging");
    const [sx, sy] = (g?.dataset.dragStart ?? "0,0").split(",").map(Number);
    const moved = Math.hypot((e?.clientX ?? sx) - sx, (e?.clientY ?? sy) - sy) > 4;
    if (!moved) {
      // A tap on your star selects it for tap-to-move.
      setPicked(!picked);
      return;
    }
    const star = stars.get(ownId());
    if (!star) return;
    clearTimeout(saveTimer);
    postMove(star.x, star.y)
      .then(() => announce("Star moved."))
      .catch(() => announceError(phoneText("Could not save your star's new position. Check your connection and try again.", "Could not save. Check your connection.")));
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", () => endDrag());

  // A click on open space: place a first star there, or move a selected star.
  stage.addEventListener("click", (e) => {
    if (own()?.contains(e.target) || e.target.closest?.("a")) return;
    const { x, y } = toStagePoint(e.clientX, e.clientY);
    if (!hasStar()) {
      // In a constellation's view the first star joins it, wherever the tap.
      if (view === "common") placeStar(x, y);
      else placeStar(...Object.values(clampToRegion(view, x, y)), view);
      return;
    }
    if (!picked) return;
    setPicked(false);
    const p = moveOwnLocally(x, y);
    postMove(p.x, p.y)
      .then(() => announce("Star moved."))
      .catch(() => announceError(phoneText("Could not save your star's new position. Check your connection and try again.", "Could not save. Check your connection.")));
  });

  stage.addEventListener("keydown", (e) => {
    const g = own();
    const star = stars.get(ownId());
    if (!g || !star || e.target !== g) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPicked(!picked);
      return;
    }
    if (e.key === "Escape" && picked) {
      e.preventDefault();
      setPicked(false);
      announce("Move cancelled.");
      return;
    }
    // Steps are a share of what is on screen, so a key press moves the star
    // about the same distance in the Common Room and in a constellation.
    const spanX = frame.box.x1 - frame.box.x0;
    const spanY = frame.box.y1 - frame.box.y0;
    const step = e.shiftKey ? 0.08 : 0.02;
    let { x, y } = star;
    if (e.key === "ArrowLeft") x = clamp01(x - step * spanX);
    else if (e.key === "ArrowRight") x = clamp01(x + step * spanX);
    else if (e.key === "ArrowUp") y = clamp01(y - step * spanY);
    else if (e.key === "ArrowDown") y = clamp01(y + step * spanY);
    else return;
    e.preventDefault();
    const p = moveOwnLocally(x, y);
    saveMove(p.x, p.y);
    announce("Star moved.");
  });
}

// Places this browser's one star: in the Common Room, or straight into a
// constellation when one is given. Returns true once it exists. A star
// placed before entering is saved, but the lounge is only joined after
// entering.
async function placeStar(x, y, constellation) {
  const payload = {};
  if (x !== undefined) Object.assign(payload, { x, y });
  if (constellation) payload.constellation = constellation;
  let res;
  try {
    res = await fetch("/api/star", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    announceError(phoneText("Could not place your star. Check your connection and try again.", "Could not place star. Check your connection."));
    return false;
  }
  if (!res.ok) {
    announceError("Could not place your star. Please try again.");
    return false;
  }
  const { star } = await res.json();
  document.body.dataset.hasStar = "true";
  document.body.dataset.ownStar = star.id;
  document.body.dataset.constellation = star.constellation ?? "";
  // Ownership comes from this reply, never from the broadcast.
  stars.set(star.id, { ...stars.get(star.id), id: star.id, x: star.x, y: star.y, brightness: "bright", constellation: star.constellation ?? null });
  render();
  renderChatComposer();
  arrive(star.id);
  announce(constellation ? `Your star joined ${INFO[constellation]?.name}.` : "Your star joined the Common Room.");
  starNodes.get(star.id)?.focus();
  // Reconnect so the stream now carries this browser's own star as live.
  joinLounge({ checkIn: false });
  return true;
}

// ---- Callsign ----------------------------------------------------------
// An anonymous alias, chosen once and rarely changed, independent of
// whether this browser has placed a star yet. Never a full-screen gate over
// the star field: a compact step in the dock.

const callsignForm = document.getElementById("callsign-form");
const callsignInput = document.getElementById("callsign-input");
const callsignError = document.getElementById("callsign-error");
const callsignCurrent = document.getElementById("callsign-current");
const callsignCurrentName = document.getElementById("callsign-current-name");
const callsignCancel = document.getElementById("callsign-cancel");

function showCallsignForm(show) {
  if (!callsignForm) return;
  callsignForm.hidden = !show;
  if (show) {
    callsignInput.value = document.body.dataset.callsign ?? "";
    callsignError.textContent = "";
    callsignInput.focus();
  }
}

async function submitCallsign(value) {
  callsignError.textContent = "";
  let res;
  try {
    res = await fetch("/api/callsign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callsign: value }),
    });
  } catch {
    callsignError.textContent = "Could not reach the lounge. Check your connection and try again.";
    return;
  }
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: "Could not set that callsign. Please try again." }));
    callsignError.textContent = error ?? "Could not set that callsign. Please try again.";
    return;
  }
  const { callsign } = await res.json();
  document.body.dataset.hasCallsign = "true";
  document.body.dataset.callsign = callsign.callsign;
  callsignCurrentName.textContent = callsign.callsign;
  callsignCurrent.hidden = false;
  showCallsignForm(false);
  announce(`You are ${callsign.callsign}.`);
  renderChatComposer();
}

function wireCallsign() {
  if (!callsignForm) return;
  callsignForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = callsignInput.value;
    if (value.trim().length < 3) {
      callsignError.textContent = "Choose at least 3 characters.";
      return;
    }
    submitCallsign(value);
  });
  document.getElementById("callsign-change")?.addEventListener("click", () => showCallsignForm(true));
  callsignCancel?.addEventListener("click", () => showCallsignForm(false));
}

// ---- Chat ---------------------------------------------------------------
// The Common Room conversation (Phase 2) and each constellation's own
// conversation (Phase 3). A quiet drawer, never a feed: text only, rendered
// with textContent, never innerHTML. The composer is disabled until a
// callsign exists; Common Room posting never requires a star, but a
// constellation's conversation requires the visitor's own star to be
// genuinely, currently settled there — the server is the only source of
// truth for that, this UI only reflects it honestly (no read-only preview).

const chatToggle = document.getElementById("chat-toggle");
const chatPanel = document.getElementById("chat-panel");
const chatTitle = document.getElementById("chat-title");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatError = document.getElementById("chat-error");
const chatNote = document.getElementById("chat-note");
// One message list per room, kept in memory so switching views doesn't lose
// a room's history; only the current room's messages are ever shown.
const chatMessagesByRoom = new Map();
const chatSeenIdsByRoom = new Map();

function hasCallsign() {
  return document.body.dataset.hasCallsign === "true";
}

// The room this drawer currently shows: the Common Room, or whichever
// constellation view is open. Matches the server's own room keys exactly
// (view is already one of AREAS or "common").
function currentChatRoom() {
  return view;
}

// Whether this visitor may currently post to the open room: Common Room
// needs only a callsign; a constellation needs the visitor's own star
// settled there right now. This mirrors the server's rule for UI purposes
// only — the server re-checks it independently on every post.
function canPostToCurrentRoom() {
  if (!hasCallsign()) return false;
  const room = currentChatRoom();
  return room === "common" || ownArea() === room;
}

function chatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Builds one message's markup from scratch with createElement/textContent
// only, never a template string: a message body can contain anything a
// visitor typed, including "<script>", and must never be parsed as HTML.
function renderChatMessage(message) {
  const li = document.createElement("li");
  li.className = "chat-message";
  li.dataset.messageId = message.id;
  const own = message.callsign === document.body.dataset.callsign;
  li.dataset.own = String(own);

  const head = document.createElement("div");
  head.className = "chat-message-head";
  const callsign = document.createElement("span");
  callsign.className = "chat-message-callsign";
  callsign.textContent = message.callsign + (own ? " (you)" : "");
  const time = document.createElement("span");
  time.className = "chat-message-time";
  time.textContent = chatTime(message.createdAt);
  head.append(callsign, time);

  const body = document.createElement("div");
  body.className = "chat-message-body";
  body.textContent = message.body;

  li.append(head, body);
  return li;
}

// Stores a message under its room, and — only if that room is the one
// currently shown — appends it to the visible list too.
function receiveChatMessage(room, message) {
  const seen = chatSeenIdsByRoom.get(room) ?? new Set();
  chatSeenIdsByRoom.set(room, seen);
  if (seen.has(message.id)) return;
  seen.add(message.id);
  const list = chatMessagesByRoom.get(room) ?? [];
  list.push(message);
  chatMessagesByRoom.set(room, list);
  if (room === currentChatRoom() && chatMessages) {
    chatMessages.append(renderChatMessage(message));
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// Drops expired messages from this room's stored history, and from the
// visible list too if this room is the one currently shown — an open chat
// panel loses them live, rather than showing stale text until a reload.
function removeChatMessages(room, ids) {
  const idSet = new Set(ids);
  const list = chatMessagesByRoom.get(room);
  if (list) chatMessagesByRoom.set(room, list.filter((m) => !idSet.has(m.id)));
  const seen = chatSeenIdsByRoom.get(room);
  if (seen) for (const id of ids) seen.delete(id);
  if (room !== currentChatRoom() || !chatMessages) return;
  for (const id of ids) {
    chatMessages.querySelector(`[data-message-id="${CSS.escape(id)}"]`)?.remove();
  }
}

function replaceChatRoom(room, messages) {
  chatMessagesByRoom.set(room, [...messages]);
  chatSeenIdsByRoom.set(room, new Set(messages.map((m) => m.id)));
  if (room === currentChatRoom()) renderCurrentChatRoom();
}

// Redraws the message list from this room's own stored history (never
// re-fetches): used when switching rooms, so a room's messages are exactly
// what this browser has already been sent for it.
function renderCurrentChatRoom() {
  if (!chatMessages) return;
  const room = currentChatRoom();
  chatMessages.textContent = "";
  for (const m of chatMessagesByRoom.get(room) ?? []) chatMessages.append(renderChatMessage(m));
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function chatRoomTitle(room) {
  return room === "common" ? "Common Room conversation" : `${INFO[room]?.name ?? room} conversation`;
}

function renderChatComposer() {
  const room = currentChatRoom();
  if (chatTitle) chatTitle.textContent = chatRoomTitle(room);
  const settled = room === "common" || ownArea() === room;
  const enabled = hasCallsign() && settled;
  if (chatInput) chatInput.disabled = !enabled;
  const submit = chatForm?.querySelector("button[type=submit]");
  if (submit) submit.disabled = !enabled;
  if (chatNote) {
    chatNote.textContent = !settled
      ? `Settle your star in ${INFO[room]?.name ?? room} to join this conversation.`
      : !hasCallsign()
        ? "Choose a callsign to send a message."
        : "";
  }
}

// Called whenever the view changes (setView) or settling/leaving a
// constellation changes which rooms this visitor may post to — both the
// visible message list and the composer's enabled state depend on the
// current room, so both are refreshed together.
function refreshChatForView() {
  renderCurrentChatRoom();
  renderChatComposer();
}

function openChat(open) {
  if (!chatPanel || !chatToggle) return;
  chatPanel.hidden = !open;
  chatToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    refreshChatForView();
    (hasCallsign() ? chatInput : document.getElementById("callsign-input"))?.focus();
  } else {
    chatToggle.focus();
  }
}

async function submitChatMessage(text) {
  chatError.textContent = "";
  const room = currentChatRoom();
  let res;
  try {
    res = await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, body: text, idempotencyKey: crypto.randomUUID() }),
    });
  } catch {
    chatError.textContent = "Could not send that message. Check your connection and try again.";
    return;
  }
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: "Could not send that message. Please try again." }));
    chatError.textContent = error ?? "Could not send that message. Please try again.";
    return;
  }
  // The live "message.created" event (delivered to this same stream, since
  // a member of this room) is what actually appends the message; this only
  // clears the composer once the send is confirmed.
  chatInput.value = "";
}

function wireChat() {
  if (!chatPanel || !chatToggle) return;
  chatToggle.addEventListener("click", () => openChat(chatPanel.hidden));
  document.getElementById("chat-close")?.addEventListener("click", () => openChat(false));
  chatForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canPostToCurrentRoom()) return;
    const text = chatInput.value.trim();
    if (!text) return;
    submitChatMessage(text);
  });
}

// A check-in counts this browser's own star as seen, so it is only for a
// visitor who has entered the lounge and has a star. It guards itself rather
// than trusting every caller to.
async function reportHere() {
  if (!skyActive || document.body.dataset.hasStar !== "true") return;
  const res = await fetch("/api/here", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await res.json();
  if (!data.hasStar) return;

  const awaySinceMs = data.previousLastSeenAt ? Date.now() - new Date(data.previousLastSeenAt).getTime() : 0;
  const wasAwayAWhile = awaySinceMs > HOUR_MS;

  if (wasAwayAWhile || data.newCount > 0) {
    const sincePart = data.previousLastSeenAt
      ? `You were last here ${relativeTime(data.previousLastSeenAt)}.`
      : "";
    const newPart = data.newCount === 0
      ? "No new stars since."
      : data.newCount === 1
        ? "1 new star since."
        : `${data.newCount} new stars since.`;
    announce(phoneText(`Welcome back. ${sincePart} ${newPart}`.trim(), `Welcome back. ${newPart}`), { transient: false });
  }
  for (const id of data.newStarIds ?? []) arrive(id);
}

// ---- Break ------------------------------------------------------------------
// A small drawer of real tracks. Nothing plays until the visitor presses
// Play, one track plays at a time, and while it plays this browser tells the
// server which mode, so "N listening now" is made only of glowing stars that
// pressed Play. Each visitor plays their own copy: nothing is synchronised.

const breakToggle = document.getElementById("break-toggle");
const breakPanel = document.getElementById("break-panel");
const breakAudio = document.getElementById("break-audio");
const breakPlay = document.getElementById("break-play");
const breakMute = document.getElementById("break-mute");
const breakVolume = document.getElementById("break-volume");
const breakModes = [...document.querySelectorAll(".break-mode")];
let breakMode = breakModes[0]?.dataset.mode ?? null;
let breakReported = null;

const breakName = (mode) => breakModes.find((b) => b.dataset.mode === mode)?.querySelector(".break-mode-name")?.textContent ?? "";
const breakPlaying = () => Boolean(breakAudio && breakAudio.getAttribute("src") && !breakAudio.paused);

function reportListening(mode) {
  if (!hasStar() || !skyActive) return;
  if (breakReported === mode) return;
  breakReported = mode;
  fetch("/api/listening", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  }).catch(() => {});
}

function renderBreak() {
  if (!breakPanel) return;
  const playing = breakPlaying();
  for (const b of breakModes) {
    const selected = b.dataset.mode === breakMode;
    b.setAttribute("aria-pressed", String(selected));
    b.querySelector(".break-mode-state").textContent = selected && playing ? "Playing" : "";
    const n = listeningBy[b.dataset.mode] ?? 0;
    const count = b.querySelector(".break-mode-count");
    count.hidden = n === 0;
    count.textContent = n ? `${n} listening` : "";
  }
  const total = Object.values(listeningBy).reduce((a, n) => a + (Number(n) || 0), 0);
  const totalEl = document.getElementById("break-listening-total");
  totalEl.hidden = total === 0;
  totalEl.textContent = total ? `${total} listening now` : "";
  breakPlay.setAttribute("aria-pressed", String(playing));
  breakPlay.lastChild.textContent = playing ? "Pause" : "Play";
  breakPlay.setAttribute("aria-label", playing ? `Pause ${breakName(breakMode)}` : `Play ${breakName(breakMode)}`);
  breakMute.setAttribute("aria-pressed", String(breakAudio.muted));
  breakMute.textContent = breakAudio.muted ? "Unmute" : "Mute";
  breakToggle?.classList.toggle("is-playing", playing);
  const src = breakAudio.getAttribute("src");
  setText("break-now", !src ? (breakRendered.stopped ? "Stopped" : "Nothing playing") : playing ? `Playing ${breakName(breakMode)}` : `Paused · ${breakName(breakMode)}`);
}
const breakRendered = { stopped: false };

function breakSrc(mode) {
  return breakModes.find((b) => b.dataset.mode === mode)?.dataset.src;
}

function playBreak() {
  const src = breakSrc(breakMode);
  if (!src) return;
  if (breakAudio.getAttribute("src") !== src) {
    breakAudio.setAttribute("src", src);
    breakAudio.load?.();
  }
  breakRendered.stopped = false;
  breakAudio.play()?.catch?.(() => announceError("That track could not play. Please try again."));
}

function openBreak(open) {
  breakPanel.hidden = !open;
  breakToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    renderBreak();
    (breakModes.find((b) => b.dataset.mode === breakMode) ?? breakPlay)?.focus();
  } else {
    breakToggle.focus();
  }
}

function wireBreak() {
  if (!breakPanel) return;
  breakAudio.volume = Number(breakVolume.value) / 100;
  breakToggle.addEventListener("click", () => openBreak(breakPanel.hidden));
  document.getElementById("break-close").addEventListener("click", () => openBreak(false));
  for (const b of breakModes) {
    b.addEventListener("click", () => {
      const wasPlaying = breakPlaying();
      breakMode = b.dataset.mode;
      // Choosing another mode swaps the one track: it plays only if music
      // was already playing, so choosing alone never starts sound.
      if (wasPlaying) playBreak();
      renderBreak();
    });
  }
  breakPlay.addEventListener("click", () => {
    if (breakPlaying()) breakAudio.pause();
    else playBreak();
  });
  document.getElementById("break-stop").addEventListener("click", () => {
    breakAudio.pause();
    breakAudio.removeAttribute("src");
    breakAudio.load?.();
    breakRendered.stopped = true;
    reportListening(null);
    renderBreak();
  });
  breakMute.addEventListener("click", () => {
    breakAudio.muted = !breakAudio.muted;
    renderBreak();
  });
  breakVolume.addEventListener("input", () => {
    breakAudio.volume = Number(breakVolume.value) / 100;
  });
  breakAudio.addEventListener("play", () => {
    reportListening(breakMode);
    renderBreak();
  });
  breakAudio.addEventListener("pause", () => {
    reportListening(null);
    renderBreak();
  });
  breakAudio.addEventListener("error", () => {
    if (breakAudio.getAttribute("src")) announceError("That track could not load.");
  });
}

// ---- Traces -----------------------------------------------------------------
function wireTraces() {
  const toggle = document.getElementById("traces-toggle");
  toggle?.addEventListener("click", () => {
    const on = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(on));
    stage?.classList.toggle("hide-traces", !on);
    announce(on ? "Showing past traces." : "Showing only recent stars and those studying now.");
  });
}

function localizeSinceDate() {
  const time = document.querySelector("#since time");
  if (!time) return;
  const iso = time.getAttribute("datetime");
  if (!iso) return;
  time.textContent = new Intl.DateTimeFormat("en-AU", { dateStyle: "long" }).format(new Date(iso));
}


// The arrival video is decoration, so it is the last thing to load: only
// after the page itself has loaded, never under reduced motion, Save-Data or
// a 2g connection, and never for a visitor who is already in the lounge.
function arrivalVideoAllowed() {
  if (reducedMotion) return false;
  const connection = navigator.connection;
  if (connection?.saveData === true) return false;
  if (connection && ["slow-2g", "2g"].includes(connection.effectiveType)) return false;
  return true;
}

function loadArrivalVideo() {
  const video = document.querySelector(".arrival-video");
  if (!video || skyActive || !arrivalVideoAllowed()) return;
  // The poster is whichever galaxy WebP the still picture already loaded,
  // so the video never fetches a second copy of the image.
  const still = document.querySelector(".arrival-still img")?.currentSrc;
  video.setAttribute("poster", still || video.dataset.poster);
  for (const source of video.querySelectorAll("source[data-src]")) {
    source.setAttribute("src", source.dataset.src);
  }
  video.muted = true;
  video.addEventListener("playing", () => video.classList.add("playing"), { once: true });
  video.load();
  video.play()?.catch(() => {});
}

function stopArrivalVideo() {
  const video = document.querySelector(".arrival-video");
  if (video && !video.paused) video.pause();
}

// ---- The arrival film -----------------------------------------------------
// A first entry plays a 30-second film before the lounge opens: the author's
// Luna AI video, full-screen and silent, over the arrival's galaxy, with the
// author's own music. The cloud and the music are downloaded only after
// Enter. The visitor only counts as glowing once the lounge opens (joinLounge),
// never during the film. Later entries, and reduced motion, skip it.

const FILM_MS = 30_000;
const FILM_SEEN_KEY = "overlap-film-seen";
const FILM_MUTED_KEY = "overlap-film-muted";
// Shown in this order. Six 5-second slots fit in the film, so the first two
// share the opening slot and "Settling in…" is the last thing read.
const FILM_LINES = [
  "Leaving the noise behind…",
  "Finding a quiet corner…",
  "This is a small experience before you enter the lounge…",
  "Making space to focus…",
  "Nobody here needs a name…",
  "Somewhere, someone else is studying too…",
  "Settling in…",
];
const LINE_MS = 5_000;

const filmEl = document.getElementById("arrival-film");
const filmCloud = document.querySelector("#arrival-film .film-cloud");
const filmLine = document.getElementById("film-line");
const filmFill = document.getElementById("film-bar-fill");
const filmBar = document.querySelector("#arrival-film .film-bar");
const filmRemaining = document.getElementById("film-remaining");
const filmSkip = document.getElementById("film-skip");
const filmSound = document.getElementById("film-sound");
const arrivalWatch = document.getElementById("arrival-watch");

let filming = false;
let filmStartedAt = 0;
let filmTimers = [];
let filmAudio;

function readFlag(key) {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeFlag(key, on) {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // Blocked storage only means the film or the mute choice is not remembered.
  }
}

// --- The moving cloud -----------------------------------------------------
// The galaxy picture is already loaded by the arrival; the film video
// over it is fetched only once the film starts, and fades in once playing.
function startCloud() {
  if (!filmCloud) return;
  for (const source of filmCloud.querySelectorAll("source[data-src]")) {
    if (!source.getAttribute("src")) source.setAttribute("src", source.dataset.src);
  }
  filmCloud.muted = true;
  filmCloud.addEventListener("playing", () => filmCloud.classList.add("playing"), { once: true });
  filmCloud.load();
  filmCloud.play()?.catch(() => {});
}

function stopCloud() {
  if (filmCloud && !filmCloud.paused) filmCloud.pause();
}

// --- Music --------------------------------------------------------------
// The soundtrack is an original track by the project author, trimmed to the
// film's 30 seconds. It is fetched only after Enter and played through Web
// Audio, so one gain node handles the quiet fade in, the fade out and mute
// (suspending the context), and closing the context ends it for good.
const MUSIC_URL = "/assets/arrival-film-music.mp3";
const MUSIC_LEVEL = 0.35;
const MUSIC_FADE_IN_S = 1;

function startMusic() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || filmAudio) return;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.connect(ctx.destination);
  filmAudio = { ctx, master, source: undefined };
  if (readFlag(FILM_MUTED_KEY)) ctx.suspend();

  const audio = filmAudio;
  fetch(MUSIC_URL)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error("music"))))
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      // The film may have ended while the track was downloading.
      if (filmAudio !== audio || !filming) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(master);
      // Start where the film is now, so the music stays in step with the bar.
      const offset = Math.max(0, (Date.now() - filmStartedAt) / 1000);
      if (offset >= buffer.duration) return;
      source.start(0, offset);
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.gain.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + MUSIC_FADE_IN_S);
      audio.source = source;
    })
    // No music is never an error: the film carries on silently.
    .catch(() => {});
}

function stopMusic() {
  if (!filmAudio) return;
  const { ctx, master, source } = filmAudio;
  filmAudio = undefined;
  // Fade out over a second, then release the audio entirely: the lounge is
  // quiet.
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
  setTimeout(() => {
    try {
      source?.stop();
    } catch {
      // Already stopped.
    }
    ctx.close();
  }, 1_100);
}

function updateSoundPill() {
  const muted = readFlag(FILM_MUTED_KEY);
  filmSound.textContent = muted ? "UNMUTE" : "MUTE";
  filmSound.setAttribute("aria-pressed", String(muted));
  filmSound.setAttribute("aria-label", muted ? "Sound is off. Turn sound on" : "Sound is on. Mute");
}

function toggleSound() {
  const muted = !readFlag(FILM_MUTED_KEY);
  writeFlag(FILM_MUTED_KEY, muted);
  updateSoundPill();
  if (!filmAudio && !muted && filming) startMusic();
  else if (filmAudio) muted ? filmAudio.ctx.suspend() : filmAudio.ctx.resume();
}

// --- Words and the bar -----------------------------------------------------
function showFilmLine(index) {
  filmLine.textContent = FILM_LINES[index % FILM_LINES.length];
}

function swapFilmLine(index) {
  filmLine.classList.add("fading");
  filmTimers.push(setTimeout(() => {
    showFilmLine(index);
    filmLine.classList.remove("fading");
  }, 600));
}

function startFilmWords() {
  let index = 0;
  showFilmLine(index);
  // The second line takes the back half of the opening slot.
  filmTimers.push(setTimeout(() => swapFilmLine(++index), LINE_MS / 2));
  filmTimers.push(setInterval(() => {
    if (index >= FILM_LINES.length - 1) return;
    swapFilmLine(++index);
  }, LINE_MS));
}

function updateFilmBar() {
  const elapsed = Math.min(FILM_MS, Date.now() - filmStartedAt);
  filmFill.style.width = `${(elapsed / FILM_MS) * 100}%`;
  const left = Math.ceil((FILM_MS - elapsed) / 1000);
  filmRemaining.textContent = `${left}s`;
  filmBar.setAttribute("aria-valuenow", String(Math.round(elapsed / 1000)));
}

// --- The film's timeline ---------------------------------------------------
// The film is a first-visit gift, never a toll: reduced motion, Save-Data
// and 2g connections go straight into the lounge, as do returning browsers.
function filmAllowed() {
  return Boolean(filmEl) && arrivalVideoAllowed() && !readFlag(FILM_SEEN_KEY);
}

function playFilm() {
  filming = true;
  filmStartedAt = Date.now();
  writeFlag(FILM_SEEN_KEY, true);
  stopArrivalVideo();
  document.body.classList.add("filming");
  filmEl.setAttribute("aria-hidden", "false");
  updateSoundPill();
  updateFilmBar();
  startFilmWords();
  filmTimers.push(setInterval(updateFilmBar, 250));
  filmTimers.push(setTimeout(endFilm, FILM_MS));
  if (!readFlag(FILM_MUTED_KEY)) startMusic();
  startCloud();
  filmSkip.focus();
}

function endFilm() {
  if (!filming) return;
  filming = false;
  for (const t of filmTimers) {
    clearTimeout(t);
    clearInterval(t);
  }
  filmTimers = [];
  stopMusic();
  // The picture keeps drifting while it fades out, then everything stops.
  document.body.classList.add("film-leaving");
  setTimeout(() => {
    document.body.classList.remove("film-leaving");
    stopCloud();
  }, 700);
  document.body.classList.remove("filming");
  filmEl.setAttribute("aria-hidden", "true");
  // The lounge opens at once; the music's fade happens as it does.
  activateSky();
}

// The cloud pauses while the tab is hidden; the film's clock does not.
document.addEventListener("visibilitychange", () => {
  if (!filming) return;
  if (document.visibilityState === "hidden") stopCloud();
  else filmCloud?.play()?.catch(() => {});
});

// Enter plays the film on a browser's first visit, and goes straight into
// the lounge on every later one (and always under reduced motion,
// Save-Data or 2g).
function enterLounge() {
  if (skyActive || filming) return;
  if (filmAllowed()) playFilm();
  else activateSky();
}

// A returning browser can still watch the film, on request.
function watchFilm() {
  if (skyActive || filming || !filmEl || !arrivalVideoAllowed()) return;
  playFilm();
}

// The film is offered on the arrival screen only to a browser that has seen
// it and may play it; a first visit gets it from Enter instead.
function updateWatchControl() {
  if (arrivalWatch) arrivalWatch.hidden = !(filmEl && arrivalVideoAllowed() && readFlag(FILM_SEEN_KEY));
}

// The lounge's way back to the arrival screen. Nothing about the visitor is
// reset: the cookie, star, callsign, conversations and remembered choices
// all stay. Leaving is the same as hiding the tab: the stream closes, so the
// star stops glowing, and Break stops so nobody on the arrival screen is
// counted as listening. The arrival is only a picture again until Enter
// (ADR 0006), where the film can be watched again.
function replayArrival() {
  if (!skyActive || filming) return;
  openChat(false);
  openBreak(false);
  if (breakPlaying()) breakAudio.pause();
  setPicked(false);
  stopRealtime();
  skyActive = false;
  stage?.classList.add("still");
  document.body.classList.add("replaying");
  document.body.classList.remove("entered");
  document.getElementById("sky-app")?.setAttribute("aria-hidden", "true");
  document.getElementById("arrival")?.removeAttribute("aria-hidden");
  updateWatchControl();
  loadArrivalVideo();
  arrivalButton?.focus();
}


function activateSky() {
  if (skyActive) return;
  skyActive = true;
  document.body.classList.remove("replaying");
  stopArrivalVideo();
  document.body.classList.add("entered");
  document.getElementById("arrival")?.setAttribute("aria-hidden", "true");
  document.getElementById("sky-app")?.setAttribute("aria-hidden", "false");
  routeFromHash();
  relayout();
  // Focus goes to something the visitor can act on: their own star, or the
  // view's one action if they have none. Never the heading.
  const own = ownStarInView() ? starNodes.get(ownId()) : undefined;
  const action = [document.getElementById("place-star"), document.getElementById("settle-action")].find((b) => b && !b.hidden);
  (own ?? action)?.focus();
  announce("You've entered the lounge.");
  // Stars glide between places only once the lounge is open: the first
  // paint never animates.
  nextFrame(() => nextFrame(() => stage?.classList.remove("still")));

  joinLounge({ checkIn: document.body.dataset.hasStar === "true" });
}

(function init() {
  localizeSinceDate();
  updateFrame();
  render();
  drawFigures();
  placeDoorways();
  wireStage();
  wireBreak();
  wireTraces();
  wireCallsign();
  wireChat();
  renderChatComposer();

  // Every link to a view changes view in place; the address bar follows.
  for (const a of document.querySelectorAll("a[data-view]")) {
    a.addEventListener("click", (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      setView(a.dataset.view === "common" ? null : a.dataset.view);
    });
  }
  document.getElementById("place-star")?.addEventListener("click", () => placeStar());
  document.getElementById("settle-action")?.addEventListener("click", () => {
    if (view !== "common") settleIn(view);
  });
  document.getElementById("leave-area")?.addEventListener("click", leaveConstellation);

  let resizePending = false;
  window.addEventListener("resize", () => {
    if (resizePending) return;
    resizePending = true;
    nextFrame(() => {
      resizePending = false;
      relayout();
      placeStatus();
    });
  });

  arrivalButton?.addEventListener("click", enterLounge);
  arrivalWatch?.addEventListener("click", watchFilm);
  document.getElementById("replay-arrival")?.addEventListener("click", replayArrival);
  filmSkip?.addEventListener("click", endFilm);
  filmSound?.addEventListener("click", toggleSound);
  document.addEventListener("keydown", (e) => {
    // During the film, Enter and Escape both skip it. Enter on a focused
    // button (Skip or the sound pill) is that button's own click instead.
    if (filming) {
      if (e.key === "Escape" || (e.key === "Enter" && e.target?.tagName !== "BUTTON")) {
        e.preventDefault();
        endFilm();
      }
      return;
    }
    // On the arrival screen only Enter enters: Escape does nothing there.
    if (e.key !== "Escape" || !skyActive) return;
    if (chatPanel && !chatPanel.hidden) openChat(false);
    else if (breakPanel && !breakPanel.hidden) openBreak(false);
    else if (picked) setPicked(false);
  });

  updateWatchControl();
  arrivalButton?.focus();

  if (document.readyState === "complete") loadArrivalVideo();
  else window.addEventListener("load", loadArrivalVideo, { once: true });
})();
