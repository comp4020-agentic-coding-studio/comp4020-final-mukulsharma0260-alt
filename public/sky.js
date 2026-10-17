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

// ---- The arrival film -----------------------------------------------------
// A first entry plays a 30-second film before the lounge opens: a warp drawn
// in code on a canvas, with a soft generated pad. Nothing is downloaded for
// it. The visitor only counts as glowing once the lounge opens (joinLounge),
// never during the film. Later entries, and reduced motion, skip it.

const FILM_MS = 30_000;
const FILM_SEEN_KEY = "overlap-film-seen";
const FILM_MUTED_KEY = "overlap-film-muted";
const FILM_LINES = [
  "Leaving the noise behind…",
  "Finding a quiet corner…",
  "Making space to focus…",
  "Nobody here needs a name…",
  "Somewhere, someone else is studying too…",
  "Settling in…",
];
const LINE_MS = 5_000;

const filmEl = document.getElementById("arrival-film");
const filmCanvas = document.getElementById("film-canvas");
const filmLine = document.getElementById("film-line");
const filmFill = document.getElementById("film-bar-fill");
const filmBar = document.querySelector("#arrival-film .film-bar");
const filmRemaining = document.getElementById("film-remaining");
const filmSkip = document.getElementById("film-skip");
const filmSound = document.getElementById("film-sound");

let filming = false;
let filmStartedAt = 0;
let filmTimers = [];
let filmFrame;
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

// --- Warp, drawn in code ---------------------------------------------------
// Streaks start near the galaxy's bright core and rush outward, accelerating
// slowly over the 30 seconds. Each streak is respawned at the core when it
// leaves the screen, so the flight never loops or seams.
const WARP_COLOURS = ["#9fb4ff", "#b49cff", "#c8d2ff", "#f6efe2", "#f6efe2", "#ffc98a"];
let warp;

function sizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(filmCanvas.clientWidth * ratio));
  const h = Math.max(1, Math.round(filmCanvas.clientHeight * ratio));
  if (filmCanvas.width !== w || filmCanvas.height !== h) {
    filmCanvas.width = w;
    filmCanvas.height = h;
  }
  return { w, h, ratio };
}

function spawnStreak(s, fresh) {
  s.angle = Math.random() * Math.PI * 2;
  s.depth = fresh ? Math.random() : 0.02 + Math.random() * 0.05;
  s.speed = 0.6 + Math.random() * 0.8;
  s.colour = WARP_COLOURS[Math.floor(Math.random() * WARP_COLOURS.length)];
  s.width = 0.6 + Math.random() * 1.2;
  return s;
}

// Animation frames where the browser has them, a timer where it does not, so
// a missing API can never trap a visitor in the film.
const nextFrame = window.requestAnimationFrame
  ? (cb) => window.requestAnimationFrame(cb)
  : (cb) => setTimeout(() => cb(performance.now()), 16);
const cancelFrame = window.cancelAnimationFrame
  ? (id) => window.cancelAnimationFrame(id)
  : (id) => clearTimeout(id);

function startWarp() {
  const ctx = filmCanvas.getContext?.("2d");
  if (!ctx) return;
  warp = { ctx, streaks: Array.from({ length: 220 }, () => spawnStreak({}, true)), last: performance.now() };
  runWarp();
}

function runWarp() {
  if (!warp || filmFrame !== undefined) return;
  warp.last = performance.now();
  const frame = (now) => {
    if (!filming) return;
    const dt = Math.min(0.05, (now - warp.last) / 1000);
    warp.last = now;
    drawWarp(dt);
    filmFrame = nextFrame(frame);
  };
  filmFrame = nextFrame(frame);
}

