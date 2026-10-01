import { Inject, Injectable } from '@nestjs/common';
import { ServerEvent, type SessionErrorCode } from '@loudroom/shared';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { AppServer } from '../realtime/socket-types.js';
import { channels } from './room.channels.js';
import type { RoomSnapshot, StoredPlayer } from './room.store.js';
import { hostView, playerView, toPublicPlayer } from './room.views.js';

const SESSION_ERROR_MESSAGES: Record<SessionErrorCode, string> = {
  KICKED: 'Removed from the room by the host',
  SESSION_REPLACED: 'This session was opened somewhere else',
  SESSION_EXPIRED: 'The session no longer exists',
};

/** Sends room events. Host and players get different projections of the same state. */
@Injectable()
export class RoomBroadcaster {
  private server: AppServer | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  bind(server: AppServer): void {
    this.server = server;
  }

  private get io(): AppServer {
    if (!this.server) throw new Error('RoomBroadcaster used before the Socket.IO server started');
    return this.server;
  }

  state(snapshot: RoomSnapshot): void {
    const { code } = snapshot.room;
    this.io
      .to(channels.host(code))
      .emit(ServerEvent.RoomState, hostView(snapshot, this.config.publicUrl));
    this.io.to(channels.players(code)).emit(ServerEvent.RoomState, playerView(snapshot));
  }

  playerJoined(code: string, player: StoredPlayer): void {
    this.io
      .to([channels.host(code), channels.players(code)])
      .emit(ServerEvent.PlayerJoined, { player: toPublicPlayer(player) });
  }

  playerLeft(code: string, player: StoredPlayer, reason: 'left' | 'kicked' | 'timeout'): void {
    this.io
      .to([channels.host(code), channels.players(code)])
      .emit(ServerEvent.PlayerLeft, { playerId: player.id, nickname: player.nickname, reason });
  }

  playerReconnected(code: string, playerId: string): void {
    this.io
      .to([channels.host(code), channels.players(code)])
      .emit(ServerEvent.PlayerReconnected, { playerId });
  }

  /** Tells one connection why its session ended. */
  sessionError(socketId: string, code: SessionErrorCode): void {
    this.io.to(socketId).emit(ServerEvent.Error, { code, message: SESSION_ERROR_MESSAGES[code] });
  }

  /**
   * Ends every connection in `channel` except `keepSocketId`: explains why, then disconnects
   * them. With the Redis adapter the disconnect is applied asynchronously (it goes through
   * pub/sub), so a connection that should survive must be excluded explicitly.
   */
  endSessions(channel: string, code: SessionErrorCode, keepSocketId?: string): void {
    const except = keepSocketId ? [keepSocketId] : [];
    this.io
      .to(channel)
      .except(except)
      .emit(ServerEvent.Error, { code, message: SESSION_ERROR_MESSAGES[code] });
    this.io.in(channel).except(except).disconnectSockets(true);
  }

  async hasConnections(channel: string): Promise<boolean> {
    return (await this.io.in(channel).fetchSockets()).length > 0;
  }
}
