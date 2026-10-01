import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { ClientCommand, type Ack, type CommandInput, type CommandResult } from '@loudroom/shared';
import { CommandRunner } from '../realtime/command-runner.service.js';
import { requireHost, requirePlayer } from '../realtime/session-guards.js';
import type { AppSocket } from '../realtime/socket-types.js';
import { GameEngine } from './game.engine.js';

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
    private readonly commands: CommandRunner,
    private readonly engine: GameEngine,
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
