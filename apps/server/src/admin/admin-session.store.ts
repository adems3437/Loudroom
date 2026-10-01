import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { RedisService } from '../redis/redis.service.js';

const storedSessionSchema = z.object({
  userId: z.uuid(),
  csrfToken: z.string(),
  createdAt: z.number(),
});
export type StoredAdminSession = z.infer<typeof storedSessionSchema>;

const sessionKey = (tokenHash: string) => `admin:session:${tokenHash}`;
const userSessionsKey = (userId: string) => `admin:user-sessions:${userId}`;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Admin sessions in Redis (SPEC §9, §11). The cookie holds a random token; Redis holds only its
 * SHA-256, the user and the session's CSRF token. Sessions expire after a period without
 * requests, and all of a user's sessions can be ended at once (password or role change).
 */
@Injectable()
export class AdminSessionStore {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly redis: RedisService,
  ) {}

  async create(userId: string): Promise<{ token: string; session: StoredAdminSession }> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const session: StoredAdminSession = {
      userId,
      csrfToken: randomBytes(32).toString('base64url'),
      createdAt: Date.now(),
    };
    const ttl = this.config.admin.sessionTtlMs;
    await this.redis.client
      .multi()
      .set(sessionKey(tokenHash), JSON.stringify(session), 'PX', ttl)
      .sadd(userSessionsKey(userId), tokenHash)
      .pexpire(userSessionsKey(userId), ttl)
      .exec();
    return { token, session };
  }

  /** The session for a cookie token, extending its lifetime; null when unknown or expired. */
  async touch(token: string): Promise<StoredAdminSession | null> {
    const tokenHash = hashToken(token);
    const raw = await this.redis.client.get(sessionKey(tokenHash));
    if (raw === null) return null;
    const parsed = storedSessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const ttl = this.config.admin.sessionTtlMs;
    await this.redis.client
      .multi()
      .pexpire(sessionKey(tokenHash), ttl)
      .pexpire(userSessionsKey(parsed.data.userId), ttl)
      .exec();
    return parsed.data;
  }

  async destroy(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    const raw = await this.redis.client.get(sessionKey(tokenHash));
    const userId =
      raw === null ? undefined : storedSessionSchema.safeParse(JSON.parse(raw)).data?.userId;
    const multi = this.redis.client.multi().del(sessionKey(tokenHash));
    if (userId) multi.srem(userSessionsKey(userId), tokenHash);
    await multi.exec();
  }

  /** Ends every session of a user, optionally keeping the one making the request. */
  async destroyAllForUser(userId: string, keepToken?: string): Promise<void> {
    const keep = keepToken ? hashToken(keepToken) : null;
    const hashes = await this.redis.client.smembers(userSessionsKey(userId));
    const ended = hashes.filter((tokenHash) => tokenHash !== keep);
    if (ended.length === 0) return;
    await this.redis.client
      .multi()
      .del(...ended.map(sessionKey))
      .srem(userSessionsKey(userId), ...ended)
      .exec();
  }
}
