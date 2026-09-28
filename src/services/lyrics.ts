// Ported from Aurix's src/services/lyrics.js. Fetch works directly on
// React Native (no CORS layer to fight, unlike the browser), so this is a
// straight logic port — no network-security-config changes needed.

const BASE = 'https://lrclib.net/api';

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsResult {
  synced: LyricLine[] | null;
  plain: string[] | null;
}

/** Parses standard LRC format: [mm:ss.xx]Lyric text */
function parseLRC(lrcText: string): LyricLine[] {
  const lines = lrcText.split('\n');
  const timeTag = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
  const out: LyricLine[] = [];

  for (const line of lines) {
    const matches = [...line.matchAll(timeTag)];
    if (matches.length === 0) continue;
    const text = line.replace(timeTag, '').trim();
    for (const m of matches) {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const frac = parseInt(m[3].padEnd(3, '0'), 10) / 1000;
      out.push({ time: minutes * 60 + seconds + frac, text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

interface FetchLyricsArgs {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
}

/**
 * Returns { synced: null, plain: null } if nothing is found — callers must
 * handle that (show a "no lyrics available" state), never assume success.
 */
export async function fetchLyrics({ title, artist, album, duration }: FetchLyricsArgs): Promise<LyricsResult> {
  try {
    const params = new URLSearchParams({
      track_name: title || '',
      artist_name: artist || '',
    });
    if (album) params.set('album_name', album);
    if (duration) params.set('duration', String(Math.round(duration)));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${BASE}/get?${params.toString()}`, { 
  signal: controller.signal,
  headers: { 'User-Agent': 'Aurix 2.0' }
});
    clearTimeout(timeout);

    if (!res.ok) {
      // lrclib returns 404 when there's genuinely no match — not an error to surface.
      if (res.status === 404) return { synced: null, plain: null };
      throw new Error(`lrclib ${res.status}`);
    }

    const data = await res.json();
    const synced = data.syncedLyrics ? parseLRC(data.syncedLyrics) : null;
    const plain: string[] | null = data.plainLyrics
      ? data.plainLyrics.split('\n').filter((l: string) => l.trim())
      : null;
    return { synced: synced?.length ? synced : null, plain };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { synced: null, plain: null };
    return { synced: null, plain: null };
  }
}
