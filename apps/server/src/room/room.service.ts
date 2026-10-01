import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PLAYER_COLORS, nicknameKey, type AvatarId, type RoomSettings } from '@loudroom/shared';
import { KeyedMutex } from '../common/keyed-mutex.js';
import { ProfanityFilter } from '../moderation/profanity-filter.js';
import { CommandError } from '../realtime/command-error.js';
import { generateRoomCode, generateSessionToken, hashSessionToken } from './room-secrets.js';
import {
  RoomStore,
  type ResolvedToken,
  type RoomSnapshot,
  type StoredPlayer,
} from './room.store.js';

const MAX_CODE_ATTEMPTS = 20;

export interface PlayerChange {
  snapshot: RoomSnapshot;
  player: StoredPlayer;
}

/**
 * Room rules. Every operation on a room runs under that room's lock and persists the result,
 * so concurrent commands (e.g. many players joining at once) cannot overbook a room.
 */
@Injectable()
export class RoomService {
  private readonly locks = new KeyedMutex();

  constructor(
    private readonly store: RoomStore,
    private readonly profanity: ProfanityFilter,
  ) {}

  async createRoom(settings: RoomSettings): Promise<{ snapshot: RoomSnapshot; hostToken: string }> {
    const hostToken = generateSessionToken();
    const now = Date.now();
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const room = {
        code: generateRoomCode(),
        status: 'LOBBY' as const,
        locked: false,
        settings,
        hostTokenHash: hashSessionToken(hostToken),
        hostConnected: true,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      if (await this.store.reserve(room)) return { snapshot: { room, players: [] }, hostToken };
    }
    throw new Error('Could not find a free room code');
  }

  async joinRoom(input: {
    roomCode: string;
    nickname: string;
    avatar: AvatarId;
  }): Promise<PlayerChange & { playerToken: string }> {
    // Checked before looking the room up, so this answer reveals nothing about the code.
    this.assertAcceptableNickname(input.nickname);
    return this.mutate(input.roomCode, (snapshot) => {
      const { room, players } = snapshot;
      if (room.locked) throw new CommandError('ROOM_LOCKED', 'The room is locked');
      if (players.length >= room.settings.maxPlayers) {
        throw new CommandError('ROOM_FULL', 'The room is full');
      }
      const key = nicknameKey(input.nickname);
      if (players.some((player) => player.nicknameKey === key)) {
        throw new CommandError('NICKNAME_TAKEN', 'Nickname already taken in this room');
      }

      const playerToken = generateSessionToken();
      const now = Date.now();
      const player: StoredPlayer = {
        id: randomUUID(),
        roomCode: room.code,
        nickname: input.nickname,
        nicknameKey: key,
        avatar: input.avatar,
        color: pickColor(players),
        score: 0,
        connected: true,
        ready: false,
        joinedAt: now,
        lastSeenAt: now,
        sessionTokenHash: hashSessionToken(playerToken),
      };
      return { next: { room, players: [...players, player] }, result: { player, playerToken } };
    });
  }

  resolveToken(token: string): Promise<ResolvedToken | null> {
    return this.store.resolveToken(hashSessionToken(token));
  }

  setHostConnected(code: string, connected: boolean): Promise<RoomSnapshot> {
    return this.mutate(code, ({ room, players }) => ({
      next: { room: { ...room, hostConnected: connected }, players },
      result: {},
    })).then(({ snapshot }) => snapshot);
  }

  /** Marks the player connected again; `wasDisconnected` tells whether this is a comeback. */
  reconnectPlayer(
    code: string,
    playerId: string,
  ): Promise<PlayerChange & { wasDisconnected: boolean }> {
    return this.mutatePlayer(code, playerId, (player) => ({
      ...player,
      connected: true,
      lastSeenAt: Date.now(),
    })).then((change) => ({ ...change, wasDisconnected: !change.before.connected }));
  }

  markPlayerDisconnected(code: string, playerId: string): Promise<PlayerChange> {
    return this.mutatePlayer(code, playerId, (player) => ({
      ...player,
      connected: false,
      lastSeenAt: Date.now(),
    }));
  }

  setReady(code: string, playerId: string, ready: boolean): Promise<PlayerChange> {
    return this.mutatePlayer(code, playerId, (player) => ({ ...player, ready }));
  }

  updatePlayer(
    code: string,
    playerId: string,
    update: { nickname?: string | undefined; avatar?: AvatarId | undefined },
  ): Promise<PlayerChange> {
    if (update.nickname !== undefined) this.assertAcceptableNickname(update.nickname);
    return this.mutatePlayer(code, playerId, (player, others) => {
      if (update.nickname === undefined)
        return { ...player, avatar: update.avatar ?? player.avatar };
      const key = nicknameKey(update.nickname);
      if (others.some((other) => other.nicknameKey === key)) {
        throw new CommandError('NICKNAME_TAKEN', 'Nickname already taken in this room');
      }
      return {
        ...player,
        nickname: update.nickname,
        nicknameKey: key,
        avatar: update.avatar ?? player.avatar,
      };
    });
  }

