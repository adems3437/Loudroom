import { Injectable, Logger } from '@nestjs/common';
import type { Result } from 'ioredis';
import type { TokenBucketConfig } from '../config/app-config.js';
import { RedisService } from '../redis/redis.service.js';
import { TOKEN_BUCKET_SCRIPT } from './token-bucket.js';

declare module 'ioredis' {
  interface RedisCommander<Context> {
    tokenBucket(
      key: string,
      capacity: number,
      refillPerMs: number,
      cost: number,
    ): Result<[number, number], Context>;
  }
}

const logger = new Logger('RateLimiter');

@Injectable()
export class RateLimiterService {
  constructor(private readonly redis: RedisService) {
    redis.client.defineCommand('tokenBucket', { numberOfKeys: 1, lua: TOKEN_BUCKET_SCRIPT });
  }

  /** Takes `cost` tokens from the bucket `rl:{scope}:{key}`; false when not enough are left. */
  consume(scope: string, key: string, bucket: TokenBucketConfig, cost = 1): Promise<boolean> {
    return this.take(scope, key, bucket, cost);
  }

  /** True when the bucket still has a token, without taking one. */
  hasCapacity(scope: string, key: string, bucket: TokenBucketConfig): Promise<boolean> {
    return this.take(scope, key, bucket, 0);
  }

  private async take(
    scope: string,
    key: string,
    bucket: TokenBucketConfig,
    cost: number,
  ): Promise<boolean> {
    try {
      const [allowed] = await this.redis.client.tokenBucket(
        `rl:${scope}:${key}`,
        bucket.capacity,
        bucket.refillPerSecond / 1000,
        cost,
      );
      return allowed === 1;
    } catch (error) {
      // Fail open: when Redis is down the rooms are unavailable anyway, and refusing every
      // request would only hide that behind misleading "rate limited" errors.
      logger.warn(
        `rate limit check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    }
  }
}
