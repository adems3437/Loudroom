import { Injectable } from '@nestjs/common';
import {
  avatarIdSchema,
  playerColorSchema,
  roomCodeSchema,
  roomSettingsSchema,
  roomStatusSchema,
} from '@loudroom/shared';
import { z } from 'zod';
import { RedisService } from '../redis/redis.service.js';

/** Rooms disappear after this long without any change (SPEC §4). */
export const ROOM_IDLE_TTL_MS = 4 * 60 * 60 * 1000;

const storedRoomSchema = z.object({
  code: roomCodeSchema,
  status: roomStatusSchema,
  locked: z.boolean(),
  settings: roomSettingsSchema,
  hostTokenHash: z.string(),
  hostConnected: z.boolean(),
  version: z.number().int(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type StoredRoom = z.infer<typeof storedRoomSchema>;

const storedPlayerSchema = z.object({
  id: z.string(),
  roomCode: roomCodeSchema,
  nickname: z.string(),
  nicknameKey: z.string(),
  avatar: avatarIdSchema,
  color: playerColorSchema,
  score: z.number().int(),
  connected: z.boolean(),
  ready: z.boolean(),
  joinedAt: z.number(),
  lastSeenAt: z.number(),
  sessionTokenHash: z.string(),
});
export type StoredPlayer = z.infer<typeof storedPlayerSchema>;

export interface RoomSnapshot {
  room: StoredRoom;
  /** In join order. */
  players: StoredPlayer[];
}

export type ResolvedToken =
  { role: 'host'; roomCode: string } | { role: 'player'; roomCode: string; playerId: string };

const playerTokenValueSchema = z.object({ roomCode: roomCodeSchema, playerId: z.string() });

const keys = {
  room: (code: string) => `room:${code}`,
  players: (code: string) => `room:${code}:players`,
  playerToken: (hash: string) => `token:player:${hash}`,
  hostToken: (hash: string) => `token:host:${hash}`,
};
/** Matches `room:{code}` but not `room:{code}:players`. */
const ROOM_KEY_PATTERN = 'room:[1-9][0-9][0-9][0-9][0-9][0-9]';

/** Persists rooms in Redis using the key layout of SPEC §11. Every write refreshes the TTL. */
@Injectable()
export class RoomStore {
  constructor(private readonly redis: RedisService) {}

  /** Stores a brand-new room; false if the code is already taken. */
  async reserve(room: StoredRoom): Promise<boolean> {
    const created = await this.redis.client.set(
      keys.room(room.code),
      JSON.stringify(room),
      'PX',
      ROOM_IDLE_TTL_MS,
      'NX',
    );
    if (created !== 'OK') return false;
    await this.redis.client.set(
      keys.hostToken(room.hostTokenHash),
      room.code,
      'PX',
      ROOM_IDLE_TTL_MS,
    );
    return true;
  }

  async load(code: string): Promise<RoomSnapshot | null> {
    const [roomJson, playerJson] = await Promise.all([
      this.redis.client.get(keys.room(code)),
      this.redis.client.hvals(keys.players(code)),
    ]);
    if (roomJson === null) return null;
    const room = storedRoomSchema.parse(JSON.parse(roomJson));
    const players = playerJson
      .map((json) => storedPlayerSchema.parse(JSON.parse(json)))
      .sort((a, b) => a.joinedAt - b.joinedAt);
    return { room, players };
  }

  /** Writes the whole room atomically; tokens of `removed` players stop working. */
  async save(snapshot: RoomSnapshot, removed: readonly StoredPlayer[] = []): Promise<void> {
    const { room, players } = snapshot;
    const tx = this.redis.client.multi();
    tx.set(keys.room(room.code), JSON.stringify(room), 'PX', ROOM_IDLE_TTL_MS);
    tx.set(keys.hostToken(room.hostTokenHash), room.code, 'PX', ROOM_IDLE_TTL_MS);
    for (const player of removed) {
      tx.hdel(keys.players(room.code), player.id);
      tx.del(keys.playerToken(player.sessionTokenHash));
    }
    for (const player of players) {
      tx.hset(keys.players(room.code), player.id, JSON.stringify(player));
      tx.set(
        keys.playerToken(player.sessionTokenHash),
        JSON.stringify({ roomCode: room.code, playerId: player.id }),
        'PX',
        ROOM_IDLE_TTL_MS,
      );
    }
    tx.pexpire(keys.players(room.code), ROOM_IDLE_TTL_MS);
    await tx.exec();
  }

  async resolveToken(tokenHash: string): Promise<ResolvedToken | null> {
    const [playerValue, hostValue] = await this.redis.client.mget(
      keys.playerToken(tokenHash),
      keys.hostToken(tokenHash),
    );
    if (playerValue) {
      const parsed = playerTokenValueSchema.safeParse(JSON.parse(playerValue));
      if (parsed.success) return { role: 'player', ...parsed.data };
    }
    if (hostValue) {
      const parsed = roomCodeSchema.safeParse(hostValue);
      if (parsed.success) return { role: 'host', roomCode: parsed.data };
    }
    return null;
  }

  /** Codes of all rooms currently stored. */
  async listRoomCodes(): Promise<string[]> {
    const codes: string[] = [];
    let cursor = '0';
    do {
      const [next, found] = await this.redis.client.scan(
        cursor,
        'MATCH',
        ROOM_KEY_PATTERN,
        'COUNT',
        200,
      );
      cursor = next;
      codes.push(...found.map((key) => key.slice('room:'.length)));
    } while (cursor !== '0');
    return codes;
  }
}
