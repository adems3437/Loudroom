import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import {
  ClientCommand,
  clientCommandSchemas,
  type Ack,
  type TimeSyncResponse,
} from '@loudroom/shared';
import { runCommand } from './run-command.js';

@WebSocketGateway()
export class RealtimeGateway {
  /** Clients measure their clock offset from this; see `bestClockEstimate` in shared. */
  @SubscribeMessage(ClientCommand.TimeSync)
  timeSync(@MessageBody() payload: unknown): Ack<TimeSyncResponse> {
    return runCommand(clientCommandSchemas[ClientCommand.TimeSync], payload, (request) => ({
      clientTime: request.clientTime,
      serverTime: Date.now(),
    }));
  }
}