function drawWarp(dt) {
  const { ctx } = warp;
  const { w, h, ratio } = sizeCanvas();
  // The galaxy's bright core sits up and to the right in the arrival image;
  // the flight heads there.
  const cx = w * 0.62;
  const cy = h * 0.4;
  const reach = Math.hypot(w, h) * 0.75;
  // filmStartedAt is a Date.now() time, so progress must use the same clock.
  const progress = Math.min(1, Math.max(0, (Date.now() - filmStartedAt) / FILM_MS));
  const pace = 0.12 + progress * progress * 0.55;

  // Trails: fade the last frame instead of clearing it.
  ctx.fillStyle = "rgba(2, 3, 12, 0.26)";
  ctx.fillRect(0, 0, w, h);

  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach * (0.22 + progress * 0.12));
  core.addColorStop(0, "rgba(255, 244, 226, 0.5)");
  core.addColorStop(0.25, "rgba(176, 156, 255, 0.18)");
  core.addColorStop(1, "rgba(20, 22, 60, 0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, w, h);

  ctx.lineCap = "round";
  for (const s of warp.streaks) {
    const before = s.depth;
    s.depth += dt * pace * s.speed * (0.4 + s.depth * 2.2);
    if (s.depth > 1.15) {
      spawnStreak(s, false);
      continue;
    }
    const r0 = before * before * reach;
    const r1 = s.depth * s.depth * reach;
    ctx.globalAlpha = Math.min(1, s.depth * 1.6);
    ctx.strokeStyle = s.colour;
    ctx.lineWidth = s.width * ratio * (0.4 + s.depth * 1.4);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(s.angle) * r0, cy + Math.sin(s.angle) * r0);
    ctx.lineTo(cx + Math.cos(s.angle) * r1, cy + Math.sin(s.angle) * r1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function stopWarp() {
  if (filmFrame !== undefined) cancelFrame(filmFrame);
  filmFrame = undefined;
}

// --- Music, generated with Web Audio ---------------------------------------
// A slow pad: a few soft sine voices on a pentatonic scale, through a
// low-pass filter and a generated reverb, swelling gently. Film only.
const PENTATONIC_HZ = [196.0, 220.0, 261.63, 293.66, 329.63, 392.0];
const MUSIC_LEVEL = 0.07;

function makeReverb(ctx) {
  const seconds = 3.5;
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.4;
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

function startMusic() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || filmAudio) return;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + 2);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, ctx.currentTime);
  filter.Q.setValueAtTime(0.4, ctx.currentTime);
  const reverb = makeReverb(ctx);
  const wet = ctx.createGain();
  wet.gain.setValueAtTime(0.6, ctx.currentTime);
  filter.connect(master);
  filter.connect(reverb);
  reverb.connect(wet);
  wet.connect(master);
  master.connect(ctx.destination);

  const voices = [0, 2, 4, 5].map((step, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(PENTATONIC_HZ[step], ctx.currentTime);
    osc.detune.setValueAtTime((i - 1.5) * 4, ctx.currentTime);
    const swell = ctx.createGain();
    swell.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.connect(swell);
    swell.connect(filter);
    osc.start();
    return { osc, swell, phase: i * 1.7 };
  });

  // Slow swells, and now and then one voice drifts to another scale note.
  const tick = setInterval(() => {
    const t = ctx.currentTime;
    for (const v of voices) {
      const level = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(t / 3.2 + v.phase));
      v.swell.gain.setTargetAtTime(level, t, 1.5);
    }
    if (Math.random() < 0.25) {
      const v = voices[Math.floor(Math.random() * voices.length)];
      v.osc.frequency.setTargetAtTime(PENTATONIC_HZ[Math.floor(Math.random() * PENTATONIC_HZ.length)], t, 2.5);
    }
  }, 1_500);

  filmAudio = { ctx, master, voices, tick };
  if (readFlag(FILM_MUTED_KEY)) ctx.suspend();
}

function stopMusic() {
  if (!filmAudio) return;
  const { ctx, master, voices, tick } = filmAudio;
  filmAudio = undefined;
  clearInterval(tick);
  // Fade out over a second, then release the audio entirely: the lounge is
  // quiet.
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
  setTimeout(() => {
    for (const v of voices) v.osc.stop();
    ctx.close();
  }, 1_100);
}

function updateSoundPill() {
  const muted = readFlag(FILM_MUTED_KEY);
  filmSound.textContent = muted ? "SOUND" : "MUTE";
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

function startFilmWords() {
  let index = Math.floor(Math.random() * FILM_LINES.length);
  showFilmLine(index);
  filmTimers.push(setInterval(() => {
    index++;
    if (reducedMotion) return showFilmLine(index);
    filmLine.classList.add("fading");
    filmTimers.push(setTimeout(() => {
      showFilmLine(index);
      filmLine.classList.remove("fading");
    }, 600));
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
function filmAllowed() {
  return Boolean(filmEl) && !reducedMotion && !readFlag(FILM_SEEN_KEY);
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
  startWarp();
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
  stopWarp();
  stopMusic();
  document.body.classList.remove("filming");
  filmEl.setAttribute("aria-hidden", "true");
  // The lounge opens at once; the music's fade happens as it does.
  activateSky();
}

// The warp pauses while the tab is hidden, and picks up where it left off.
document.addEventListener("visibilitychange", () => {
  if (!filming) return;
  if (document.visibilityState === "hidden") stopWarp();
  else runWarp();
});

function enterLounge() {
  if (skyActive || filming) return;
  saveCheckIn();
  if (filmAllowed()) playFilm();
  else activateSky();
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

  arrivalButton?.addEventListener("click", enterLounge);
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
    if (!skyActive && e.key === "Escape") enterLounge();
  });

  if (hasCheckedIn()) activateSky();
  else arrivalButton?.focus();

  if (document.readyState === "complete") loadArrivalVideo();
  else window.addEventListener("load", loadArrivalVideo, { once: true });
})();
