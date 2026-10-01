import { afterEach, describe, expect, it } from 'vitest';
import { startTestApp, unreachable, type TestApp } from './support.js';

describe('GET /health', () => {
  let testApp: TestApp | undefined;

  afterEach(async () => {
    await testApp?.app.close();
    testApp = undefined;
  });

  it('reports ok when PostgreSQL and Redis are reachable', async () => {
    testApp = await startTestApp();
    const response = await fetch(`${testApp.url}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
    // helmet is active
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('answers 503 and names Redis when Redis is unreachable', async () => {
    testApp = await startTestApp({ REDIS_URL: unreachable('redis') });
    const response = await fetch(`${testApp.url}/health`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'error',
      checks: { database: 'up', redis: 'down' },
    });
  });

  it('answers 503 and names the database when PostgreSQL is unreachable', async () => {
    testApp = await startTestApp({ DATABASE_URL: unreachable('postgresql') });
    const response = await fetch(`${testApp.url}/health`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'error',
      checks: { database: 'down', redis: 'up' },
    });
  });

  it('is not served under the /api prefix', async () => {
    testApp = await startTestApp();
    expect((await fetch(`${testApp.url}/api/health`)).status).toBe(404);
  });
});
