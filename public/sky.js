const svg = document.getElementById("sky");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const liveStatusEl = document.getElementById("live-status");
const placePrompt = document.getElementById("place-prompt");
const placeButton = document.getElementById("place-star");
const arrivalButton = document.getElementById("arrival-submit");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SVG_NS = "http://www.w3.org/2000/svg";
const HOUR_MS = 60 * 60 * 1000;

let statusTimer;
let realtime;
let liveStarIds = new Set();
let skyActive = false;

const ARRIVAL_KEY = "overlap-arrival-v2";

function hasCheckedIn() {
  try {
    return window.localStorage.getItem(ARRIVAL_KEY) !== null;
  } catch {
    return false;
  }
}

function saveCheckIn() {
  try {
    // Browser-only arrival state. It deliberately does not create an account,
    // server identity, or visible name.
    window.localStorage.setItem(ARRIVAL_KEY, "entered");
  } catch {
    // A blocked localStorage must not prevent a visitor from using the sky.
  }
}
function announce(text, { transient = true } = {}) {
  clearTimeout(statusTimer);
  statusEl.textContent = text;
  statusEl.classList.remove("error");
  statusEl.classList.add("visible");
  if (transient) {
    statusTimer = setTimeout(() => {
      statusEl.classList.remove("visible");
    }, 2200);
  }
}

function announceError(text) {
  clearTimeout(statusTimer);
  statusEl.textContent = text;
  statusEl.classList.add("visible", "error");
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function toSvgPoint(clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

function updateCount() {
  if (!countEl) return;
  const n = svg.querySelectorAll("circle[data-id]").length;
  countEl.textContent = n === 0 ? "" : n === 1 ? "1 star" : `${n} stars`;
}

function starSelector(id) {
  return `circle[data-id="${CSS.escape(id)}"]`;
}

function setCirclePosition(circle, x, y) {
  circle.setAttribute("cx", String(x));
  circle.setAttribute("cy", String(y));
}

function remoteStarClass(star) {
  return `star ${star.brightness ?? "bright"}${liveStarIds.has(star.id) ? " live" : ""}`;
}

function updateStarFromServer(star) {
  const existing = svg.querySelector(starSelector(star.id));
  if (existing?.dataset.own === "true") {
    const group = existing.closest("g.own-star-group");
    const ring = group?.querySelector(".star-ring");
    const label = group?.querySelector(".star-you-label");
    if (ring && label) moveVisualTo({ circle: existing, ring, label }, star.x, star.y);
    existing.classList.remove("bright", "soft", "dim", "faint");
    existing.classList.add(star.brightness ?? "bright");
    existing.classList.toggle("live", liveStarIds.has(star.id));
    return existing;
  }

  if (existing) {
    setCirclePosition(existing, star.x, star.y);
    existing.setAttribute("class", remoteStarClass(star));
    existing.querySelector("title")?.remove();
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = liveStarIds.has(star.id)
      ? "Glowing: a browser has this lounge open now"
      : "A star in the lounge";
    existing.appendChild(title);
    return existing;
  }

  const circle = document.createElementNS(SVG_NS, "circle");
  setCirclePosition(circle, star.x, star.y);
  circle.setAttribute("r", "0.012");
  circle.setAttribute("data-id", star.id);
  circle.setAttribute("data-own", "false");
  circle.setAttribute("class", remoteStarClass(star));
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = liveStarIds.has(star.id)
    ? "Glowing: a browser has this lounge open now"
    : "A star in the lounge";
  circle.appendChild(title);
  svg.appendChild(circle);
  updateCount();
  return circle;
}

function updateLiveStatus(ids) {
  liveStarIds = new Set(ids);
  for (const circle of svg.querySelectorAll("circle[data-id]")) {
    circle.classList.toggle("live", liveStarIds.has(circle.dataset.id));
    if (circle.dataset.own !== "true") updateStarFromServer({
      id: circle.dataset.id,
      x: Number(circle.getAttribute("cx")),
      y: Number(circle.getAttribute("cy")),
      brightness: [...circle.classList].find((name) => ["bright", "soft", "dim", "faint"].includes(name)) ?? "bright",
    });
  }

  if (!liveStatusEl) return;
  const ownId = svg.querySelector('circle[data-own="true"]')?.dataset.id;
  const others = [...liveStarIds].filter((id) => id !== ownId).length;
  liveStatusEl.classList.toggle("connected", Boolean(ownId && liveStarIds.has(ownId)));
  if (!ownId) {
    const n = liveStarIds.size;
    liveStatusEl.textContent = n === 0
      ? "Place a star to join the lounge."
      : `${n} ${n === 1 ? "star is" : "stars are"} glowing in the lounge now. Place a star to join.`;
  } else if (!liveStarIds.has(ownId)) {
    liveStatusEl.textContent = "Reconnecting to the lounge…";
  } else if (others === 0) {
    liveStatusEl.textContent = "Your star is the only one glowing right now.";
  } else {
    liveStatusEl.textContent = `${others} other ${others === 1 ? "star is" : "stars are"} glowing right now.`;
  }
}

function startRealtime() {
  realtime?.close();
  realtime = new EventSource("/events");

  realtime.addEventListener("sync", (event) => {
    const data = JSON.parse(event.data);
    updateLiveStatus(data.liveStarIds ?? []);
    for (const star of data.stars ?? []) updateStarFromServer(star);
    updateLiveStatus(data.liveStarIds ?? []);
  });
  realtime.addEventListener("star", (event) => {
    const { star } = JSON.parse(event.data);
    const circle = updateStarFromServer(star);
    ringPulse(circle);
  });
  realtime.addEventListener("live", (event) => {
    updateLiveStatus(JSON.parse(event.data).starIds ?? []);
  });
  realtime.addEventListener("error", () => {
    if (liveStatusEl) {
      liveStatusEl.classList.remove("connected");
      liveStatusEl.textContent = "Reconnecting to the lounge…";
    }
  });
}

// Live means an open AND visible tab that has entered the lounge (ADRs 0005
// and 0006). A hidden tab drops its stream, so its glow goes out on the
// server; showing the tab again reconnects, gets a fresh snapshot, and checks
// in like a return visit.
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
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopRealtime();
    return;
  }
  joinLounge();
});

