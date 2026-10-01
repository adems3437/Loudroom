import { CommandError } from './command-error.js';
import type { AppSocket, Session } from './socket-types.js';

export function assertNoSession(socket: AppSocket): void {
  if (socket.data.session) {
    throw new CommandError('ALREADY_IN_ROOM', 'This connection already belongs to a room');
  }
}

export function requireHost(socket: AppSocket): Extract<Session, { role: 'host' }> {
  const session = socket.data.session;
  if (!session) throw new CommandError('NOT_IN_ROOM', 'Not in a room');
  if (session.role !== 'host') throw new CommandError('FORBIDDEN', 'Only the host can do this');
  return session;
}

export function requirePlayer(socket: AppSocket): Extract<Session, { role: 'player' }> {
  const session = socket.data.session;
  if (!session) throw new CommandError('NOT_IN_ROOM', 'Not in a room');
  if (session.role !== 'player') throw new CommandError('FORBIDDEN', 'Only players can do this');
  return session;
}
