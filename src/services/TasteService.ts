import { readJson, writeJsonDebounced, STORAGE_KEYS } from '../core/storage';
import { Track } from '../core/types';

/**
 * Per-artist affinity, learned incrementally from real listening behaviour.
 *
 * Deliberately artist-scoped: the app's Track model carries no genre or
 * mood data (see core/types.ts) to score by, so this covers the one taste
 * dimension the data actually supports. Extending to genre/mood later just
 * means bumping a different key from the same signals.
 */
export type ArtistScore = {
  artistId: string;
  artistName: string;
  score: number;
  updatedAt: number;
};

const STRONG_LISTEN = 4; // crossed the "real listen" threshold (see usePlayer)
const FULL_COMPLETE = 6; // played all the way to the end
const EARLY_SKIP = -5; // left before the threshold -- a clear pass

/**
 * Each update multiplies the existing score by this before adding the new
 * signal, so old plays fade rather than needing history to be rescanned.
 * At roughly one signal a day, an untouched score falls to near zero in
 * about a month.
 */
const DECAY = 0.98;

const MIN_SCORE = -50;
const MAX_SCORE = 50;

/**
 * Learns which artists a listener favours, purely from playback signals --
 * no history scan, ever. Each event updates exactly one artist's score in
 * O(1), regardless of how large the listening history has grown.
 */
class TasteServiceImpl {
  private scores = new Map<string, ArtistScore>(); // artistId -> score

  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.performLoad();
    return this.loadPromise;
  }

  private async performLoad(): Promise<void> {
    const stored = await readJson<ArtistScore[]>(STORAGE_KEYS.tasteScores, []);
    const list = Array.isArray(stored) ? stored : [];
    this.scores = new Map(list.map((s) => [s.artistId, s]));
  }

  private bump(track: Track, delta: number): void {
    if (!track.artist?.id) return;

    const existing = this.scores.get(track.artist.id);
    const decayed = (existing?.score ?? 0) * DECAY;
    const next = Math.max(MIN_SCORE, Math.min(MAX_SCORE, decayed + delta));

    this.scores.set(track.artist.id, {
      artistId: track.artist.id,
      artistName: track.artist.name,
      score: next,
      updatedAt: Date.now(),
    });
    this.persist();
  }

  /** A genuine listen crossed the "real listen" threshold (see usePlayer). */
  recordListen(track: Track): void {
    this.bump(track, STRONG_LISTEN);
  }

  /** The track played all the way to the end. */
  recordComplete(track: Track): void {
    this.bump(track, FULL_COMPLETE);
  }

  /** Skipped before the "real listen" threshold -- a pass, not just a tap. */
  recordSkip(track: Track): void {
    this.bump(track, EARLY_SKIP);
  }

  getScore(artistId: string): number {
    return this.scores.get(artistId)?.score ?? 0;
  }

  /** Highest-affinity artists, most-favoured first. Negative/zero scores excluded. */
  getTopArtists(limit = 10): ArtistScore[] {
    return [...this.scores.values()]
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private persist(): void {
    writeJsonDebounced(STORAGE_KEYS.tasteScores, [...this.scores.values()], 1000);
  }
}

export const TasteService = new TasteServiceImpl();
