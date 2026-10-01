import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { ClientCommand, type Ack, type TimeSyncResponse } from '@loudroom/shared';
import { CommandRunner } from './command-runner.service.js';
import type { AppSocket } from './socket-types.js';

@WebSocketGateway()
export class RealtimeGateway {
  constructor(private readonly commands: CommandRunner) {}

  /** Clients measure their clock offset from this; see `bestClockEstimate` in shared. */
  @SubscribeMessage(ClientCommand.TimeSync)
  timeSync(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() payload: unknown,
  ): Promise<Ack<TimeSyncResponse>> {
    return this.commands.run(socket, ClientCommand.TimeSync, payload, (request) => ({
      clientTime: request.clientTime,
      serverTime: Date.now(),
    }));
  }
}
