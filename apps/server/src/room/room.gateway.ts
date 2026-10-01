import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  ClientCommand,
  handshakeAuthSchema,
  type Ack,
  type CommandResult,
  type ErrorCode,
} from '@loudroom/shared';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { clientAddress, hashClientAddress } from '../rate-limit/client-address.js';
import { RateLimiterService } from '../rate-limit/rate-limiter.service.js';
import { CommandError } from '../realtime/command-error.js';
import { CommandRunner } from '../realtime/command-runner.service.js';
import type { AppServer, AppSocket, Session } from '../realtime/socket-types.js';
import { PresenceService } from './presence.service.js';
import { RoomBroadcaster } from './room.broadcaster.js';
import { channels } from './room.channels.js';
import { RoomService } from './room.service.js';
import { joinUrlFor } from './room.views.js';

const logger = new Logger('RoomGateway');

/**
 * Join failures that tell a guesser something about a room code. They drain the per-IP
 * brute-force bucket; successful joins and token resumes never do.
 */
const COUNTED_JOIN_FAILURES = new Set<ErrorCode>([
  'ROOM_NOT_FOUND',
  'ROOM_LOCKED',
  'ROOM_FULL',
  'NICKNAME_TAKEN',
]);

type Result<C extends ClientCommand> = Promise<Ack<CommandResult<C>>>;

