/**
 * A local playback clock.
 *
 * The native player is the source of truth for position, but asking it is
 * expensive on the JS side (see PlaybackEngine). So the app keeps this small
 * stopwatch instead: it is told the real position now and then, and in between
 * it simply counts forward while audio is playing. The seek bar, the lyrics and
 * the mini player all read this, never the native player directly.
 *
 * Rules:
 *  - While playing, position = last known position + time elapsed since.
 *  - A fresh reading that agrees with the stopwatch (within DRIFT_TOLERANCE)
 *    is ignored, so the bar never twitches; a reading that disagrees (a seek,
 *    a rebuffer, a late stall) re-anchors the clock.
 *  - Pausing freezes it; resuming continues from the frozen spot.
 *
 * Pure TypeScript, no React Native imports, so it can be unit-tested alone.
 */

/** Readings closer than this (seconds) to the stopwatch are treated as "in agreement". */
export const DRIFT_TOLERANCE = 0.3;
/**
 * Upper bound on how old a reading can be when it reaches us (ms). Events that
 * queue up while the JS thread is stalled are delivered late with their
 * original timestamps, so this must comfortably exceed a long stall; it only
 * exists to stop an absurd timestamp from flinging the clock.
 */
const MAX_READING_AGE_MS = 30_000;

export type ClockListener = () => void;

export class ProgressClock {
  private position = 0;
  private duration = 0;
  private anchoredAt: number;
  private playing = false;
  private listeners = new Set<ClockListener>();

  constructor(private readonly nowMs: () => number = () => Date.now()) {
    this.anchoredAt = nowMs();
  }

  /** Current position in seconds (extrapolated while playing). */
  now(): number {
    if (!this.playing) return this.position;
    const p = this.position + (this.nowMs() - this.anchoredAt) / 1000;
    return this.duration > 0 ? Math.min(p, this.duration) : p;
  }

  getDuration(): number {
    return this.duration;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * A fresh reading from the native player.
   * `ageMs`: how long ago the reading was taken (events travel from native to
   * JS, so a playing reading is already slightly out of date on arrival).
   * `force`: always re-anchor (seeks, track changes) instead of keeping the
   * smooth stopwatch.
   */
  sync(
    position: number,
    duration: number,
    playing: boolean,
    opts: { force?: boolean; ageMs?: number } = {}
  ): void {
    // A garbage reading must never drag the clock to 0: ignore it.
    if (!Number.isFinite(position)) return;
    const pos = Math.max(0, position);
    const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const age = playing ? Math.min(Math.max(opts.ageMs ?? 0, 0), MAX_READING_AGE_MS) : 0;
    const truePos = pos + age / 1000;

    const durationChanged = dur > 0 && dur !== this.duration;
    const agrees =
      !opts.force &&
      playing === this.playing &&
      playing &&
      Math.abs(truePos - this.now()) < DRIFT_TOLERANCE;

    if (agrees) {
      if (durationChanged) {
        this.duration = dur;
        this.emit();
      }
      return;
    }

    this.position = dur > 0 ? Math.min(truePos, dur) : truePos;
    if (dur > 0) this.duration = dur;
    this.playing = playing;
    this.anchoredAt = this.nowMs();
    this.emit();
  }

  /** Audio output started or stopped (pause, buffering, end of track). */
  setPlaying(playing: boolean): void {
    if (playing === this.playing) return;
    if (!playing) this.position = this.now(); // freeze exactly where it is
    this.playing = playing;
    this.anchoredAt = this.nowMs();
    this.emit();
  }

  /** New track / stop: start over. */
  reset(position = 0, duration = 0, playing = false): void {
    this.position = Math.max(0, position);
    this.duration = Math.max(0, duration);
    this.playing = playing;
    this.anchoredAt = this.nowMs();
    this.emit();
  }

  /** Called whenever the clock was re-anchored, paused/resumed or its duration changed. */
  subscribe(listener: ClockListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}

export const progressClock = new ProgressClock();
