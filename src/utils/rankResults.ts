import { Track } from '../core/types';

/**
 * Title patterns that make a result very unlikely to be the single song a
 * user meant — compilations, hour-long mixes, live sets, reaction videos.
 * These only demote a track's rank (see rankTracks); they never exclude it,
 * since some genuine songs have no other upload.
 */
const JUNK_TITLE_PATTERNS: RegExp[] = [
  /\bcompilation\b/i,
  /\bfull album\b/i,
  /\bjukebox\b/i,
  /\b\d+\s*(hour|hr)s?\b/i,
  /\blive concert\b/i,
  /\breaction\b/i,
  /\bmashup\b/i,
  /\bnon[\s-]?stop\b/i,
];

const MIN_NORMAL_DURATION = 60; // 1 min
const MAX_NORMAL_DURATION = 420; // 7 min
const VERY_LONG_DURATION = 900; // 15 min — near-certainly a mix/compilation
const VERY_SHORT_DURATION = 30; // 30 sec — a clip, not a song

/** Score a single track: higher is a better "this is the song" match. */
function scoreTrack(track: Track): number {
  let score = 0;

  // Video-type results carry a 16:9 video thumbnail (not album art) and are
  // more often live performances, lyric videos, or reuploads than a clean
  // studio track — see the thumbnail-quality investigation.
  if (track.isVideo) score -= 50;

  const d = track.duration;
  if (d === 0) {
    score -= 5; // provider didn't report a duration at all
  } else if (d < VERY_SHORT_DURATION) {
    score -= 20;
  } else if (d > VERY_LONG_DURATION) {
    score -= 30;
  } else if (d >= MIN_NORMAL_DURATION && d <= MAX_NORMAL_DURATION) {
    score += 10;
  }

  const title = track.title ?? '';
  for (const pattern of JUNK_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      score -= 15;
      break; // one match is enough signal; don't stack unrelated patterns
    }
  }

  return score;
}

/**
 * Demotes low-quality results without removing them. Use for search, and
 * for any list where a specific song might otherwise go missing.
 *
 * Stable: equal-scoring tracks keep their original relative order, so a
 * flat/all-zero score list (e.g. every result already clean) is unchanged.
 */
export function rankTracks(tracks: Track[]): Track[] {
  return tracks
    .map((track, index) => ({ track, index, score: scoreTrack(track) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.track);
}

/**
 * Hard filter for app-curated sections (Home's Trending / Made For You /
 * Quick Picks etc.) where a cropped 16:9 thumbnail would look broken and
 * the user has no specific song in mind to miss if one drops out.
 *
 * Never use this on search results or on the user's own history/liked
 * list — those must never silently drop a track the user asked for or
 * actually played. Use rankTracks there instead.
 */
export function squareArtOnly(tracks: Track[]): Track[] {
  return tracks.filter((t) => !t.isVideo);
}
