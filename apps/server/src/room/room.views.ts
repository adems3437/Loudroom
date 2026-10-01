import type { HostRoomState, PlayerRoomState, PublicPlayer } from '@loudroom/shared';
import type { RoomSnapshot, StoredPlayer } from './room.store.js';

/** Projection of a stored player: everything except session secrets and internal keys. */
export function toPublicPlayer(player: StoredPlayer): PublicPlayer {
  return {
    id: player.id,
    nickname: player.nickname,
    avatar: player.avatar,
    color: player.color,
    score: player.score,
    ready: player.ready,
    connected: player.connected,
    joinedAt: player.joinedAt,
  };
}

function commonView({ room, players }: RoomSnapshot) {
  return {
    version: room.version,
    code: room.code,
    status: room.status,
    locked: room.locked,
    settings: room.settings,
    hostConnected: room.hostConnected,
    players: players.map(toPublicPlayer),
  };
}

export function joinUrlFor(publicUrl: string, code: string): string {
  return new URL(`/play/${code}`, publicUrl).toString();
}

export function hostView(snapshot: RoomSnapshot, publicUrl: string): HostRoomState {
  return {
    role: 'host',
    joinUrl: joinUrlFor(publicUrl, snapshot.room.code),
    ...commonView(snapshot),
  };
}

export function playerView(snapshot: RoomSnapshot): PlayerRoomState {
  return { role: 'player', ...commonView(snapshot) };
}
