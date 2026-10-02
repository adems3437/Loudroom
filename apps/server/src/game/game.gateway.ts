import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import {
  ClientCommand,
  ClientStream,
  clientStreams,
  type Ack,
  type CommandInput,
  type CommandResult,
} from '@loudroom/shared';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { RateLimiterService } from '../rate-limit/rate-limiter.service.js';
import { CommandRunner } from '../realtime/command-runner.service.js';
import { requireHost, requirePlayer } from '../realtime/session-guards.js';
import type { AppSocket } from '../realtime/socket-types.js';
import { GameStreamService } from './game-stream.service.js';
import { GameEngine } from './game.engine.js';

const logger = new Logger('GameGateway');

type HostCommand =
  | typeof ClientCommand.GamePause
  | typeof ClientCommand.GameResume
  | typeof ClientCommand.GameSkip
  | typeof ClientCommand.GameEnd
  | typeof ClientCommand.GameNext
  | typeof ClientCommand.GameRestart;

/** Game commands: the host drives the game, players send round inputs. */
@WebSocketGateway()
export class GameGateway {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly commands: CommandRunner,
    private readonly engine: GameEngine,
    private readonly streams: GameStreamService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @SubscribeMessage(ClientCommand.GameStart)
  start(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Promise<Ack<CommandResult<typeof ClientCommand.GameStart>>> {
    return this.commands.run(socket, ClientCommand.GameStart, payload, async ({ packId }) => {
      await this.engine.start(requireHost(socket).roomCode, packId);
      return {};
    });
  }

  @SubscribeMessage(ClientCommand.GamePause)
  pause(@ConnectedSocket() socket: AppSocket, @MessageBody() payload: unknown) {
    return this.host(socket, ClientCommand.GamePause, payload, (code) => this.engine.pause(code));
  }

  @SubscribeMessage(ClientCommand.GameResume)
  resume(@ConnectedSocket() socket: AppSocket, @MessageBody() payload: unknown) {
    return this.host(socket, ClientCommand.GameResume, payload, (code) => this.engine.resume(code));
  }

  @SubscribeMessage(ClientCommand.GameSkip)
  skip(@ConnectedSocket() socket: AppSocket, @MessageBody() payload: unknown) {
    return this.host(socket, ClientCommand.GameSkip, payload, (code) => this.engine.skip(code));
  }

  @SubscribeMessage(ClientCommand.GameEnd)
  end(@ConnectedSocket() socket: AppSocket, @MessageBody() payload: unknown) {
    return this.host(socket, ClientCommand.GameEnd, payload, (code) => this.engine.end(code));
  }

  @SubscribeMessage(ClientCommand.GameNext)
  next(@ConnectedSocket() socket: AppSocket, @MessageBody() payload: unknown) {
    return this.host(socket, ClientCommand.GameNext, payload, (code) => this.engine.next(code));
  }

  @SubscribeMessage(ClientCommand.GameRestart)
  restart(@ConnectedSocket() socket: AppSocket, @MessageBody() payload: unknown) {
    return this.host(socket, ClientCommand.GameRestart, payload, (code) =>
      this.engine.restart(code),
    );
  }

  @SubscribeMessage(ClientCommand.RoundInput)
  input(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Promise<Ack<CommandResult<typeof ClientCommand.RoundInput>>> {
    return this.commands.run(
      socket,
      ClientCommand.RoundInput,
      payload,
      async ({ roundId, input }) => {
        const { roomCode, playerId } = requirePlayer(socket);
        await this.engine.input(roomCode, playerId, roundId, input);
        return {};
      },
    );
  }

  /**
   * `round:stream` (SPEC §5): not acknowledged — chunks a client may not send, or sends too
   * fast, are dropped without an answer.
   */
  @SubscribeMessage(ClientStream.RoundStream)
  async stream(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const session = socket.data.session;
    if (session?.role !== 'player') return;
    const allowed = await this.rateLimiter.consume(
      'stream',
      socket.id,
      this.config.rateLimits.stream,
    );
    if (!allowed) return;
    const request = clientStreams[ClientStream.RoundStream].safeParse(payload);
    if (!request.success) return;
    await this.streams
      .push(session.roomCode, session.playerId, socket.id, request.data)
      .catch((error: unknown) => {
        logger.warn(
          `stream chunk failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  private host<C extends HostCommand>(
    socket: AppSocket,
    command: C,
    payload: unknown,
    action: (roomCode: string) => Promise<void>,
  ): Promise<Ack<CommandResult<C>>> {
    return this.commands.run(socket, command, payload, async (_input: CommandInput<C>) => {
      await action(requireHost(socket).roomCode);
      return {} as CommandResult<C>;
    });
  }
}
