import type { Ack } from './ack.js';
import { timeSyncRequestSchema, type TimeSyncRequest, type TimeSyncResponse } from './time-sync.js';

/** Client → server commands. Every command is acknowledged with an {@link Ack}. */
export const ClientCommand = {
  TimeSync: 'time:sync',
} as const;
export type ClientCommand = (typeof ClientCommand)[keyof typeof ClientCommand];

/** Payload schema per command; the server validates every incoming payload against it. */
export const clientCommandSchemas = {
  [ClientCommand.TimeSync]: timeSyncRequestSchema,
} as const satisfies Record<ClientCommand, unknown>;

export interface ClientToServerEvents {
  [ClientCommand.TimeSync]: (
    payload: TimeSyncRequest,
    ack: (result: Ack<TimeSyncResponse>) => void,
  ) => void;
}

/** Server → client events. None exist yet; room and game events arrive with later phases. */
export type ServerToClientEvents = Record<string, never>;