function ringPulse(circle) {
  if (reducedMotion) return;
  circle.classList.add("new-ring");
  setTimeout(() => circle.classList.remove("new-ring"), 1600);
}

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

function makeOwnStarGroup(star) {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "own-star-group");

  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("class", "star-ring");
  ring.setAttribute("cx", String(star.x));
  ring.setAttribute("cy", String(star.y));
  ring.setAttribute("r", "0.026");

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(star.x));
  circle.setAttribute("cy", String(star.y));
  circle.setAttribute("r", "0.017");
  circle.setAttribute("data-id", star.id);
  circle.setAttribute("data-own", "true");
  circle.setAttribute("class", "star bright own");
  circle.setAttribute("tabindex", "0");
  circle.setAttribute("role", "button");
  circle.setAttribute("aria-label", "Your star. Drag or use arrow keys to move it. Hold Shift for a bigger step.");

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("class", "star-you-label");
  label.setAttribute("x", String(star.x));
  label.setAttribute("y", String(star.y - 0.042));
  label.setAttribute("text-anchor", "middle");
  label.textContent = "you";

  group.append(ring, circle, label);
  return { group, ring, circle, label };
}

let saveTimer;
function saveMove(x, y) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch("/api/star/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y }),
    }).catch(() => {
      announceError("Could not save your star's new position. Check your connection and try again.");
    });
  }, 300);
}

function moveVisualTo(parts, x, y) {
  parts.ring.setAttribute("cx", String(x));
  parts.ring.setAttribute("cy", String(y));
  parts.circle.setAttribute("cx", String(x));
  parts.circle.setAttribute("cy", String(y));
  parts.label.setAttribute("x", String(x));
  parts.label.setAttribute("y", String(y - 0.042));
}

