import { Platform } from 'react-native';
import TrackPlayer, {
  Event,
  PlaybackState,
  PlayerCommand,
} from '@rntp/player';
import { appError, toAppError } from '../core/errors';
import { ResolvedStream, Track } from '../core/types';

export type PlaybackStatus = {
  isPlaying: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  /** Seconds. */
  position: number;
  /** Seconds; 0 until the source reports one. */
  duration: number;
  volume: number;
};

export const IDLE_STATUS: PlaybackStatus = {
  isPlaying: false,
  isBuffering: false,
  isLoaded: false,
  position: 0,
  duration: 0,
  volume: 1,
};

type EngineEvents = {
  onStatus: (status: PlaybackStatus) => void;
  /** The current track played through to its end. */
  onComplete: () => void;
  /** Playback failed for the loaded track. */
  onError: (error: unknown) => void;
  /**
   * The OS-level skip-next / skip-previous control was pressed (lock
   * screen, notification, Bluetooth/AVRCP, Android Auto). Configured below
   * (see setCommands) with handling: 'hybrid' and Next/Previous specifically
   * routed to JS. IMPORTANT, corrected after real-device testing: this does
   * NOT reliably mean "RNTP will wait for the app to decide what happens
   * next." Once queueNext() has put a real second item in RNTP's own
   * queue, RNTP can and does advance to it on its own — audio and
   * notification metadata update correctly immediately, but nothing tells
   * the app's JS state that happened unless something is listening for it.
   * That "something" is onActiveTrackChanged below, not this callback —
   * this one still exists for the case where nothing is queued yet and the
   * app must resolve a track from scratch.
   */
  onRemoteNext: () => void;
  onRemotePrevious: () => void;
  /**
   * RNTP's own active queue item changed to a genuinely different track,
   * for ANY reason: it auto-continued into a track queueNext() had already
   * placed after the current one, a remote button press it decided to
   * handle itself, or anything else outside the app's own load() call.
   * This is the real fix for the "notification shows the new song, but the
   * app's title/artist stay on the old one" bug — the app must treat RNTP's
   * own queue as ground truth for *which track is actually playing*, not
   * assume it only changes when the app itself calls load().
   */
  onActiveTrackChanged: (mediaId: string) => void;
};

/**
 * Wraps react-native-track-player v5 (@rntp/player) behind the SAME small
 * imperative interface PlaybackEngine has always exposed to the rest of the
 * app — usePlayer.tsx does not need to change ITS PUBLIC API for this
 * migration, but it DOES need to listen for onActiveTrackChanged now (see
 * that event's doc) instead of assuming only load() ever changes what's
 * playing. queueNext() puts a real second item in RNTP's queue so the
 * lock-screen Next button works and shows correctly — but a real queue
 * means RNTP can genuinely move through it on its own, and the app has to
 * follow along rather than assume it is always the one deciding.
 */
export class PlaybackEngine {
  private listeners: Partial<EngineEvents> = {};

  private status: PlaybackStatus = { ...IDLE_STATUS };
  private currentTrackId: string | null = null;
  private desiredVolume = 1;

  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private loadToken = 0;
  private completionFired = false;

  private configured = false;

  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private eventSubs: { remove: () => void }[] = [];

