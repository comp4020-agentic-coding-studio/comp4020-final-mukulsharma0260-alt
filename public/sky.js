const svg = document.getElementById("sky");
const banner = document.getElementById("banner");
const countEl = document.getElementById("count");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SVG_NS = "http://www.w3.org/2000/svg";

function announce(text) {
  banner.textContent = text;
}

function makeCircle(star, isOwn) {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(star.x));
  circle.setAttribute("cy", String(star.y));
  circle.setAttribute("r", isOwn ? "0.018" : "0.012");
  circle.setAttribute("data-id", star.id);
  circle.setAttribute("data-own", String(isOwn));
  circle.setAttribute("class", `star bright${isOwn ? " own" : ""}`);
  if (isOwn) {
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("role", "button");
    circle.setAttribute("aria-label", "Your star. Drag or use arrow keys to move it.");
  }
  return circle;
}

function ringPulse(circle) {
  if (reducedMotion) return;
  circle.classList.add("new-ring");
  setTimeout(() => circle.classList.remove("new-ring"), 1600);
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

async function ensureOwnStar() {
  const res = await fetch("/api/star", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await res.json();
  const star = data.star;
  let circle = svg.querySelector(`circle[data-id="${CSS.escape(star.id)}"]`);
  if (!circle) {
    circle = makeCircle(star, true);
    svg.appendChild(circle);
    const n = svg.querySelectorAll("circle").length;
    countEl.textContent = n === 1 ? "1 star" : `${n} stars`;
    announce("Your star joined the sky.");
    ringPulse(circle);
  } else {
    circle.setAttribute("data-own", "true");
    circle.classList.add("own");
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("role", "button");
    circle.setAttribute("aria-label", "Your star. Drag or use arrow keys to move it.");
  }
  return circle;
}

async function reportHere() {
  const res = await fetch("/api/here", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await res.json();
  if (data.newCount > 0) {
    announce(
      data.newCount === 1
        ? "1 star appeared while you were away."
        : `${data.newCount} stars appeared while you were away.`,
    );
    for (const id of data.newStarIds) {
      const circle = svg.querySelector(`circle[data-id="${CSS.escape(id)}"]`);
      if (circle) ringPulse(circle);
    }
  }
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

function wireDrag(circle) {
  let dragging = false;

  function toSvgPoint(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  circle.addEventListener("pointerdown", (e) => {
    dragging = true;
    circle.setPointerCapture(e.pointerId);
    circle.classList.add("dragging");
  });

  circle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const { x, y } = toSvgPoint(e.clientX, e.clientY);
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    saveMove(x, y);
  });

  function endDrag(e) {
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
    const step = 0.015;
    let x = Number(circle.getAttribute("cx"));
    let y = Number(circle.getAttribute("cy"));
    if (e.key === "ArrowLeft") x = clamp01(x - step);
    else if (e.key === "ArrowRight") x = clamp01(x + step);
    else if (e.key === "ArrowUp") y = clamp01(y - step);
    else if (e.key === "ArrowDown") y = clamp01(y + step);
    else return;
    e.preventDefault();
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    saveMove(x, y);
    announce("Star moved.");
  });
}

(async function init() {
  const ownCircle = await ensureOwnStar();
  wireDrag(ownCircle);
  await reportHere();
})();
