import type { INestApplication } from '@nestjs/common';
import { inject } from 'vitest';
import { createApp } from '../src/bootstrap.js';
import { loadAppConfig } from '../src/config/app-config.js';

export interface TestApp {
  app: INestApplication;
  url: string;
}

/** Starts the real app on a random local port against the test database and Redis. */
export async function startTestApp(
  overrides: { DATABASE_URL?: string; REDIS_URL?: string } = {},
): Promise<TestApp> {
  const config = loadAppConfig({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    REDIS_URL: inject('redisUrl'),
    PUBLIC_URL: 'http://localhost:3000',
    ...overrides,
  });
  const app = await createApp(config);
  await app.listen(0, '127.0.0.1');
  return { app, url: await app.getUrl() };
}

/** A URL on a local port nothing listens on, for simulating an unreachable dependency. */
export function unreachable(protocol: 'postgresql' | 'redis'): string {
  return protocol === 'postgresql'
    ? 'postgresql://loudroom:loudroom@127.0.0.1:1/loudroom'
    : 'redis://127.0.0.1:1/0';
}