  on<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): void {
    this.listeners[event] = handler;
  }

  getStatus(): PlaybackStatus {
    return this.status;
  }

  /** Set up the player once. Safe to call repeatedly. Fully synchronous. */
  configure(): void {
    if (this.configured) return;

    TrackPlayer.setupPlayer({
      contentType: 'music',
      handleAudioBecomingNoisy: true,
    });

    // handling: 'hybrid' keeps Play/Pause/Seek on RNTP's reliable native
    // path (works with Android Auto, Bluetooth, etc. with zero JS), while
    // routing Next/Previous to our own onRemoteNext/onRemotePrevious —
    // required because our queue is still external to RNTP (see class doc).
    TrackPlayer.setCommands({
      capabilities: [
        PlayerCommand.PlayPause,
        PlayerCommand.Next,
        PlayerCommand.Previous,
        PlayerCommand.Seek,
      ],
      handling: 'hybrid',
      perCommandHandling: {
        [PlayerCommand.Next]: 'js',
        [PlayerCommand.Previous]: 'js',
      },
    });

    this.attachEventListeners();
    this.startProgressPolling();
    this.configured = true;
  }

  private attachEventListeners(): void {
    this.eventSubs.push(
      TrackPlayer.addEventListener(Event.PlaybackStateChanged, ({ state }) => {
        this.handlePlaybackStateChanged(state);
      })
    );

    this.eventSubs.push(
      TrackPlayer.addEventListener(Event.IsPlayingChanged, ({ playing }) => {
        this.status = { ...this.status, isPlaying: playing };
        this.listeners.onStatus?.(this.status);
      })
    );

    this.eventSubs.push(
      TrackPlayer.addEventListener(Event.PlaybackError, ({ message }) => {
        this.clearLoadTimer();
        this.listeners.onError?.(appError('playback_failed', message));
      })
    );

    this.eventSubs.push(
      TrackPlayer.addEventListener(Event.RemoteNext, () => {
        this.listeners.onRemoteNext?.();
      })
    );

    this.eventSubs.push(
      TrackPlayer.addEventListener(Event.RemotePrevious, () => {
        this.listeners.onRemotePrevious?.();
      })
    );

    // PATCH: this is the real fix for "notification shows the new song but
    // the app still shows the old one." MediaItemTransition fires whenever
    // RNTP's actual active item changes, for ANY reason — including on its
    // own, once queueNext() has put a real track after the current one.
    // load() already sets currentTrackId BEFORE calling setMediaItems(), so
    // a transition caused by our OWN load() reports a mediaId that already
    // matches — no double-handling. Only a transition RNTP made on its own
    // reports something different, which is exactly the case the app needs
    // to be told about.
    this.eventSubs.push(
      TrackPlayer.addEventListener(Event.MediaItemTransition, ({ item }) => {
        if (item?.mediaId && item.mediaId !== this.currentTrackId) {
          this.currentTrackId = item.mediaId;
          this.completionFired = false;
          this.listeners.onActiveTrackChanged?.(item.mediaId);
          return;
        }

        if (!item && !this.completionFired) {
          // The queue genuinely has nothing left after whatever just ended.
          this.completionFired = true;
          this.listeners.onComplete?.();
        }
      })
    );
  }

  /** No per-tick position event in this API — poll on the old 250ms cadence. */
  private startProgressPolling(): void {
    if (this.progressTimer) return;
    this.progressTimer = setInterval(() => {
      try {
        const progress = TrackPlayer.getProgress();
        const duration = Number.isFinite(progress.duration) && progress.duration > 0
          ? progress.duration
          : 0;
        const position = Number.isFinite(progress.position)
          ? Math.max(0, progress.position)
          : 0;

        if (duration > 0 && this.loadTimer) {
          this.clearLoadTimer();
        }

        this.status = { ...this.status, position, duration };
        this.listeners.onStatus?.(this.status);
      } catch {
        /* transient — the queue may be momentarily empty */
      }
    }, 250);
  }

  private handlePlaybackStateChanged(state: PlaybackState): void {
    // PATCH: Ended fires every time ANY track finishes — including one that
    // correctly continues into a queueNext()'d track a moment later. Firing
    // onComplete here unconditionally (as an earlier version of this file
    // did) would wrongly treat a normal, correct continuation as "nothing
    // left to play." The real completion signal is now
    // MediaItemTransition reporting item === null (see attachEventListeners)
    // — this is kept only as a defensive fallback, in case some real-device
    // scenario ends without ever firing that transition, guarded by the
    // same completionFired flag so the two can never double-fire.
    if (state === PlaybackState.Ended && !this.completionFired) {
      try {
        const activeIndex = TrackPlayer.getActiveMediaItemIndex();
        const queueLength = TrackPlayer.getQueue().length;
        const nothingAfterThis = activeIndex === null || activeIndex >= queueLength - 1;
        if (nothingAfterThis) {
          this.completionFired = true;
          this.listeners.onComplete?.();
        }
      } catch {
        /* if this can't be checked, MediaItemTransition remains the source of truth */
      }
    }

    // PlaybackState here is Idle | Ready | Buffering | Ended | Error —
    // "is it playing" is tracked separately via IsPlayingChanged above.
    const isBuffering = state === PlaybackState.Buffering;
    const isLoaded = state === PlaybackState.Ready || state === PlaybackState.Buffering;

    this.status = {
      ...this.status,
      isBuffering,
      isLoaded,
      volume: this.desiredVolume,
    };
    this.listeners.onStatus?.(this.status);
  }

  private clearLoadTimer(): void {
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
  }

  private toMediaItem(track: Track, stream: ResolvedStream) {
    // headers live nested under `url`, not as a sibling field — confirmed
    // against the real MediaItem type, not the library's own docs (which
    // didn't show this at all).
    return {
      mediaId: track.id,
      url: { uri: stream.url, headers: stream.headers },
      title: track.title,
      artist: track.artist.name,
      albumTitle: track.album,
      artworkUrl: track.albumImageUrl || undefined,
    };
  }

  /**
   * Put a real, resolved track into RNTP's queue right after whatever is
   * currently playing — WITHOUT touching current playback.
   *
   * This is the fix for the lock-screen Next button being disabled and
   * Previous just restarting the current track: RNTP renders those controls
   * based on whether a real "next" item genuinely exists in its own native
   * queue, not on which PlayerCommand capabilities were declared. Since
   * load() only ever puts ONE item in that queue, RNTP correctly reported
   * "no next" — this appends the second, real one.
   *
   * The *decision* of what track comes next — TasteService recording,
   * related-track extension when the queue is nearly empty, etc. — still
   * lives in usePlayer.tsx exactly as before; this method only ever queues
   * the SAME track that decision already picked (queueRef.peekNext()).
   * IMPORTANT, corrected after real-device testing: once this real item
   * exists, pressing Next (or a natural end-of-track) may be handled by
   * RNTP itself rather than always calling the app's onRemoteNext — see
   * onActiveTrackChanged, which is how the app now finds out either way.
   */
  queueNext(track: Track, stream: ResolvedStream): void {
    if (!this.configured) return;

    try {
      const activeIndex = TrackPlayer.getActiveMediaItemIndex();
      if (activeIndex === null) return; // nothing is currently loaded

      const queue = TrackPlayer.getQueue();
      const nextIndex = activeIndex + 1;
      const item = this.toMediaItem(track, stream);

      if (nextIndex < queue.length) {
        // Something is already queued there — only touch it if it is not
        // already the same track, to avoid an unnecessary reload/flicker.
        if (queue[nextIndex]?.mediaId !== track.id) {
          TrackPlayer.replaceMediaItem(nextIndex, item);
        }
      } else {
        TrackPlayer.insertMediaItem(nextIndex, item);
      }
    } catch {
      // Best-effort: worst case the Next button stays as it was: still
      // functional via onRemoteNext, just possibly shown disabled.
    }
  }

  /** Load a resolved stream and begin playing it. */
  async load(
    track: Track,
    stream: ResolvedStream,
    options: { autoPlay?: boolean; startPosition?: number } = {}
  ): Promise<void> {
    const { autoPlay = true, startPosition = 0 } = options;
    const token = ++this.loadToken;

    try {
      this.configure();

      this.currentTrackId = track.id;
      this.completionFired = false;

      this.status = { ...IDLE_STATUS, isBuffering: true, volume: this.desiredVolume };
      this.listeners.onStatus?.(this.status);

      // setMediaItems() replaces the whole queue with this one track. This
      // also implicitly clears any track queueNext() had appended for the
      // PREVIOUS current track — starting a fresh load() always means a
      // fresh, correct queue, never a stale leftover "next" item.
      TrackPlayer.setMediaItems([this.toMediaItem(track, stream)]);
      TrackPlayer.setVolume(this.desiredVolume);

      // If the source never loads, surface a real error instead of hanging.
      this.clearLoadTimer();
      this.loadTimer = setTimeout(() => {
        if (token !== this.loadToken) return;
        if (this.status.isLoaded) return;
        this.listeners.onError?.(appError('playback_failed', 'Stream did not start'));
      }, 20_000);

      if (startPosition > 0) {
        try {
          TrackPlayer.seekTo(startPosition);
        } catch {
          // Seeking before the source is ready is not fatal.
        }
      }

      if (autoPlay) {
        TrackPlayer.play();
      }
    } catch (e) {
      this.clearLoadTimer();
      throw toAppError(e, 'playback_failed');
    }
  }

  play(): void {
    try {
      TrackPlayer.play();
    } catch (e) {
      this.listeners.onError?.(toAppError(e, 'playback_failed'));
    }
  }

  pause(): void {
    try {
      TrackPlayer.pause();
    } catch {
      /* pausing a released player is harmless */
    }
  }

  async seekTo(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds)) return;

    const duration = this.status.duration;
    const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);

    try {
      this.completionFired = false;
      TrackPlayer.seekTo(target);

      this.status = { ...this.status, position: target };
      this.listeners.onStatus?.(this.status);
    } catch (e) {
      this.listeners.onError?.(toAppError(e, 'playback_failed'));
    }
  }

  setVolume(volume: number): void {
    this.desiredVolume = Math.max(0, Math.min(1, volume));
    if (this.configured) {
      try {
        TrackPlayer.setVolume(this.desiredVolume);
      } catch {
        /* best effort */
      }
    }

    this.status = { ...this.status, volume: this.desiredVolume };
    this.listeners.onStatus?.(this.status);
  }

  getVolume(): number {
    return this.desiredVolume;
  }

  /** Stop and unload, returning the engine to idle. */
  stop(): void {
    this.clearLoadTimer();
    this.loadToken++;
    this.currentTrackId = null;
    this.completionFired = false;

    try {
      TrackPlayer.stop();
    } catch {
      /* already torn down */
    }

    this.status = { ...IDLE_STATUS, volume: this.desiredVolume };
    this.listeners.onStatus?.(this.status);
  }

  get trackId(): string | null {
    return this.currentTrackId;
  }

  async release(): Promise<void> {
    if (Platform.OS === 'web') return;

    this.clearLoadTimer();

    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }

    for (const sub of this.eventSubs) {
      sub.remove();
    }
    this.eventSubs = [];

    this.configured = false;

    try {
      TrackPlayer.stop();
    } catch {
      /* best effort */
    }
  }
}

export const playbackEngine = new PlaybackEngine();
