const svg = document.getElementById("sky");
const banner = document.getElementById("banner");
const countEl = document.getElementById("count");
const placePrompt = document.getElementById("place-prompt");
const placeButton = document.getElementById("place-star");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SVG_NS = "http://www.w3.org/2000/svg";
const HOUR_MS = 60 * 60 * 1000;

function announce(text) {
  banner.textContent = text;
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
  countEl.textContent = n === 1 ? "1 star" : `${n} stars`;
}

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
  ring.setAttribute("r", "0.028");

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(star.x));
  circle.setAttribute("cy", String(star.y));
  circle.setAttribute("r", "0.018");
  circle.setAttribute("data-id", star.id);
  circle.setAttribute("data-own", "true");
  circle.setAttribute("class", "star bright own");
  circle.setAttribute("tabindex", "0");
  circle.setAttribute("role", "button");
  circle.setAttribute("aria-label", "Your star. Drag or use arrow keys to move it. Hold Shift for a bigger step.");

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("class", "star-you-label");
  label.setAttribute("x", String(star.x));
  label.setAttribute("y", String(star.y - 0.035));
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
    }).catch(() => {});
  }, 300);
}

function moveVisualTo(parts, x, y) {
  parts.ring.setAttribute("cx", String(x));
  parts.ring.setAttribute("cy", String(y));
  parts.circle.setAttribute("cx", String(x));
  parts.circle.setAttribute("cy", String(y));
  parts.label.setAttribute("x", String(x));
  parts.label.setAttribute("y", String(y - 0.035));
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
    }).catch(() => {});
    announce("Star moved.");
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
  const res = await fetch("/api/star", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const { star } = await res.json();

  document.body.dataset.hasStar = "true";
  const parts = makeOwnStarGroup(star);
  svg.appendChild(parts.group);
  wireDrag(parts);
  ringPulse(parts.circle);
  updateCount();
  announce("Your star joined the sky.");
  placePrompt?.remove();
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
    announce(`Welcome back. ${sincePart} ${newPart}`.trim());
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

(function init() {
  const hasStar = document.body.dataset.hasStar === "true";

  if (hasStar) {
    const ownCircle = svg.querySelector('circle[data-own="true"]');
    const group = ownCircle?.closest("g.own-star-group");
    if (ownCircle && group) {
      const ring = group.querySelector(".star-ring");
      const label = group.querySelector(".star-you-label");
      wireDrag({ circle: ownCircle, ring, label });
    }
    reportHere();
    return;
  }

  placeButton?.addEventListener("click", () => {
    placeStar();
  });

  svg.addEventListener("click", (e) => {
    if (document.body.dataset.hasStar === "true") return;
    const { x, y } = toSvgPoint(e.clientX, e.clientY);
    placeStar(x, y);
  });
})();
