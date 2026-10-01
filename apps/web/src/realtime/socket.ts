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

export function createSocket(socketPort: string | null): AppSocket {
  const url = socketUrl(socketPort, window.location);
  // WebSocket only: no long-polling, so no sticky sessions are needed when scaling out.
  const options = { transports: ['websocket'], autoConnect: false };
  return url ? io(url, options) : io(options);
}
