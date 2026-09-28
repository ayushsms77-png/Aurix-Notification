import { Directory, File, Paths } from 'expo-file-system';
import { readJson, writeJson, STORAGE_KEYS } from '../core/storage';
import { Track } from '../core/types';
import { localFileSource } from '../providers/stream/StreamResolver';
import { MusicService } from './MusicService';

export type DownloadRecord = {
  track: Track;
  localUri: string;
  downloadedAt: number;
};

/** A place to store files that are safe from being deleted by the system. */
const downloadsDir = new Directory(Paths.document, 'downloads');

/** provider+sourceId is stable and filesystem-safe (ids are [A-Za-z0-9_-]). */
function fileNameFor(track: Track): string {
  return `${track.provider}-${track.sourceId}.m4a`;
}

/**
 * Resolved stream URLs are host-bound and expire; persisting one would mean
 * restoring a downloaded track with a dead audioUrl baked in. Mirrors
 * LibraryService's stripStream.
 */
function stripStream(track: Track): Track {
  if (!track.audioUrl) return track;
  const { audioUrl, ...rest } = track;
  return rest;
}

/**
 * Offline downloads: saves a track's resolved audio to device storage and
 * feeds StreamResolver's localFileSource so playback prefers it over the
 * network. No backend involved -- this is local-only, like the rest of the
 * app's library data.
 */
class DownloadServiceImpl {
  private records = new Map<string, DownloadRecord>(); // trackId -> record
  /** 0..1 while a download is in flight; absent once done, failed, or never started. */
  private progress = new Map<string, number>();

  private changeListeners = new Set<() => void>();

  /** Shared in-flight load, same reasoning as LibraryService.loadPromise. */
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.performLoad();
    return this.loadPromise;
  }

  private async performLoad(): Promise<void> {
    downloadsDir.create({ idempotent: true, intermediates: true });

    const stored = await readJson<DownloadRecord[]>(STORAGE_KEYS.downloads, []);
    const list = Array.isArray(stored) ? stored : [];

    // A file can vanish if the user clears app storage or the OS reclaims
    // space -- don't advertise (or try to play) a download that no longer
    // exists on disk.
    const valid = list.filter((record) => new File(record.localUri).exists);

    this.records = new Map(valid.map((r) => [r.track.id, r]));
    for (const r of valid) localFileSource.register(r.track.id, r.localUri);

    if (valid.length !== list.length) this.persist();
  }

  /** Subscribe to changes (download started/progressed/finished/removed). */
  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyChanged(): void {
    for (const listener of this.changeListeners) listener();
  }

  getDownloaded(): Track[] {
    return [...this.records.values()]
      .sort((a, b) => b.downloadedAt - a.downloadedAt)
      .map((r) => r.track);
  }

  isDownloaded(trackId: string): boolean {
    return this.records.has(trackId);
  }

  isDownloading(trackId: string): boolean {
    return this.progress.has(trackId);
  }

  /** 0..1, or undefined when the track isn't currently downloading. */
  getProgress(trackId: string): number | undefined {
    return this.progress.get(trackId);
  }

  /** Download a track for offline playback. Resolves once the file is saved. */
  async startDownload(track: Track): Promise<void> {
    if (this.records.has(track.id) || this.progress.has(track.id)) return;

    this.progress.set(track.id, 0);
    this.notifyChanged();

    try {
      const stream = await MusicService.resolveStream(track);
      const destination = new File(downloadsDir, fileNameFor(track));

      // A previous attempt may have left a partial file behind (e.g. the
      // app was killed mid-download); it has no record, so it's dead weight.
      if (destination.exists) destination.delete();

      const task = File.createDownloadTask(stream.url, destination, {
        onProgress: ({ bytesWritten, totalBytes }) => {
          if (totalBytes > 0) {
            this.progress.set(track.id, bytesWritten / totalBytes);
            this.notifyChanged();
          }
        },
      });

      const downloaded = await task.downloadAsync();
      if (!downloaded || !downloaded.exists) {
        throw new Error('Download did not complete');
      }

      const record: DownloadRecord = {
        track: stripStream(track),
        localUri: downloaded.uri,
        downloadedAt: Date.now(),
      };

      this.records.set(track.id, record);
      localFileSource.register(track.id, record.localUri);
      this.persist();
    } finally {
      this.progress.delete(track.id);
      this.notifyChanged();
    }
  }

  async deleteDownload(trackId: string): Promise<void> {
    const record = this.records.get(trackId);
    if (!record) return;

    try {
      new File(record.localUri).delete();
    } catch {
      // Already gone or unreadable -- still drop our record of it below.
    }

    this.records.delete(trackId);
    localFileSource.unregister(trackId);
    this.persist();
    this.notifyChanged();
  }

  private persist(): void {
    void writeJson(STORAGE_KEYS.downloads, [...this.records.values()]);
    this.notifyChanged();
  }
}

export const DownloadService = new DownloadServiceImpl();
