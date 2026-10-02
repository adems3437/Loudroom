import type { StreamUpdate } from '@loudroom/game-sdk/client';
import type { RoundStreamEvent } from '@loudroom/shared';

type Listener = (update: StreamUpdate) => void;

/**
 * Keeps the current round's stream chunks outside React state (they arrive ~20 times a
 * second): renderers subscribe and draw imperatively. A renderer that mounts late gets
 * everything received so far as a reset.
 */
export class StreamHub {
  private roundId: string | null = null;
  private chunks: unknown[] = [];
  private full = false;
  private readonly listeners = new Map<string, Set<Listener>>();

  receive(event: RoundStreamEvent): void {
    if (event.roundId !== this.roundId) {
      this.roundId = event.roundId;
      this.chunks = [];
      this.full = false;
    }
    if (event.reset) this.chunks = [...event.chunks];
    else this.chunks.push(...event.chunks);
    this.full ||= event.full;
    const update: StreamUpdate = { reset: event.reset, chunks: event.chunks, full: this.full };
    for (const listener of this.listeners.get(event.roundId) ?? []) listener(update);
  }

  /**
   * Keeps a chunk this client sent itself, so its own screen can be rebuilt when it mounts
   * again (e.g. after a pause). Listeners are not called: the sender drew it already.
   */
  record(roundId: string, chunk: unknown): void {
    if (roundId !== this.roundId) {
      this.roundId = roundId;
      this.chunks = [];
      this.full = false;
    }
    this.chunks.push(chunk);
  }

  subscribe(roundId: string, listener: Listener): () => void {
    const set = this.listeners.get(roundId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(roundId, set);
    if (this.roundId === roundId) {
      listener({ reset: true, chunks: [...this.chunks], full: this.full });
    }
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(roundId);
    };
  }
}
