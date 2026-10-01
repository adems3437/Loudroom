import { execFileSync } from 'node:child_process';
import { Redis } from 'ioredis';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}

/** Migrates the test database and empties the test Redis DB before the suite runs. */
export default async function setup(project: TestProject): Promise<void> {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    // no .env file — rely on the process environment
  }
  const databaseUrl = process.env.DATABASE_URL_TEST;
  const redisUrl = process.env.REDIS_URL_TEST;
  if (!databaseUrl || !redisUrl) {
    throw new Error('DATABASE_URL_TEST and REDIS_URL_TEST must be set (see .env.example)');
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const redis = new Redis(redisUrl);
  await redis.flushdb();
  await redis.quit();

  project.provide('databaseUrl', databaseUrl);
  project.provide('redisUrl', redisUrl);
}
