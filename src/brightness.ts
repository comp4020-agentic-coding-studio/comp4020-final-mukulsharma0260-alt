export type Brightness = "bright" | "soft" | "dim" | "faint";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function oldLight(lastSeenAt: Date, now: Date = new Date()): Brightness {
  const ageMs = now.getTime() - lastSeenAt.getTime();
  if (ageMs < HOUR) return "bright";
  if (ageMs < DAY) return "soft";
  if (ageMs < WEEK) return "dim";
  return "faint";
}

// Rough recency text for other visitors' stars — never an exact timestamp.
export function recencyText(lastSeenAt: Date, now: Date = new Date()): string {
  const ageMs = now.getTime() - lastSeenAt.getTime();
  if (ageMs < HOUR) return "seen in the last hour";
  if (ageMs < DAY) return "seen in the last day";
  if (ageMs < WEEK) return "seen in the last week";
  return "seen long ago";
}