@WebSocketGateway()
export class RoomGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly commands: CommandRunner,
    private readonly rateLimiter: RateLimiterService,
    private readonly rooms: RoomService,
    private readonly broadcaster: RoomBroadcaster,
    private readonly presence: PresenceService,
  ) {}

  afterInit(server: AppServer): void {
    this.broadcaster.bind(server);
    // Runs before a connection is accepted: identify the client and limit connection floods.
    server.use((socket, next) => {
      const ipKey = hashClientAddress(
        clientAddress(socket.handshake, this.config.trustProxy),
        this.config.ipHashSecret,
      );
      const auth = handshakeAuthSchema.safeParse(socket.handshake.auth);
      socket.data = {
        ipKey,
        resumeToken: auth.success ? (auth.data.token ?? null) : null,
        session: null,
      };
      this.rateLimiter.consume('conn', ipKey, this.config.rateLimits.connection).then(
        (allowed) => {
          next(allowed ? undefined : new Error('RATE_LIMITED'));
        },
        (error: unknown) => {
          next(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  /** Resumes the session named by the handshake token (reconnect or page reload). */
  async handleConnection(socket: AppSocket): Promise<void> {
    const token = socket.data.resumeToken;
    if (!token) return;
    const resolved = await this.rooms.resolveToken(token).catch(() => null);
    if (!resolved) {
      this.broadcaster.sessionError(socket.id, 'SESSION_EXPIRED');
      return;
    }
    if (socket.disconnected) return;
    try {
      await this.resume(socket, resolved);
    } catch (error) {
      await this.detach(socket);
      if (!(error instanceof CommandError)) logger.error(error);
      this.broadcaster.sessionError(socket.id, 'SESSION_EXPIRED');
    }
  }

  async handleDisconnect(socket: AppSocket): Promise<void> {
    const session = socket.data.session;
    if (!session || this.presence.isStopping) return;
    try {
      // Another connection took over this session (reload, second tab): nothing changed.
      if (await this.broadcaster.hasConnections(channels.session(session))) return;
      if (session.role === 'host') {
        this.broadcaster.state(await this.rooms.setHostConnected(session.roomCode, false));
      } else {
        const change = await this.rooms.markPlayerDisconnected(session.roomCode, session.playerId);
        this.broadcaster.state(change.snapshot);
        this.presence.scheduleExpiry(session.roomCode, session.playerId);
      }
    } catch (error) {
      // The room or player is already gone; there is nothing left to mark.
      if (!(error instanceof CommandError)) logger.error(error);
    }
  }

  @SubscribeMessage(ClientCommand.RoomCreate)
  create(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Result<typeof ClientCommand.RoomCreate> {
    return this.commands.run(socket, ClientCommand.RoomCreate, payload, async ({ settings }) => {
      assertNoSession(socket);
      const allowed = await this.rateLimiter.consume(
        'room-create',
        socket.data.ipKey,
        this.config.rateLimits.roomCreate,
      );
      if (!allowed) throw new CommandError('RATE_LIMITED', 'Too many rooms created');

      const { snapshot, hostToken } = await this.rooms.createRoom(settings);
      const roomCode = snapshot.room.code;
      await this.attach(socket, { role: 'host', roomCode });
      this.broadcaster.state(snapshot);
      return { roomCode, hostToken, joinUrl: joinUrlFor(this.config.publicUrl, roomCode) };
    });
  }

  @SubscribeMessage(ClientCommand.RoomJoin)
  join(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Result<typeof ClientCommand.RoomJoin> {
    return this.commands.run(socket, ClientCommand.RoomJoin, payload, async (input) => {
      assertNoSession(socket);
      const bucket = this.config.rateLimits.joinFailure;
      if (!(await this.rateLimiter.hasCapacity('join-fail', socket.data.ipKey, bucket))) {
        throw new CommandError('RATE_LIMITED', 'Too many failed attempts');
      }

      let joined;
      try {
        joined = await this.rooms.joinRoom(input);
      } catch (error) {
        if (error instanceof CommandError && COUNTED_JOIN_FAILURES.has(error.code)) {
          await this.rateLimiter.consume('join-fail', socket.data.ipKey, bucket);
        }
        throw error;
      }

      const { snapshot, player, playerToken } = joined;
      await this.attach(socket, { role: 'player', roomCode: input.roomCode, playerId: player.id });
      this.broadcaster.state(snapshot);
      this.broadcaster.playerJoined(input.roomCode, player);
      return { roomCode: input.roomCode, playerId: player.id, playerToken };
    });
  }

  @SubscribeMessage(ClientCommand.RoomLeave)
  leave(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Result<typeof ClientCommand.RoomLeave> {
    return this.commands.run(socket, ClientCommand.RoomLeave, payload, async () => {
      const session = requirePlayer(socket);
      const { snapshot, player } = await this.rooms.removePlayer(
        session.roomCode,
        session.playerId,
      );
      await this.detach(socket);
      this.broadcaster.state(snapshot);
      this.broadcaster.playerLeft(session.roomCode, player, 'left');
      return {};
    });
  }

  @SubscribeMessage(ClientCommand.RoomKick)
  kick(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Result<typeof ClientCommand.RoomKick> {
    return this.commands.run(socket, ClientCommand.RoomKick, payload, async ({ playerId }) => {
      const { roomCode } = requireHost(socket);
      const { snapshot, player } = await this.rooms.removePlayer(roomCode, playerId);
      this.presence.cancelExpiry(roomCode, playerId);
      this.broadcaster.state(snapshot);
      this.broadcaster.playerLeft(roomCode, player, 'kicked');
      this.broadcaster.endSessions(
        channels.session({ role: 'player', roomCode, playerId }),
        'KICKED',
      );
      return {};
    });
  }

  @SubscribeMessage(ClientCommand.RoomLock)
  lock(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Result<typeof ClientCommand.RoomLock> {
    return this.commands.run(socket, ClientCommand.RoomLock, payload, async ({ locked }) => {
      const { roomCode } = requireHost(socket);
      this.broadcaster.state(await this.rooms.setLocked(roomCode, locked));
      return {};
    });
  }

  @SubscribeMessage(ClientCommand.PlayerReady)
  ready(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Result<typeof ClientCommand.PlayerReady> {
    return this.commands.run(socket, ClientCommand.PlayerReady, payload, async ({ ready }) => {
      const { roomCode, playerId } = requirePlayer(socket);
      this.broadcaster.state((await this.rooms.setReady(roomCode, playerId, ready)).snapshot);
      return {};
    });
  }

  @SubscribeMessage(ClientCommand.PlayerUpdate)
  update(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Result<typeof ClientCommand.PlayerUpdate> {
    return this.commands.run(socket, ClientCommand.PlayerUpdate, payload, async (input) => {
      const { roomCode, playerId } = requirePlayer(socket);
      this.broadcaster.state((await this.rooms.updatePlayer(roomCode, playerId, input)).snapshot);
      return {};
    });
  }

  private async resume(
    socket: AppSocket,
    resolved: NonNullable<Awaited<ReturnType<RoomService['resolveToken']>>>,
  ): Promise<void> {
    const session: Session = resolved;
    // A session lives on one connection: an older one (other tab, stale page) is ended.
    await this.attach(socket, session);
    this.broadcaster.endSessions(channels.session(session), 'SESSION_REPLACED', socket.id);

    if (session.role === 'host') {
      this.broadcaster.state(await this.rooms.setHostConnected(session.roomCode, true));
      return;
    }
    this.presence.cancelExpiry(session.roomCode, session.playerId);
    const change = await this.rooms.reconnectPlayer(session.roomCode, session.playerId);
    this.broadcaster.state(change.snapshot);
    if (change.wasDisconnected) {
      this.broadcaster.playerReconnected(session.roomCode, session.playerId);
    }
  }

  private async attach(socket: AppSocket, session: Session): Promise<void> {
    socket.data.session = session;
    await socket.join([
      session.role === 'host'
        ? channels.host(session.roomCode)
        : channels.players(session.roomCode),
      channels.session(session),
    ]);
  }

  private async detach(socket: AppSocket): Promise<void> {
    const session = socket.data.session;
    if (!session) return;
    socket.data.session = null;
    const roleChannel =
      session.role === 'host'
        ? channels.host(session.roomCode)
        : channels.players(session.roomCode);
    for (const channel of [roleChannel, channels.session(session)]) await socket.leave(channel);
  }
}

function assertNoSession(socket: AppSocket): void {
  if (socket.data.session) {
    throw new CommandError('ALREADY_IN_ROOM', 'This connection already belongs to a room');
  }
}

function requireHost(socket: AppSocket): Extract<Session, { role: 'host' }> {
  const session = socket.data.session;
  if (!session) throw new CommandError('NOT_IN_ROOM', 'Not in a room');
  if (session.role !== 'host') throw new CommandError('FORBIDDEN', 'Only the host can do this');
  return session;
}

function requirePlayer(socket: AppSocket): Extract<Session, { role: 'player' }> {
  const session = socket.data.session;
  if (!session) throw new CommandError('NOT_IN_ROOM', 'Not in a room');
  if (session.role !== 'player') throw new CommandError('FORBIDDEN', 'Only players can do this');
  return session;
}
