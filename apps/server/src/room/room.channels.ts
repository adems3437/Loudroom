import type { Session } from '../realtime/socket-types.js';

/** Socket.IO rooms ("channels") used for addressing connections. */
export const channels = {
  /** Every connection of the room's host. */
  host: (code: string) => `room:${code}:host`,
  /** Every connection of the room's players. */
  players: (code: string) => `room:${code}:players`,
  /** The connection(s) bound to one session; normally exactly one. */
  session: (session: Session) =>
    session.role === 'host'
      ? `session:${session.roomCode}:host`
      : `session:${session.roomCode}:player:${session.playerId}`,
};
