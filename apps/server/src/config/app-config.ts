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
});

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  host: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  publicUrl: string;
  corsOrigins: string[];
}

export const APP_CONFIG = Symbol('APP_CONFIG');

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
  };
}
