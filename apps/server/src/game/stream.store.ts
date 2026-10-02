import { Injectable } from '@nestjs/common';
import type { Result } from 'ioredis';
import { RedisService } from '../redis/redis.service.js';
import { ROOM_IDLE_TTL_MS } from '../room/room.store.js';

declare module 'ioredis' {
  interface RedisCommander<Context> {
    streamAppend(
      chunksKey: string,
      costKey: string,
      entry: string,
      cost: number,
      maxChunks: number,
      maxCost: number,
      ttlMs: number,
    ): Result<number, Context>;
  }
}

/**
 * Appends one chunk unless the round's limits are reached; 1 when stored, 0 when full.
 * KEYS: the chunk list, the cost total. ARGV: entry, cost, max chunks, max cost, TTL (ms).
 */
const APPEND_SCRIPT = `
local count = redis.call('LLEN', KEYS[1])
if count >= tonumber(ARGV[3]) then return 0 end
local total = tonumber(redis.call('GET', KEYS[2]) or '0')
if total + tonumber(ARGV[2]) > tonumber(ARGV[4]) then return 0 end
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('INCRBY', KEYS[2], ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
redis.call('PEXPIRE', KEYS[2], ARGV[5])
return 1
`;

const keys = {
  /** SPEC §11: the stroke history of the round on screen. */
  chunks: (code: string) => `room:${code}:stream`,
  /** What the stored chunks cost so far, for the round limit. */
  cost: (code: string) => `room:${code}:stream:cost`,
};

interface StoredEntry {
  roundId: string;
  chunk: unknown;
}

/**
 * The current round's stream history in Redis (SPEC §5, §11): never written to Postgres,
 * cleared when a round starts and when the game ends. Entries carry their round id, so a
 * chunk that races a round change is never shown in the next round.
 */
@Injectable()
export class StreamStore {
  constructor(private readonly redis: RedisService) {
    redis.client.defineCommand('streamAppend', { numberOfKeys: 2, lua: APPEND_SCRIPT });
  }

  async append(
    code: string,
    roundId: string,
    chunk: unknown,
    cost: number,
    limits: { maxChunks: number; maxCost: number },
  ): Promise<boolean> {
    const entry: StoredEntry = { roundId, chunk };
    const stored = await this.redis.client.streamAppend(
      keys.chunks(code),
      keys.cost(code),
      JSON.stringify(entry),
      Math.max(0, Math.ceil(cost)),
      limits.maxChunks,
      limits.maxCost,
      ROOM_IDLE_TTL_MS,
    );
    return stored === 1;
  }

  async history(code: string, roundId: string): Promise<unknown[]> {
    const entries = await this.redis.client.lrange(keys.chunks(code), 0, -1);
    return entries.flatMap((json) => {
      const entry = JSON.parse(json) as StoredEntry;
      return entry.roundId === roundId ? [entry.chunk] : [];
    });
  }

  async clear(code: string): Promise<void> {
    await this.redis.client.del(keys.chunks(code), keys.cost(code));
  }
}
