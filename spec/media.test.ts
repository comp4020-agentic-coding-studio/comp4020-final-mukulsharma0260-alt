import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// The film is the author's Luna AI video: a fast montage of hard cuts,
// slowed to 30 seconds with its cuts dissolved and its whites toned down.
// These check the shipped files, not the page: no sound can ever come from
// them, and they stay within the flash limit.
const FILM = ["public/assets/arrival-film-1080.mp4", "public/assets/arrival-film-1080.webm"];

it("the film MP4 has no audio track", () => {
  // Every track in an MP4 declares its kind in an "hdlr" box: "vide" for
  // video, "soun" for sound. A silent file has no "soun" handler at all.
  const bytes = readFileSync(FILM[0]!);
  const handlers: string[] = [];
  for (let i = bytes.indexOf("hdlr"); i !== -1; i = bytes.indexOf("hdlr", i + 4)) {
    handlers.push(bytes.subarray(i + 12, i + 16).toString("latin1"));
  }
  expect(handlers).toContain("vide");
  expect(handlers).not.toContain("soun");
});

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function frameMeans(file: string): number[] {
  const raw = execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-i", file, "-vf", "scale=16:9,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 26 });
  const size = 16 * 9;
  const means: number[] = [];
  for (let i = 0; i + size <= raw.length; i += size) {
    let sum = 0;
    for (let j = i; j < i + size; j++) sum += raw[j]!;
    means.push(sum / size);
  }
  return means;
}

// WCAG 2.3.1: no more than three flashes in any one second. A flash is a pair
// of opposing swings in brightness, so this counts swings of 25 or more levels
// (out of 255), joining steps in the same direction a few frames apart into
// one swing, and allows at most five in any 30 frames.
it.skipIf(!hasFfmpeg)("the film stays within three flashes a second", () => {
  for (const file of FILM) {
    const means = frameMeans(file);
    expect(means.length, file).toBeGreaterThan(30 * 25);
    const swings: Array<{ at: number; size: number; last: number }> = [];
    for (let i = 1; i < means.length; i++) {
      const step = means[i]! - means[i - 1]!;
      if (Math.abs(step) < 3) continue;
      const prev = swings.at(-1);
      if (prev && Math.sign(prev.size) === Math.sign(step) && i - prev.last <= 4) {
        prev.size += step;
        prev.last = i;
      } else {
        swings.push({ at: i, size: step, last: i });
      }
    }
    const big = swings.filter((s) => Math.abs(s.size) >= 25).map((s) => s.at);
    let worst = 0;
    for (const start of big) worst = Math.max(worst, big.filter((at) => at >= start && at < start + 30).length);
    expect(worst, `${file}: brightness swings in one second`).toBeLessThanOrEqual(5);
  }
});
