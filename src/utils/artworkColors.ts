import { decode as decodeJpeg } from 'jpeg-js';

export type ArtworkPalette = {
  /** Most frequent colour family in the artwork. */
  dominant: string;
  /** Most saturated prominent colour — used for the Apple-style wash. */
  vibrant: string;
};

const CACHE_MAX = 40;
const cache = new Map<string, ArtworkPalette | null>();
const inflight = new Map<string, Promise<ArtworkPalette | null>>();

const hex2 = (n: number) => n.toString(16).padStart(2, '0');
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** Bucket-sample the pixels: dominant = most common family, vibrant = most saturated prominent family. */
function paletteFromRGBA(px: Uint8Array): ArtworkPalette {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const total = px.length / 4;
  const step = Math.max(1, Math.floor(total / 6000));
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    const r = px[o];
    const g = px[o + 1];
    const b = px[o + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const entry = buckets.get(key);
    if (entry) {
      entry.count++;
      entry.r += r;
      entry.g += g;
      entry.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  let dominantKey = 0;
  let dominantCount = 0;
  let vibrantKey = -1;
  let vibrantScore = -1;

  buckets.forEach((entry, key) => {
    if (entry.count > dominantCount) {
      dominantCount = entry.count;
      dominantKey = key;
    }
    const r = entry.r / entry.count / 255;
    const g = entry.g / entry.count / 255;
    const b = entry.b / entry.count / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const light = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / ((1 - Math.abs(2 * light - 1)) || 1);
    if (entry.count >= 2 && sat > 0.25 && light > 0.12 && light < 0.92) {
      const score = sat * (1 - Math.abs(light - 0.45));
      if (score > vibrantScore) {
        vibrantScore = score;
        vibrantKey = key;
      }
    }
  });

  const center = (key: number, shift: number) => (((key >> shift) & 31) << 3) + 4;
  const vib = vibrantKey >= 0 ? vibrantKey : dominantKey;
  return {
    dominant: toHex(center(dominantKey, 10), center(dominantKey, 5), center(dominantKey, 0)),
    vibrant: toHex(center(vib, 10), center(vib, 5), center(vib, 0)),
  };
}

async function compute(uri: string): Promise<ArtworkPalette | null> {
  try {
    const res = await fetch(uri);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 64) return null;
    const img = decodeJpeg(new Uint8Array(buf), {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 48,
    });
    if (!img || !img.data || img.width < 2) return null;
    return paletteFromRGBA(img.data);
  } catch {
    // WebP / undecodable / offline: caller falls back to the neutral gradient.
    return null;
  }
}

/** Cached, de-duplicated palette lookup. Never throws. */
export function extractArtworkColors(uri: string): Promise<ArtworkPalette | null> {
  if (!uri) return Promise.resolve(null);
  const cached = cache.get(uri);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inflight.get(uri);
  if (pending) return pending;

  const promise = compute(uri).then((palette) => {
    inflight.delete(uri);
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(uri, palette);
    return palette;
  });
  inflight.set(uri, promise);
  return promise;
}
