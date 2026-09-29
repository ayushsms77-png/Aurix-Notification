import { RepeatMode, Track } from '../core/types';

export type QueueSnapshot = {
  /** Tracks in their original (unshuffled) order. */
  tracks: Track[];
  /** Index into `tracks` of the item currently playing, or -1. */
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Where this queue came from, shown as "PLAYING FROM" in Now Playing. */
  context: string;
  /** Exact play order (track ids). Optional: older snapshots don't have it. */
  order?: string[];
  /** Unshuffled play order (track ids), restored when shuffle is turned off. */
  natural?: string[];
  /** Ids already played in the current pass; used so shuffle doesn't repeat them. */
  visited?: string[];
};

export const EMPTY_QUEUE: QueueSnapshot = {
  tracks: [],
  index: -1,
  shuffle: false,
  repeat: 'off',
  context: '',
};

/**
 * The real queue behind the UI.
 *
 * Shuffle is modelled as a separate play order over the same array rather
 * than by mutating it, so toggling shuffle off restores the true order and
 * never loses or duplicates a track.
 */
export class Queue {
  private tracks: Track[] = [];
  private order: number[] = []; // play order, as indices into `tracks`
  /**
   * The order tracks play in with shuffle OFF. While shuffle is off this is
   * always identical to `order`; while it is on, it is kept aside so turning
   * shuffle off restores the queue exactly (including tracks added or moved
   * with "play next" in the meantime).
   */
  private natural: number[] = [];
  /** Track ids that have played in the current pass. Shuffle never re-queues these. */
  private visited = new Set<string>();
  /** Pre-computed order for the next pass (repeat-all wrap), so peekNext() and next() agree. */
  private wrapOrder: number[] | null = null;
  private position = -1; // index into `order`
  private shuffleOn = false;
  private repeatMode: RepeatMode = 'off';
  private contextLabel = '';

  // ---- reads ------------------------------------------------------------

  get items(): Track[] {
    return [...this.tracks];
  }

  /** Upcoming tracks in the order they will actually play. */
  get upcoming(): Track[] {
    return this.order.slice(this.position + 1).map((i) => this.tracks[i]);
  }

  get current(): Track | null {
    const i = this.order[this.position];
    return i === undefined ? null : (this.tracks[i] ?? null);
  }

  get currentIndex(): number {
    return this.order[this.position] ?? -1;
  }

  get length(): number {
    return this.tracks.length;
  }

  get shuffle(): boolean {
    return this.shuffleOn;
  }

  get repeat(): RepeatMode {
    return this.repeatMode;
  }

  get context(): string {
    return this.contextLabel;
  }

  /** True when advancing would run off the end (and repeat is off). */
  get hasNext(): boolean {
    if (!this.tracks.length) return false;
    if (this.repeatMode !== 'off') return true;
    return this.position < this.order.length - 1;
  }

  get hasPrevious(): boolean {
    return this.tracks.length > 0;
  }

  snapshot(): QueueSnapshot {
    const ids = (arr: number[]) => arr.map((i) => this.tracks[i].id);
    return {
      tracks: this.items,
      index: this.currentIndex,
      shuffle: this.shuffleOn,
      repeat: this.repeatMode,
      context: this.contextLabel,
      order: ids(this.order),
      natural: ids(this.natural),
      visited: [...this.visited],
    };
  }

  restore(snapshot: QueueSnapshot): void {
    this.tracks = [...(snapshot.tracks ?? [])];
    this.shuffleOn = snapshot.shuffle ?? false;
    this.repeatMode = snapshot.repeat ?? 'off';
    this.contextLabel = snapshot.context ?? '';
    this.wrapOrder = null;

    const startAt = snapshot.index ?? -1;
    const byId = new Map(this.tracks.map((t, i) => [t.id, i]));
    const fromIds = (ids?: string[]): number[] | null => {
      if (!ids || ids.length !== this.tracks.length) return null;
      const out = ids.map((id) => byId.get(id));
      if (out.some((i) => i === undefined) || new Set(out).size !== out.length) return null;
      return out as number[];
    };

    // Prefer the exact saved orders so a restart doesn't re-roll the shuffle.
    const natural = fromIds(snapshot.natural);
    const order = fromIds(snapshot.order);
    this.natural = natural ?? this.tracks.map((_, i) => i);
    if (order) {
      this.order = order;
    } else {
      this.rebuildOrder(startAt >= 0 ? startAt : undefined);
    }
    this.position = startAt >= 0 ? this.order.indexOf(startAt) : -1;
    this.visited = new Set((snapshot.visited ?? []).filter((id) => byId.has(id)));
    this.markVisited();
  }

