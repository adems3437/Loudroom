import { expect, type Browser, type Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? '';

export interface AdminSession {
  page: Page;
  headers: Record<string, string>;
}

/** Logs the development admin in through the API (same origin, CSRF token). */
export async function adminSession(browser: Browser): Promise<AdminSession> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set (see .env.example)');
  }
  const page = await (await browser.newContext()).newPage();
  await page.goto('/admin/login');
  const origin = new URL(page.url()).origin;
  const login = await page.request.post('/api/admin/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    headers: { origin },
  });
  expect(login.ok()).toBe(true);
  const { csrfToken } = (await login.json()) as { csrfToken: string };
  return { page, headers: { origin, 'x-csrf-token': csrfToken } };
}

/** A published one-round pack playing one content item with the given round settings. */
export async function createPack(
  admin: AdminSession,
  gameType: string,
  contentId: string,
  settings: Record<string, unknown>,
): Promise<string> {
  const response = await admin.page.request.post('/api/admin/packs', {
    headers: admin.headers,
    data: {
      name: `e2e ${gameType} ${Date.now()}`,
      description: null,
      status: 'PUBLISHED',
      rounds: [
        {
          gameType,
          contentSelection: { mode: 'fixed', contentIds: [contentId] },
          questionCount: 1,
          timeLimitMs: null,
          scoreMultiplier: 1,
          showScoreboardAfter: false,
          settings,
        },
      ],
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

export async function deletePack(admin: AdminSession, packId: string): Promise<void> {
  const response = await admin.page.request.delete(`/api/admin/packs/${packId}`, {
    headers: admin.headers,
  });
  expect(response.status()).toBe(204);
  await admin.page.context().close();
}
