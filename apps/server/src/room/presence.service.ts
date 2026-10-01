import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { RedisService } from '../redis/redis.service.js';
import { RoomBroadcaster } from './room.broadcaster.js';
import { RoomService } from './room.service.js';

const logger = new Logger('Presence');

/**
 * Keeps a disconnected player's slot for the grace period (SPEC §4: 90 s), then frees it.
 * After a restart it puts every stored room back under the same rule.
 */
@Injectable()
export class PresenceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private stopping = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rooms: RoomService,
    private readonly broadcaster: RoomBroadcaster,
    private readonly redis: RedisService,
  ) {}

  /** True once the app is shutting down; disconnects from then on are not real departures. */
  get isStopping(): boolean {
    return this.stopping;
  }

  scheduleExpiry(code: string, playerId: string): void {
    if (this.stopping) return;
    this.cancelExpiry(code, playerId);
    const key = `${code}/${playerId}`;
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.expire(code, playerId);
      }, this.config.playerReconnectGraceMs),
    );
  }

  cancelExpiry(code: string, playerId: string): void {
    const key = `${code}/${playerId}`;
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
  }

  /**
   * Finishes before the server accepts connections, so a quick reconnect cannot be overwritten
   * by recovery. With Redis down the server still starts (and /health says so); recovery then
   * runs as soon as Redis is reachable — nobody can resume a session before that anyway.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.recoverRooms();
  }

  onModuleDestroy(): void {
    this.stopping = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async recoverRooms(): Promise<void> {
    try {
      const codes = await this.rooms.listRoomCodes();
      for (const code of codes) {
        const snapshot = await this.rooms.markEveryoneDisconnected(code);
        for (const player of snapshot?.players ?? []) this.scheduleExpiry(code, player.id);
      }
      if (codes.length > 0) logger.log(`Restored ${codes.length} room(s) awaiting reconnects`);
    } catch (error) {
      if (this.stopping) return;
      logger.warn(
        `Room recovery postponed until Redis is reachable: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.redis.client.once('ready', () => {
        if (!this.stopping) void this.recoverRooms();
      });
    }
  }

  private async expire(code: string, playerId: string): Promise<void> {
    try {
      const change = await this.rooms.expireDisconnectedPlayer(code, playerId);
      if (!change) return;
      this.broadcaster.state(change.snapshot);
      this.broadcaster.playerLeft(code, change.player, 'timeout');
    } catch (error) {
      logger.error(error);
    }
  }
}
