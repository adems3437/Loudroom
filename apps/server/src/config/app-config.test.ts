import { describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS, loadAppConfig } from './app-config.js';

const BASE = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  PUBLIC_URL: 'http://localhost:3000',
  IP_HASH_SECRET: 'a-secret-long-enough-for-hashing',
};

describe('loadAppConfig', () => {
  it('uses the default REST limit when unset or blank', () => {
    expect(loadAppConfig(BASE).rateLimits.rest).toEqual(DEFAULT_RATE_LIMITS.rest);
    const blank = { ...BASE, REST_RATE_LIMIT_CAPACITY: '', REST_RATE_LIMIT_PER_SECOND: '' };
    expect(loadAppConfig(blank).rateLimits.rest).toEqual(DEFAULT_RATE_LIMITS.rest);
  });

  it('reads the REST limit and the history retention from the environment', () => {
    const config = loadAppConfig({
      ...BASE,
      REST_RATE_LIMIT_CAPACITY: '600',
      REST_RATE_LIMIT_PER_SECOND: '20',
      SESSION_RETENTION_DAYS: '0',
    });
    expect(config.rateLimits.rest).toEqual({ capacity: 600, refillPerSecond: 20 });
    expect(config.rateLimits.command).toEqual(DEFAULT_RATE_LIMITS.command);
    expect(config.sessionRetentionDays).toBe(0);
    expect(() => loadAppConfig({ ...BASE, REST_RATE_LIMIT_CAPACITY: '0' })).toThrow();
  });
});