function wireDrag(parts) {
  const { circle } = parts;
  let dragging = false;

  circle.addEventListener("pointerdown", (e) => {
    dragging = true;
    circle.setPointerCapture(e.pointerId);
    circle.classList.add("dragging");
  });

  circle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const { x, y } = toSvgPoint(e.clientX, e.clientY);
    moveVisualTo(parts, x, y);
    saveMove(x, y);
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    circle.classList.remove("dragging");
    const x = Number(circle.getAttribute("cx"));
    const y = Number(circle.getAttribute("cy"));
    clearTimeout(saveTimer);
    fetch("/api/star/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("move failed");
        announce("Star moved.");
      })
      .catch(() => {
        announceError("Could not save your star's new position. Check your connection and try again.");
      });
  }

  circle.addEventListener("pointerup", endDrag);
  circle.addEventListener("pointercancel", endDrag);

  circle.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    let x = Number(circle.getAttribute("cx"));
    let y = Number(circle.getAttribute("cy"));
    if (e.key === "ArrowLeft") x = clamp01(x - step);
    else if (e.key === "ArrowRight") x = clamp01(x + step);
    else if (e.key === "ArrowUp") y = clamp01(y - step);
    else if (e.key === "ArrowDown") y = clamp01(y + step);
    else return;
    e.preventDefault();
    moveVisualTo(parts, x, y);
    saveMove(x, y);
    announce("Star moved.");
  });
}

async function placeStar(x, y) {
  const body = x === undefined ? "{}" : JSON.stringify({ x, y });
  let res;
  try {
    res = await fetch("/api/star", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    announceError("Could not place your star. Check your connection and try again.");
    return;
  }
  if (!res.ok) {
    announceError("Could not place your star. Please try again.");
    return;
  }
  const { star } = await res.json();

  document.body.dataset.hasStar = "true";
  const parts = makeOwnStarGroup(star);
  svg.appendChild(parts.group);
  wireDrag(parts);
  ringPulse(parts.circle);
  updateCount();
  announce("Your star joined the lounge.");
  placePrompt?.remove();
  // Reconnect so the stream now carries this browser's own star as live.
  joinLounge({ checkIn: false });
}

async function reportHere() {
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
    announce(`Welcome back. ${sincePart} ${newPart}`.trim(), { transient: false });
  }

  for (const id of data.newStarIds ?? []) {
    const circle = svg.querySelector(`circle[data-id="${CSS.escape(id)}"]`);
    if (circle) ringPulse(circle);
  }

  const ownCircle = svg.querySelector('circle[data-own="true"]');
  if (ownCircle) {
    ownCircle.classList.remove("soft", "dim", "faint");
    ownCircle.classList.add("bright");
  }
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

function activateSky({ remember = false } = {}) {
  if (skyActive) return;
  if (remember) saveCheckIn();
  skyActive = true;
  stopArrivalVideo();
  document.body.classList.add("entered");
  document.getElementById("arrival")?.setAttribute("aria-hidden", "true");
  document.getElementById("sky-app")?.setAttribute("aria-hidden", "false");
  const heading = document.querySelector("#sky-app h1");
  heading?.setAttribute("tabindex", "-1");
  heading?.focus();

  joinLounge({ checkIn: document.body.dataset.hasStar === "true" });
}

(function init() {
  localizeSinceDate();
  const hasStar = document.body.dataset.hasStar === "true";

  if (hasStar) {
    const ownCircle = svg.querySelector('circle[data-own="true"]');
    const group = ownCircle?.closest("g.own-star-group");
    if (ownCircle && group) {
      const ring = group.querySelector(".star-ring");
      const label = group.querySelector(".star-you-label");
      wireDrag({ circle: ownCircle, ring, label });
    }
  } else {
    placeButton?.addEventListener("click", () => {
      placeStar();
    });

    svg.addEventListener("click", (e) => {
      if (document.body.dataset.hasStar === "true") return;
      const { x, y } = toSvgPoint(e.clientX, e.clientY);
      placeStar(x, y);
    });
  }

  arrivalButton?.addEventListener("click", () => activateSky({ remember: true }));
  document.addEventListener("keydown", (e) => {
    if (!skyActive && e.key === "Escape") activateSky({ remember: true });
  });

  if (hasCheckedIn()) activateSky();
  else arrivalButton?.focus();

  if (document.readyState === "complete") loadArrivalVideo();
  else window.addEventListener("load", loadArrivalVideo, { once: true });
})();
