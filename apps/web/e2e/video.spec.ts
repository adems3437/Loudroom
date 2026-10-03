import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devices, expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? '';

/**
 * A 3-second WebM test video made with ffmpeg (no binary fixtures in the repo). WebM because
 * Playwright's Chromium has no H.264 decoder. Null when ffmpeg is missing on this machine.
 */
function makeWebm(): string | null {
  try {
    const file = join(mkdtempSync(join(tmpdir(), 'loudroom-e2e-')), 'soru.webm');
    execFileSync(
      'ffmpeg',
      [
        ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=3'],
        ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3'],
        ['-c:v', 'libvpx-vp9', '-b:v', '300k', '-c:a', 'libopus', file],
      ].flat(),
      { stdio: 'ignore' },
    );
    return file;
  } catch {
    return null;
  }
}

/** Deletes through the API what the test created (the panel's own session and CSRF token). */
async function remove(admin: Page, path: string) {
  const me = await admin.request.get('/api/admin/auth/me');
  const { csrfToken } = (await me.json()) as { csrfToken: string };
  const response = await admin.request.delete(path, {
    headers: { 'x-csrf-token': csrfToken, origin: new URL(admin.url()).origin },
  });
  expect(response.status()).toBe(204);
}

test('a quiz question with a video: it plays on the TV, then answering opens', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const video = makeWebm();
  test.skip(video === null, 'ffmpeg is not installed on this machine');
  const tag = randomUUID().slice(0, 8);

  const admin = await (
    await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  ).newPage();
  await admin.goto('/admin/content/new?gameType=quiz');
  await admin.getByTestId('login-email').fill(ADMIN_EMAIL);
  await admin.getByTestId('login-password').fill(ADMIN_PASSWORD);
  await admin.getByTestId('login-submit').click();
  await expect(admin.getByTestId('quiz-editor')).toBeVisible();

  await admin.getByTestId('quiz-editor-question').fill(`Videolu soru ${tag}: hangi ses?`);
  await admin.getByTestId('quiz-editor-question-image-choose').click();
  const picker = admin.getByTestId('media-picker');
  await picker.getByTestId('media-file').setInputFiles(video ?? '');
  await picker.getByTestId('media-upload-submit').click();
  await expect(picker).toBeHidden({ timeout: 30_000 });
  const field = admin.getByTestId('quiz-editor-question-image');
  await expect(field).toHaveAttribute('data-kind', 'video');
  const mediaId = (await field.getAttribute('data-media-id')) ?? '';

  const options = admin.getByTestId('quiz-editor-option');
  for (const [index, text] of ['Zil', 'Düdük', 'Bip', 'Korna'].entries()) {
    await options.nth(index).fill(text);
  }
  await admin.getByTestId('quiz-editor-correct').nth(2).check();
  await admin.getByTestId('content-status').selectOption('PUBLISHED');
  await admin.getByTestId('content-save').click();
  await expect(admin).toHaveURL(/\/admin\/content\/[0-9a-f-]{36}$/);
  const contentId = admin.url().split('/').at(-1) ?? '';

  await admin.goto('/admin/game-packs/new');
  await admin.getByTestId('pack-name').fill(`Video paketi ${tag}`);
  await admin.getByTestId('pack-status').selectOption('PUBLISHED');
  await admin.getByTestId('pack-content-search').fill(tag);
  await admin.getByTestId('pack-content-search').press('Enter');
  await admin.locator(`[data-testid="pack-content-add"][data-content-id="${contentId}"]`).click();
  await admin.getByTestId('pack-save').click();
  await expect(admin).toHaveURL(/\/admin\/game-packs\/[0-9a-f-]{36}$/);
  const packId = admin.url().split('/').at(-1) ?? '';

  const host = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await host.goto('/host/create');
  await host.getByTestId('create-room').click();
  const joinUrl = (await host.getByTestId('join-url').getAttribute('data-url')) ?? '';
  const phone = await (await browser.newContext({ ...devices['iPhone 15'] })).newPage();
  await phone.goto(new URL(joinUrl).pathname);
  await phone.getByTestId('nickname-input').fill('İzleyici');
  await phone.getByTestId('join-button').click();
  await expect(host.getByTestId('player-card')).toHaveCount(1);
  await host.locator(`[data-testid="pack-option"][data-pack-id="${packId}"]`).click();
  await host.getByTestId('start-game').click();

  // The video plays during INTRO; phones only see the question text.
  const player = host.getByTestId('quiz-question-video');
  await expect(player).toBeVisible({ timeout: 20_000 });
  await expect(player).toHaveAttribute('src', `/media/${mediaId}.webm`);
  await expect(host.locator('[data-testid="quiz-host"][data-phase="INTRO"]')).toBeVisible();
  await expect
    .poll(() => player.evaluate((element: HTMLVideoElement) => element.currentTime), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0.5);
  await expect(phone.locator('video')).toHaveCount(0);

  // Answering opens when the video has played.
  await expect(host.locator('[data-testid="quiz-host"][data-phase="ANSWERING"]')).toBeVisible({
    timeout: 10_000,
  });
  await phone.getByTestId('quiz-answer').first().click();
  await expect(host.locator('[data-testid="quiz-host"][data-phase="REVEAL"]')).toBeVisible();
  await Promise.all([host.context().close(), phone.context().close()]);

  await remove(admin, `/api/admin/packs/${packId}`);
  await remove(admin, `/api/admin/content/${contentId}`);
  await remove(admin, `/api/admin/media/${mediaId}`);
  await admin.context().close();
});
