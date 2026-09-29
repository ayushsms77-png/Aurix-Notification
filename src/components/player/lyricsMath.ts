/**
 * Pure helpers for the lyrics view (no React / native imports, so they can be
 * unit-tested on their own).
 */

export type SyncedLine = { time: number; text: string };
export type LineTier = 'active' | 'near' | 'far';

/**
 * The progress poll ticks ~4x a second, so a line that starts at t would show
 * up to ~250ms late. Switching a hair early makes lines land on the beat.
 */
export const LYRIC_LEAD_SECONDS = 0.2;

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
 * Focus level for a line: the active one is sharp, its neighbours are
 * slightly blurred, everything further out is blurred more.
 */
export function tierFor(distance: number): LineTier {
  if (distance === 0) return 'active';
  return distance <= 2 ? 'near' : 'far';
}

/** Which blur layers a line needs mounted (far-away lines skip the near layer, and vice versa). */
export function layersFor(distance: number): { near: boolean; far: boolean } {
  return { near: distance <= 4, far: distance >= 2 };
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
