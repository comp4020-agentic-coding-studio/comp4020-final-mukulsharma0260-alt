import type { Constellation } from "./db.ts";

// Where each constellation sits on the Common Room's one shared map, in the
// same 0-1 fractions as star positions. The regions never overlap, and the
// space between them is open Common Room. A settled star always lives inside
// its region; the server keeps it there, so a browser cannot place a star in
// one constellation while claiming another. public/sky.js and src/render.ts
// draw from this same table (the server sends it with the page).
export type Region = { x0: number; y0: number; x1: number; y1: number };

export const REGIONS: Record<Constellation, Region> = {
  science: { x0: 0.05, y0: 0.06, x1: 0.33, y1: 0.36 },
  engineering: { x0: 0.37, y0: 0.04, x1: 0.63, y1: 0.32 },
  business: { x0: 0.67, y0: 0.06, x1: 0.95, y1: 0.36 },
  health: { x0: 0.12, y0: 0.6, x1: 0.42, y1: 0.92 },
  arts: { x0: 0.58, y0: 0.6, x1: 0.88, y1: 0.92 },
};

export function inRegion(id: Constellation, x: number, y: number): boolean {
  const r = REGIONS[id];
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

// The nearest point inside the region: a position already inside is kept
// exactly; one outside is pulled to the edge.
export function clampToRegion(id: Constellation, x: number, y: number): { x: number; y: number } {
  const r = REGIONS[id];
  return { x: Math.min(r.x1, Math.max(r.x0, x)), y: Math.min(r.y1, Math.max(r.y0, y)) };
}

// Where a star goes when it first settles: where it is, if that is already
// inside; otherwise a spot inside the region picked from the star's own id,
// so it is stable for that star and stars do not all land on one point.
export function settlePosition(id: Constellation, starId: string, x: number, y: number): { x: number; y: number } {
  if (inRegion(id, x, y)) return { x, y };
  return spotInRegion(id, starId);
}

// A star's own spot inside a region, picked from its id: stable for that
// star, and different for different stars, so newcomers never stack on one
// point.
export function spotInRegion(id: Constellation, starId: string): { x: number; y: number } {
  const r = REGIONS[id];
  let h = 2166136261;
  for (const ch of starId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const u = (h & 0xffff) / 0xffff;
  const v = (h >>> 16) / 0xffff;
  const pad = 0.12;
  return {
    x: Number((r.x0 + (r.x1 - r.x0) * (pad + u * (1 - 2 * pad))).toFixed(4)),
    y: Number((r.y0 + (r.y1 - r.y0) * (pad + v * (1 - 2 * pad))).toFixed(4)),
  };
}
