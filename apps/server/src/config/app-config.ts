import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const booleanFlag = z
  .enum(['true', 'false', ''])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVER_HOST: z.string().min(1).default('0.0.0.0'),
  SERVER_PORT: z.coerce.number().int().min(0).max(65_535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  /** Address players open; QR codes and join links are built from it. */
  PUBLIC_URL: z.url({ protocol: /^https?$/ }),
  /** Extra browser origins allowed besides PUBLIC_URL's origin. */
  CORS_ORIGINS: csv.pipe(z.array(z.url({ protocol: /^https?$/ }))),
  /** How long a disconnected player keeps their slot (SPEC §4: 90 s). */
  PLAYER_RECONNECT_GRACE_MS: z.coerce.number().int().positive().default(90_000),
  /** Key for hashing client IPs; rate-limit keys never contain a plain IP (SPEC §9, KVKK). */
  IP_HASH_SECRET: z.string().min(16),
  /** Trust X-Forwarded-For (only behind our own reverse proxy). */
  TRUST_PROXY: booleanFlag,
  /** Optional file with extra blocked words, one per line. */
  PROFANITY_EXTRA_WORDS_FILE: z.string().optional(),
});

export interface TokenBucketConfig {
  capacity: number;
  refillPerSecond: number;
}

export interface RateLimitConfig {
  /** New socket connections per client IP. */
  connection: TokenBucketConfig;
  /** Commands per socket connection. */
  command: TokenBucketConfig;
  /** Failed join attempts per client IP (room code brute force). */
  joinFailure: TokenBucketConfig;
  /** Rooms created per client IP. */
  roomCreate: TokenBucketConfig;
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  publicUrl: string;
  corsOrigins: string[];
  playerReconnectGraceMs: number;
  ipHashSecret: string;
  trustProxy: boolean;
  profanityExtraWordsFile: string | null;
  rateLimits: RateLimitConfig;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Generous enough for a whole party behind one Wi-Fi (NAT) address, strict enough to make
 * guessing room codes impractical.
 */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  connection: { capacity: 60, refillPerSecond: 1 },
  command: { capacity: 20, refillPerSecond: 10 },
  joinFailure: { capacity: 10, refillPerSecond: 10 / 60 },
  roomCreate: { capacity: 20, refillPerSecond: 10 / 60 },
};

/** Parses the environment once at startup; an invalid environment stops the process. */
export function loadAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  const parsed = result.data;
  const origins = new Set([
    new URL(parsed.PUBLIC_URL).origin,
    ...parsed.CORS_ORIGINS.map((url) => new URL(url).origin),
  ]);
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.SERVER_HOST,
    port: parsed.SERVER_PORT,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    publicUrl: parsed.PUBLIC_URL,
    corsOrigins: [...origins],
    playerReconnectGraceMs: parsed.PLAYER_RECONNECT_GRACE_MS,
    ipHashSecret: parsed.IP_HASH_SECRET,
    trustProxy: parsed.TRUST_PROXY,
    profanityExtraWordsFile: parsed.PROFANITY_EXTRA_WORDS_FILE ?? null,
    rateLimits: DEFAULT_RATE_LIMITS,
  };
}