  // ---- writes -----------------------------------------------------------

  /** Replace the whole queue and start at `startIndex`. */
  setTracks(tracks: Track[], startIndex = 0, context = ''): void {
    this.tracks = dedupe(tracks);
    this.contextLabel = context;
    // A de-dupe may have shifted the intended start.
    const target = tracks[startIndex];
    const resolvedStart = target
      ? Math.max(0, this.tracks.findIndex((t) => t.id === target.id))
      : 0;
    this.natural = this.tracks.map((_, i) => i);
    this.rebuildOrder(resolvedStart);
    this.position = this.order.indexOf(resolvedStart);
    if (this.position < 0) this.position = this.tracks.length ? 0 : -1;
    this.wrapOrder = null;
    this.visited = new Set();
    this.markVisited();
  }

  /** Append to the end of the queue. */
  add(tracks: Track | Track[]): void {
    const incoming = Array.isArray(tracks) ? tracks : [tracks];
    const existing = new Set(this.tracks.map((t) => t.id));
    const fresh = incoming.filter((t) => !existing.has(t.id));
    if (!fresh.length) return;
    const firstNew = this.tracks.length;
    this.tracks.push(...fresh);
    // Appended tracks go at the end of the play order, shuffled or not.
    for (let i = 0; i < fresh.length; i++) {
      this.order.push(firstNew + i);
      this.natural.push(firstNew + i);
    }
    this.wrapOrder = null;
    if (this.position < 0 && this.order.length) {
      this.position = 0;
      this.markVisited();
    }
  }

  /** Insert directly after the current track. */
  playNext(tracks: Track | Track[]): void {
    const currentId = this.current?.id;
    // Never duplicate the track that is already playing.
    const incoming = (Array.isArray(tracks) ? tracks : [tracks]).filter((t) => t.id !== currentId);
    if (!incoming.length) return;
    // Remove any existing copies so "play next" actually moves them.
    for (const t of incoming) this.remove(t.id, { keepCurrent: true });
    const firstNew = this.tracks.length;
    this.tracks.push(...incoming);
    const newIdx = incoming.map((_, i) => firstNew + i);
    this.order.splice(this.position + 1, 0, ...newIdx);
    // Same place in the unshuffled order, so turning shuffle off keeps it.
    const curNatural = this.natural.indexOf(this.currentIndex);
    this.natural.splice(curNatural >= 0 ? curNatural + 1 : this.natural.length, 0, ...newIdx);
    this.wrapOrder = null;
    if (this.position < 0 && this.order.length) {
      this.position = 0;
      this.markVisited();
    }
  }

