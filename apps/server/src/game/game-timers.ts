import { Injectable, type OnModuleDestroy } from '@nestjs/common';

/** One pending timer per room. Stale fires are filtered by the engine via the timer token. */
@Injectable()
export class GameTimers implements OnModuleDestroy {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private stopped = false;

  set(
    code: string,
    timer: { token: string; firesAt: number } | null,
    fire: (token: string) => void,
  ): void {
    clearTimeout(this.timers.get(code));
    this.timers.delete(code);
    if (!timer || this.stopped) return;
    this.timers.set(
      code,
      setTimeout(
        () => {
          this.timers.delete(code);
          fire(timer.token);
        },
        Math.max(0, timer.firesAt - Date.now()),
      ),
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
