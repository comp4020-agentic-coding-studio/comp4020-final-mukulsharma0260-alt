// The Break drawer's modes, fixed in code like the constellations. Each is
// one track supplied by the project owner (docs/credits.md). The server uses
// the ids to validate what a browser says it is listening to and serves the
// files from its asset allowlist; the page draws its buttons from the same
// list, so a mode without a real track cannot appear.
export const BREAK_MODES = [
  { id: "calm", name: "Calm", line: "Slow and soft, for winding down", src: "/assets/audio/calm.mp3" },
  { id: "focus", name: "Focus", line: "Steady, for heads-down work", src: "/assets/audio/focus.mp3" },
  { id: "energy", name: "Energy", line: "Brighter, for a second wind", src: "/assets/audio/energy.mp3" },
  { id: "deep-space", name: "Deep Space", line: "Dark and wide, for late hours", src: "/assets/audio/horror.mp3" },
  { id: "night-walk", name: "Night Walk", line: "A low beat, for a short break", src: "/assets/audio/beat-sk.mp3" },
] as const;

export type BreakMode = (typeof BREAK_MODES)[number]["id"];

export function isBreakMode(value: unknown): value is BreakMode {
  return typeof value === "string" && BREAK_MODES.some((m) => m.id === value);
}
