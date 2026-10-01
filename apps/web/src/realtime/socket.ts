import type { ClientToServerEvents, ServerToClientEvents } from '@loudroom/shared';
import { io, type Socket } from 'socket.io-client';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Without a port the socket connects to the page's own origin (a reverse proxy routes it to
 * the server). With a port it uses the page's host name, so a phone that opened the LAN address
 * reaches the server on that same address.
 */
export function socketUrl(socketPort: string | null, location: Location): string | null {
  return socketPort ? `${location.protocol}//${location.hostname}:${socketPort}` : null;
}

/**
 * `sessionToken` is read on every (re)connect: the server resumes that session from the
 * handshake, so reconnects and reloads land in the same room slot.
 */
export function createSocket(
  socketPort: string | null,
  sessionToken: () => string | null,
): AppSocket {
  const url = socketUrl(socketPort, window.location);
  const options = {
    // WebSocket only: no long-polling, so no sticky sessions are needed when scaling out.
    transports: ['websocket'],
    autoConnect: false,
    auth: (callback: (data: object) => void) => {
      const token = sessionToken();
      callback(token ? { token } : {});
    },
  };
  return url ? io(url, options) : io(options);
}
