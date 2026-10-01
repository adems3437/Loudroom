import type { ClientToServerEvents, ServerToClientEvents } from '@loudroom/shared';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';

/** Who a connection acts as. Bound by room:create / room:join or by the handshake token. */
export type Session =
  { role: 'host'; roomCode: string } | { role: 'player'; roomCode: string; playerId: string };

export interface SocketData {
  /** Keyed hash of the client IP (never the IP itself). */
  ipKey: string;
  /** Token from the handshake, resolved into a session once the connection is established. */
  resumeToken: string | null;
  session: Session | null;
}

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