  /** Remove a track by id. Returns true if the current track was removed. */
  remove(trackId: string, opts: { keepCurrent?: boolean } = {}): boolean {
    const trackIndex = this.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex < 0) return false;
    const wasCurrent = this.currentIndex === trackIndex;
    if (wasCurrent && opts.keepCurrent) return false;
    const orderPos = this.order.indexOf(trackIndex);
    this.tracks.splice(trackIndex, 1);
    this.order.splice(orderPos, 1);
    this.natural = this.natural.filter((i) => i !== trackIndex);
    // Every index after the removed one shifts down by one.
    const shift = (i: number) => (i > trackIndex ? i - 1 : i);
    this.order = this.order.map(shift);
    this.natural = this.natural.map(shift);
    this.wrapOrder = null;
    if (orderPos < this.position) {
      this.position -= 1;
    } else if (orderPos === this.position) {
      // Stay at the same slot so the next track takes its place.
      this.position = Math.min(this.position, this.order.length - 1);
    }
    if (!this.order.length) this.position = -1;
    // The track that slid into the current slot is now the one playing.
    if (wasCurrent) this.markVisited();
    return wasCurrent;
  }

  /** Move a track within the visible (play) order. */
  reorder(from: number, to: number): void {
    if (from === to) return;
    if (from < 0 || from >= this.order.length) return;
    const clampedTo = Math.max(0, Math.min(to, this.order.length - 1));
    const currentOrderValue = this.order[this.position];
    const [moved] = this.order.splice(from, 1);
    this.order.splice(clampedTo, 0, moved);
    // Keep pointing at the same track after the move.
    this.position = this.order.indexOf(currentOrderValue);
    this.wrapOrder = null;
    this.syncNatural();
  }

  /**
   * Replace the upcoming portion of the play order with the exact id order
   * given (used by the drag-to-reorder queue sheet). History and the
   * currently playing track are left completely untouched.
   */
  reorderUpcoming(ids: string[]): void {
    const provided = ids
      .map((id) => this.tracks.findIndex((t) => t.id === id))
      .filter((i) => i >= 0);
    const providedSet = new Set(provided);

    // Safety: never silently drop an upcoming track the caller forgot.
    const previousUpcoming = this.order.slice(Math.max(0, this.position + 1));
    const missing = previousUpcoming.filter((i) => !providedSet.has(i));

    if (this.position < 0) {
      // Nothing playing: the given order simply becomes the play order.
      this.order = [...provided, ...missing];
      this.wrapOrder = null;
      this.syncNatural();
      return;
    }

    // Keep history + current exactly where they are, then the new order.
    const historyAndCurrent = this.order.slice(0, this.position + 1);
    this.order = [...historyAndCurrent, ...provided, ...missing];
    this.wrapOrder = null;
    this.syncNatural();
  }

  clear(): void {
    this.tracks = [];
    this.order = [];
    this.natural = [];
    this.visited = new Set();
    this.wrapOrder = null;
    this.position = -1;
    this.contextLabel = '';
  }

  /** Clear everything except the track currently playing. */
  clearUpcoming(): void {
    const current = this.current;
    if (!current) {
      this.clear();
      return;
    }
    this.tracks = [current];
    this.order = [0];
    this.natural = [0];
    this.visited = new Set([current.id]);
    this.wrapOrder = null;
    this.position = 0;
  }

  /**
   * Turn shuffle on/off without ever interrupting the current track.
   *
   * ON:  history (tracks already played this pass) and the current track stay
   *      exactly where they are; every track NOT yet played is shuffled into
   *      the upcoming part. If everything has been played, a fresh pass
   *      starts with all the other tracks shuffled.
   * OFF: the original (unshuffled) order comes back and playback continues
   *      from the current track's place in it.
   */
  setShuffle(on: boolean): void {
    if (this.shuffleOn === on) return;
    this.shuffleOn = on;
    this.wrapOrder = null;
    const cur = this.currentIndex;

    if (!on) {
      this.order = [...this.natural];
      this.position = cur >= 0 ? this.order.indexOf(cur) : -1;
      return;
    }

    const all = this.tracks.map((_, i) => i);
    if (cur < 0) {
      this.order = shuffled(all);
      this.position = -1;
      return;
    }

    let prefix = this.order
      .slice(0, this.position)
      .filter((i) => this.visited.has(this.tracks[i].id));
    let rest = all.filter((i) => i !== cur && !prefix.includes(i));
    if (!rest.length && prefix.length) {
      // Everything has already played: start a new pass.
      rest = prefix;
      prefix = [];
      this.visited = new Set([this.tracks[cur].id]);
    }
    this.order = [...prefix, cur, ...shuffled(rest)];
    this.position = prefix.length;
  }

  toggleShuffle(): boolean {
    this.setShuffle(!this.shuffleOn);
    return this.shuffleOn;
  }

  /**
   * Re-roll the upcoming order while shuffle is on. History and the current
   * track are untouched, and the result is guaranteed to differ from what was
   * queued (in particular the very next track changes) whenever at least two
   * tracks are upcoming. Returns false if there was nothing to reshuffle.
   */
  reshuffle(): boolean {
    if (!this.shuffleOn) return false;
    const head = this.order.slice(0, this.position + 1);
    const tail = this.order.slice(this.position + 1);
    if (tail.length < 2) return false;
    const next = shuffled(tail);
    if (next[0] === tail[0]) {
      const swapWith = 1 + Math.floor(Math.random() * (next.length - 1));
      [next[0], next[swapWith]] = [next[swapWith], next[0]];
    }
    this.order = [...head, ...next];
    this.wrapOrder = null;
    return true;
  }

  setRepeat(mode: RepeatMode): void {
    this.repeatMode = mode;
    this.wrapOrder = null;
  }

  cycleRepeat(): RepeatMode {
    this.setRepeat(this.repeatMode === 'off' ? 'all' : this.repeatMode === 'all' ? 'one' : 'off');
    return this.repeatMode;
  }

  // ---- navigation -------------------------------------------------------

  /**
   * Advance to the next track.
   * `auto` distinguishes a track finishing on its own (where repeat-one
   * replays the same track) from the user pressing next (where it does not).
   */
  next(auto = false): Track | null {
    if (!this.tracks.length) return null;
    if (auto && this.repeatMode === 'one') return this.current;
    if (this.position < this.order.length - 1) {
      this.position += 1;
      this.markVisited();
      return this.current;
    }
    if (this.repeatMode === 'all' || (this.repeatMode === 'one' && !auto)) {
      this.wrap();
      return this.current;
    }
    return null; // end of queue
  }

  previous(): Track | null {
    if (!this.tracks.length) return null;
    if (this.position > 0) {
      this.position -= 1;
      return this.current;
    }
    if (this.repeatMode === 'all') {
      this.position = this.order.length - 1;
      return this.current;
    }
    return this.current; // already first: restart it
  }

  /** Jump to a specific track by id. */
  jumpTo(trackId: string): Track | null {
    const trackIndex = this.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex < 0) return null;
    const orderPos = this.order.indexOf(trackIndex);
    if (orderPos < 0) return null;
    this.position = orderPos;
    this.markVisited();
    return this.current;
  }

  /**
   * Peek at what next(false) would return, without moving. This is what gets
   * pre-queued in the native player, so it must always agree with next().
   */
  peekNext(): Track | null {
    if (!this.tracks.length) return null;
    if (this.position < this.order.length - 1) {
      return this.tracks[this.order[this.position + 1]] ?? null;
    }
    if (this.repeatMode === 'off') return null;
    return this.tracks[this.peekWrapOrder()[0]] ?? null;
  }

  // ---- internals --------------------------------------------------------

  /**
   * Rebuild the play order. When shuffling, `pinFirst` is placed at the head
   * so toggling shuffle never interrupts the track already playing.
   */
  private rebuildOrder(pinFirst?: number): void {
    if (!this.shuffleOn) {
      this.order = [...this.natural];
      return;
    }
    const indices = this.tracks.map((_, i) => i);
    const rest = pinFirst === undefined ? indices : indices.filter((i) => i !== pinFirst);
    const mixed = shuffled(rest);
    this.order = pinFirst === undefined ? mixed : [pinFirst, ...mixed];
  }

  /** While shuffle is off the play order IS the natural order. */
  private syncNatural(): void {
    if (!this.shuffleOn) this.natural = [...this.order];
  }

  private markVisited(): void {
    const c = this.current;
    if (c) this.visited.add(c.id);
  }

  /** Order for the next pass. Cached so peekNext() and next() agree. */
  private peekWrapOrder(): number[] {
    if (this.wrapOrder) return this.wrapOrder;
    if (!this.shuffleOn) {
      this.wrapOrder = [...this.natural];
      return this.wrapOrder;
    }
    const lastPlayed = this.order[this.order.length - 1];
    const mixed = shuffled(this.tracks.map((_, i) => i));
    // Don't start the new pass with the track that just finished.
    if (mixed.length > 1 && mixed[0] === lastPlayed) {
      const swapWith = 1 + Math.floor(Math.random() * (mixed.length - 1));
      [mixed[0], mixed[swapWith]] = [mixed[swapWith], mixed[0]];
    }
    this.wrapOrder = mixed;
    return this.wrapOrder;
  }

  private wrap(): void {
    this.order = this.peekWrapOrder();
    this.wrapOrder = null;
    this.position = 0;
    this.visited = new Set();
    this.markVisited();
  }
}

/** Fisher-Yates on a copy. */
function shuffled(items: number[]): number[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
