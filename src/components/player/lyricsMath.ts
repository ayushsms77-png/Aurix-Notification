/**
 * Pure helpers for the lyrics view (no React / native imports, so they can be
 * unit-tested on their own).
 */

export type SyncedLine = { time: number; text: string };
/**
 * The lyrics are checked against the clock every 100ms, so a line that starts
 * at t could show up to 100ms late. Switching a hair early lands it on the beat.
 */
export const LYRIC_LEAD_SECONDS = 0.1;

/** 0 = active (sharp); 1..3 = increasingly blurred and dim. */
export type LineTier = 0 | 1 | 2 | 3;

/** Index of the line whose timestamp is the latest one <= position (-1 before the first line). */
export function activeIndexAt(lines: readonly SyncedLine[], position: number): number {
  const t = position + LYRIC_LEAD_SECONDS;
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** How far a line is from the active one. Before the first line, line 0 counts as distance 1. */
export function lineDistance(index: number, activeIndex: number): number {
  return Math.abs(index - activeIndex);
}

/**
 * Focus level for a line: the active one is sharp, the ones right next to it
 * are slightly blurred, and every step further out is blurrier and dimmer
 * (like Apple Music, where blur grows with distance from the current line).
 */
export function tierIndex(distance: number): LineTier {
  return Math.min(Math.max(distance, 0), 3) as LineTier;
}

/**
 * Which blur layers a line needs mounted. A line crossfades between its
 * current tier and the tier of a neighbouring distance when focus moves by
 * one line, so both ends of any possible transition must already exist.
 */
export function layersFor(distance: number): { t1: boolean; t2: boolean; t3: boolean } {
  const wanted = new Set<number>([tierIndex(distance), tierIndex(distance + 1)]);
  if (distance > 0) wanted.add(tierIndex(distance - 1));
  return { t1: wanted.has(1), t2: wanted.has(2), t3: wanted.has(3) };
}

/** translateY that puts a line's top edge at `anchorTop` inside the viewport. */
export function translateFor(lineTop: number, anchorTop: number): number {
  return anchorTop - lineTop;
}

/** Alpha ramp for one fade edge: smooth (ease-in-out), 0 -> 1, `steps` samples. */
export function fadeRamp(steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    const x = (i + 0.5) / steps;
    out.push(x * x * (3 - 2 * x)); // smoothstep
  }
  return out;
}

/**
 * Piecewise-linear stops (in translation space) for a line's edge-fade
 * opacity. The line is fully visible in the middle of the lyrics area and
 * eases (smoothstep) to 0 at the top and bottom edges, based on where the
 * line's centre is on screen: screenY = translation + centre.
 *
 * Because this is a plain interpolation of the animated translation, it runs
 * on the native driver: no native mask, no overlay, and it works on top of
 * any album-art background.
 */
export function edgeFadeStops(
  center: number,
  areaHeight: number,
  fadeTop: number,
  fadeBottom: number,
  steps = 6
): { input: number[]; output: number[] } {
  const total = fadeTop + fadeBottom;
  const k = total > areaHeight - 8 ? Math.max(areaHeight - 8, 1) / total : 1;
  const ft = fadeTop * k;
  const fb = fadeBottom * k;
  const ys: number[] = [0];
  const os: number[] = [0];
  for (let i = 1; i <= steps; i++) {
    const x = i / steps;
    ys.push(ft * x);
    os.push(x * x * (3 - 2 * x));
  }
  const bottomStart = areaHeight - fb;
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    ys.push(bottomStart + fb * x);
    os.push(1 - x * x * (3 - 2 * x));
  }
  // Drop any non-increasing duplicates (tiny areas) so interpolate() accepts the ranges.
  const input: number[] = [];
  const output: number[] = [];
  for (let i = 0; i < ys.length; i++) {
    const v = ys[i] - center;
    if (input.length && v <= input[input.length - 1]) continue;
    input.push(v);
    output.push(os[i]);
  }
  return { input, output };
}