  setLocked(code: string, locked: boolean): Promise<RoomSnapshot> {
    return this.mutate(code, ({ room, players }) => ({
      next: { room: { ...room, locked }, players },
      result: {},
    })).then(({ snapshot }) => snapshot);
  }

  /** Removes a player (left or kicked) and revokes their token. */
  removePlayer(code: string, playerId: string): Promise<PlayerChange> {
    return this.mutate(code, ({ room, players }) => {
      const player = players.find((candidate) => candidate.id === playerId);
      if (!player) throw new CommandError('PLAYER_NOT_FOUND', 'No such player in this room');
      return {
        next: { room, players: players.filter((candidate) => candidate !== player) },
        removed: [player],
        result: { player },
      };
    });
  }

  /**
   * Frees the slot of a player whose reconnect grace period ran out. Returns null when the
   * player came back (or is gone) in the meantime, or the room no longer exists.
   */
  async expireDisconnectedPlayer(code: string, playerId: string): Promise<PlayerChange | null> {
    try {
      return await this.mutateIfNeeded(code, ({ room, players }) => {
        const player = players.find((candidate) => candidate.id === playerId);
        if (!player || player.connected) return null;
        return {
          next: { room, players: players.filter((candidate) => candidate !== player) },
          removed: [player],
          result: { player },
        };
      });
    } catch (error) {
      if (error instanceof CommandError && error.code === 'ROOM_NOT_FOUND') return null;
      throw error;
    }
  }

  /**
   * After a server restart no connection survives: marks the host and every player of the
   * room disconnected so the usual reconnect grace period applies to everyone.
   */
  async markEveryoneDisconnected(code: string): Promise<RoomSnapshot | null> {
    try {
      const now = Date.now();
      return (
        await this.mutate(code, ({ room, players }) => ({
          next: {
            room: { ...room, hostConnected: false },
            players: players.map((player) => ({ ...player, connected: false, lastSeenAt: now })),
          },
          result: {},
        }))
      ).snapshot;
    } catch (error) {
      if (error instanceof CommandError && error.code === 'ROOM_NOT_FOUND') return null;
      throw error;
    }
  }

  listRoomCodes(): Promise<string[]> {
    return this.store.listRoomCodes();
  }

  private assertAcceptableNickname(nickname: string): void {
    if (this.profanity.isProfane(nickname)) {
      throw new CommandError('NICKNAME_REJECTED', 'Nickname is not allowed');
    }
  }

  private async mutatePlayer(
    code: string,
    playerId: string,
    change: (player: StoredPlayer, others: StoredPlayer[]) => StoredPlayer,
  ): Promise<PlayerChange & { before: StoredPlayer }> {
    return this.mutate(code, ({ room, players }) => {
      const before = players.find((candidate) => candidate.id === playerId);
      if (!before) throw new CommandError('PLAYER_NOT_FOUND', 'No such player in this room');
      const player = change(
        before,
        players.filter((candidate) => candidate !== before),
      );
      return {
        next: {
          room,
          players: players.map((candidate) => (candidate === before ? player : candidate)),
        },
        result: { player, before },
      };
    });
  }

  /** Loads the room, applies `change` under the room lock and saves it with a new version. */
  private async mutate<R extends object>(
    code: string,
    change: (snapshot: RoomSnapshot) => Mutation<R>,
  ): Promise<R & { snapshot: RoomSnapshot }> {
    const outcome = await this.mutateIfNeeded(code, change);
    if (!outcome) throw new Error('mutation unexpectedly skipped');
    return outcome;
  }

  /** Like {@link mutate}, but `change` may return null to leave the room untouched. */
  private mutateIfNeeded<R extends object>(
    code: string,
    change: (snapshot: RoomSnapshot) => Mutation<R> | null,
  ): Promise<(R & { snapshot: RoomSnapshot }) | null> {
    return this.locks.run(code, async () => {
      const current = await this.store.load(code);
      if (!current) throw new CommandError('ROOM_NOT_FOUND', 'Room not found');
      const outcome = change(current);
      if (!outcome) return null;
      const snapshot: RoomSnapshot = {
        room: {
          ...outcome.next.room,
          version: current.room.version + 1,
          updatedAt: Date.now(),
        },
        players: outcome.next.players,
      };
      await this.store.save(snapshot, outcome.removed);
      return { ...outcome.result, snapshot };
    });
  }
}

interface Mutation<R> {
  next: RoomSnapshot;
  removed?: StoredPlayer[];
  result: R;
}

/** First palette color nobody in the room has; when all are taken, the least used one. */
function pickColor(players: readonly StoredPlayer[]): StoredPlayer['color'] {
  const usage = new Map<string, number>(PLAYER_COLORS.map((color) => [color, 0]));
  for (const player of players) usage.set(player.color, (usage.get(player.color) ?? 0) + 1);
  let best: StoredPlayer['color'] = PLAYER_COLORS[0];
  for (const color of PLAYER_COLORS) {
    if ((usage.get(color) ?? 0) < (usage.get(best) ?? 0)) best = color;
  }
  return best;
}
