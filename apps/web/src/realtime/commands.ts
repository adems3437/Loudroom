import {
  ackSchema,
  clientCommands,
  type Ack,
  type ClientCommand,
  type CommandRequest,
  type CommandResult,
} from '@loudroom/shared';
import type { Socket } from 'socket.io-client';
import type { AppSocket } from './socket';

const COMMAND_TIMEOUT_MS = 8000;

/** No (valid) answer arrived: offline, timed out, or the server spoke a different contract. */
export interface NoResponse {
  ok: false;
  code: 'NO_RESPONSE';
  message: string;
}

export type CommandOutcome<C extends ClientCommand> = Ack<CommandResult<C>> | NoResponse;

/** Sends a command and validates the ack against the shared contract. */
export async function sendCommand<C extends ClientCommand>(
  socket: AppSocket,
  command: C,
  payload: CommandRequest<C>,
): Promise<CommandOutcome<C>> {
  try {
    // The typed event map cannot express a generic command; payload and result are typed above.
    const untyped = socket as unknown as Socket;
    const response: unknown = await untyped
      .timeout(COMMAND_TIMEOUT_MS)
      .emitWithAck(command, payload);
    const parsed = ackSchema(clientCommands[command].result).safeParse(response);
    if (parsed.success) return parsed.data as Ack<CommandResult<C>>;
    return { ok: false, code: 'NO_RESPONSE', message: 'Unexpected response' };
  } catch {
    return { ok: false, code: 'NO_RESPONSE', message: 'No response from the server' };
  }
}
