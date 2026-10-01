import type { AdminSession, AdminUser, ApiError } from '@loudroom/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS } from '../src/config/app-config.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { AdminClient, createUser, loggedIn, TEST_PASSWORD } from './admin-support.js';
import { testPrisma } from './game-support.js';
import { resetRedis, startTestApp, type TestApp } from './support.js';

describe('admin auth', () => {
  let testApp: TestApp;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = testPrisma();
    testApp = await startTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetRedis();
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@test.local' } } });
  });

  it('logs in with an httpOnly SameSite=Strict cookie and never returns the password hash', async () => {
    const user = await createUser(prisma, 'EDITOR');
    const client = new AdminClient(testApp.url);

    const wrong = await client.login(user.email, 'wrong password');
    expect(wrong.status).toBe(401);
    expect((wrong.body as unknown as ApiError).code).toBe('INVALID_CREDENTIALS');
    const unknown = await client.login('nobody@test.local', TEST_PASSWORD);
    expect((unknown.body as unknown as ApiError).code).toBe('INVALID_CREDENTIALS');

    // Emails are matched case-insensitively.
    const ok = await client.login(user.email.toUpperCase(), TEST_PASSWORD);
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^loudroom_admin=[\w-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Secure'); // PUBLIC_URL is http in tests
    expect(ok.body.user).toMatchObject({ email: user.email, role: 'EDITOR' });
    expect(ok.body.user.lastLoginAt).not.toBeNull();
    expect(JSON.stringify(ok.body)).not.toMatch(/argon2|passwordHash/);

    const me = await client.request<AdminSession>('GET', '/api/admin/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.csrfToken).toBe(ok.body.csrfToken);

    expect((await client.request('POST', '/api/admin/auth/logout')).status).toBe(204);
    expect(client.cookie).toBeNull();
    expect((await new AdminClient(testApp.url).request('GET', '/api/admin/auth/me')).status).toBe(
      401,
    );
  });

  it('sets the Secure flag when served over HTTPS', async () => {
    const secureApp = await startTestApp({ env: { PUBLIC_URL: 'https://party.example' } });
    try {
      const user = await createUser(prisma, 'EDITOR');
      const response = await fetch(new URL('/api/admin/auth/login', secureApp.url), {
        method: 'POST',
        headers: { origin: 'https://party.example', 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: TEST_PASSWORD }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toContain('Secure');
    } finally {
      await secureApp.app.close();
    }
  });

  it('refuses unsafe requests without the CSRF token or from another origin', async () => {
    const client = await loggedIn(testApp.url, prisma);
    const category = { slug: 'csrf-test', name: 'CSRF', description: null };

    const noToken = await client.request<ApiError>('POST', '/api/admin/categories', {
      json: category,
      csrf: false,
    });
    expect(noToken.status).toBe(403);
    expect(noToken.body.code).toBe('CSRF_FAILED');

    const foreign = await client.request<ApiError>('POST', '/api/admin/categories', {
      json: category,
      origin: 'https://evil.example',
    });
    expect(foreign.body.code).toBe('CSRF_FAILED');

    const noOrigin = await client.request<ApiError>('POST', '/api/admin/categories', {
      json: category,
      origin: null,
    });
    expect(noOrigin.body.code).toBe('CSRF_FAILED');

    // Login itself is protected against cross-site requests too.
    const user = await createUser(prisma, 'EDITOR');
    const crossSiteLogin = await new AdminClient(testApp.url).request<ApiError>(
      'POST',
      '/api/admin/auth/login',
      { json: { email: user.email, password: TEST_PASSWORD }, origin: 'https://evil.example' },
    );
    expect(crossSiteLogin.body.code).toBe('CSRF_FAILED');

    // Reads need no token; a write with it works.
    expect((await client.request('GET', '/api/admin/categories', { origin: null })).status).toBe(
      200,
    );
    const created = await client.request('POST', '/api/admin/categories', { json: category });
    expect(created.status).toBe(201);
    await prisma.category.deleteMany({ where: { slug: 'csrf-test' } });
  });

  it('limits failed logins per account, even from the right password afterwards', async () => {
    const user = await createUser(prisma, 'EDITOR');
    const client = new AdminClient(testApp.url);
    for (let i = 0; i < DEFAULT_RATE_LIMITS.adminLoginFailure.capacity; i++) {
      expect((await client.login(user.email, `wrong ${i}`)).status).toBe(401);
    }
    const locked = await client.login(user.email, TEST_PASSWORD);
    expect(locked.status).toBe(429);
    expect((locked.body as unknown as ApiError).code).toBe('RATE_LIMITED');
    // Other accounts are unaffected.
    const other = await createUser(prisma, 'EDITOR');
    expect((await client.login(other.email, TEST_PASSWORD)).status).toBe(200);
  });

  it('limits login attempts per address', async () => {
    const limited = await startTestApp({
      config: {
        rateLimits: { ...DEFAULT_RATE_LIMITS, adminLogin: { capacity: 2, refillPerSecond: 0.001 } },
      },
    });
    try {
      const client = new AdminClient(limited.url);
      const user = await createUser(prisma, 'EDITOR');
      expect((await client.login(user.email, 'wrong')).status).toBe(401);
      expect((await client.login(user.email, 'wrong')).status).toBe(401);
      expect((await client.login(user.email, TEST_PASSWORD)).status).toBe(429);
    } finally {
      await limited.app.close();
    }
  });

  it('throttles REST requests per address', async () => {
    const limited = await startTestApp({
      config: {
        rateLimits: { ...DEFAULT_RATE_LIMITS, rest: { capacity: 2, refillPerSecond: 0.001 } },
      },
    });
    try {
      const statuses = [];
      for (let i = 0; i < 3; i++) {
        statuses.push((await fetch(new URL('/api/packs', limited.url))).status);
      }
      expect(statuses).toEqual([200, 200, 429]);
    } finally {
      await limited.app.close();
    }
  });

  it('changes the own password and ends the other sessions', async () => {
    const user = await createUser(prisma, 'EDITOR');
    const first = new AdminClient(testApp.url);
    const second = new AdminClient(testApp.url);
    await first.login(user.email, TEST_PASSWORD);
    await second.login(user.email, TEST_PASSWORD);

    const wrong = await first.request<ApiError>('POST', '/api/admin/auth/password', {
      json: { currentPassword: 'nope', newPassword: 'a brand new password' },
    });
    expect(wrong.body.code).toBe('WRONG_PASSWORD');
    const weak = await first.request<ApiError>('POST', '/api/admin/auth/password', {
      json: { currentPassword: TEST_PASSWORD, newPassword: 'short' },
    });
    expect(weak.body.code).toBe('VALIDATION_ERROR');

    const changed = await first.request('POST', '/api/admin/auth/password', {
      json: { currentPassword: TEST_PASSWORD, newPassword: 'a brand new password' },
    });
    expect(changed.status).toBe(204);
    expect((await first.request('GET', '/api/admin/auth/me')).status).toBe(200);
    expect((await second.request('GET', '/api/admin/auth/me')).status).toBe(401);
    expect((await new AdminClient(testApp.url).login(user.email, TEST_PASSWORD)).status).toBe(401);
    expect(
      (await new AdminClient(testApp.url).login(user.email, 'a brand new password')).status,
    ).toBe(200);
  });

  describe('user management', () => {
    it('is for admins only', async () => {
      const editor = await loggedIn(testApp.url, prisma, 'EDITOR');
      const response = await editor.request<ApiError>('GET', '/api/admin/users');
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
      // Editors manage content.
      expect((await editor.request('GET', '/api/admin/content')).status).toBe(200);
    });

    it('creates, updates and deletes users; a role change ends their sessions', async () => {
      const admin = await loggedIn(testApp.url, prisma);
      const email = `new-${Date.now()}@test.local`;
      const created = await admin.request<AdminUser>('POST', '/api/admin/users', {
        json: { email, displayName: 'Yeni', role: 'EDITOR', password: 'editor password 1' },
      });
      expect(created.status).toBe(201);
      expect(JSON.stringify(created.body)).not.toContain('argon2');

      const duplicate = await admin.request<ApiError>('POST', '/api/admin/users', {
        json: { email, displayName: 'Yeni', role: 'EDITOR', password: 'editor password 1' },
      });
      expect(duplicate.body.code).toBe('EMAIL_TAKEN');

      const editor = new AdminClient(testApp.url);
      await editor.login(email, 'editor password 1');
      expect((await editor.request('GET', '/api/admin/users')).status).toBe(403);

      const promoted = await admin.request<AdminUser>(
        'PATCH',
        `/api/admin/users/${created.body.id}`,
        { json: { role: 'ADMIN' } },
      );
      expect(promoted.body.role).toBe('ADMIN');
      expect((await editor.request('GET', '/api/admin/auth/me')).status).toBe(401);

      const list = await admin.request<AdminUser[]>('GET', '/api/admin/users');
      expect(list.body.map((user) => user.email)).toContain(email);

      expect((await admin.request('DELETE', `/api/admin/users/${created.body.id}`)).status).toBe(
        204,
      );
      expect((await editor.login(email, 'editor password 1')).status).toBe(401);
    });

    it('never lets admins demote or delete themselves', async () => {
      const admin = await loggedIn(testApp.url, prisma);
      const demote = await admin.request<ApiError>('PATCH', `/api/admin/users/${admin.userId}`, {
        json: { role: 'EDITOR' },
      });
      expect(demote.body.code).toBe('SELF_CHANGE');
      const remove = await admin.request<ApiError>('DELETE', `/api/admin/users/${admin.userId}`);
      expect(remove.body.code).toBe('SELF_CHANGE');
      // Renaming yourself is fine.
      const renamed = await admin.request<AdminUser>('PATCH', `/api/admin/users/${admin.userId}`, {
        json: { displayName: 'Yeni Ad' },
      });
      expect(renamed.body.displayName).toBe('Yeni Ad');
    });
  });

  it('answers unknown routes and bad ids in the API error shape', async () => {
    const admin = await loggedIn(testApp.url, prisma);
    const missing = await admin.request<ApiError>('GET', '/api/admin/nothing-here');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
    const badId = await admin.request<ApiError>('GET', '/api/admin/content/not-a-uuid');
    expect(badId.status).toBe(400);
    expect(badId.body.code).toBe('VALIDATION_ERROR');
  });
});
