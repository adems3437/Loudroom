import { randomUUID } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? '';

/** A solid-color PNG built by hand (no image library in the web app). */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // truecolor
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())]);
  const pixels = Buffer.concat(Array<Buffer>(height).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function adminPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
}

async function login(page: Page, email: string, password: string) {
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

test.beforeAll(() => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set (see .env.example)');
  }
});

test('an editor builds a quiz with an image, publishes a pack, and a host plays it', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const tag = randomUUID().slice(0, 8);
  const admin = await adminPage(browser);

  // The panel needs a session: anonymous visitors land on the login page.
  await admin.goto('/admin/content');
  await expect(admin).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fcontent$/);
  await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(admin).toHaveURL(/\/admin\/content$/);

  // Category
  await admin.getByTestId('nav-categories').click();
  await admin.getByTestId('category-new').click();
  await admin.getByTestId('category-name').fill(`E2E ${tag}`);
  await admin.getByTestId('category-slug').fill(`e2e-${tag}`);
  await admin.getByTestId('category-save').click();
  await expect(admin.locator(`[data-testid="category-row"][data-slug="e2e-${tag}"]`)).toBeVisible();

  // Question with an uploaded image
  await admin.getByTestId('nav-content').click();
  await admin.getByTestId('content-new-quiz').click();
  await admin.getByTestId('quiz-editor-question').fill(`E2E sorusu ${tag}: hangi renk?`);
  await admin.getByTestId('quiz-editor-question-image-choose').click();
  const picker = admin.getByTestId('media-picker');
  await picker.getByTestId('media-file').setInputFiles({
    name: `kare-${tag}.png`,
    mimeType: 'image/png',
    buffer: png(64, 48, [255, 77, 109]),
  });
  await picker.getByTestId('media-upload-submit').click();
  await expect(picker).toBeHidden();
  const imageField = admin.getByTestId('quiz-editor-question-image');
  await expect(imageField).not.toHaveAttribute('data-media-id', '');
  const mediaId = (await imageField.getAttribute('data-media-id')) ?? '';

  const options = admin.getByTestId('quiz-editor-option');
  for (const [index, text] of ['Mavi', 'Pembe', 'Yeşil', 'Sarı'].entries()) {
    await options.nth(index).fill(text);
  }
  await admin.getByTestId('quiz-editor-correct').nth(1).check();
  await admin.getByTestId('content-status').selectOption('PUBLISHED');
  await admin.getByTestId('content-category').selectOption({ label: `E2E ${tag}` });
  await admin.getByTestId('content-save').click();
  await expect(admin).toHaveURL(/\/admin\/content\/[0-9a-f-]{36}$/);
  const contentId = admin.url().split('/').at(-1) ?? '';

  // Pack with that question, published
  await admin.getByTestId('nav-packs').click();
  await admin.getByTestId('pack-new').click();
  await admin.getByTestId('pack-name').fill(`E2E paketi ${tag}`);
  await admin.getByTestId('pack-status').selectOption('PUBLISHED');
  await admin.getByTestId('pack-content-search').fill(tag);
  await admin.getByTestId('pack-content-search').press('Enter');
  await admin.locator(`[data-testid="pack-content-add"][data-content-id="${contentId}"]`).click();
  await expect(admin.getByTestId('pack-selected-item')).toHaveCount(1);
  await admin.getByTestId('pack-save').click();
  await expect(admin).toHaveURL(/\/admin\/game-packs\/[0-9a-f-]{36}$/);
  const packId = admin.url().split('/').at(-1) ?? '';

  // Content in a pack cannot be deleted.
  await admin.goto(`/admin/content/${contentId}`);
  await admin.getByTestId('content-delete').click();
  await admin.getByTestId('content-delete-confirm').click();
  await expect(admin.getByTestId('admin-error')).toHaveAttribute('data-code', 'IN_USE');

  // The host picks the new pack in the lobby and plays it; the image reaches the TV.
  const host = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await host.goto('/host/create');
  await host.getByTestId('create-room').click();
  const joinUrl = (await host.getByTestId('join-url').getAttribute('data-url')) ?? '';
  const phone = await (await browser.newContext({ ...devices['iPhone 15'] })).newPage();
  await phone.goto(new URL(joinUrl).pathname);
  await phone.getByTestId('nickname-input').fill('Editör');
  await phone.getByTestId('join-button').click();
  await expect(host.getByTestId('player-card')).toHaveCount(1);

  const packOption = host.locator(`[data-testid="pack-option"][data-pack-id="${packId}"]`);
  await packOption.click();
  await expect(packOption).toHaveAttribute('aria-checked', 'true');
  await host.getByTestId('start-game').click();

  const image = host.getByTestId('quiz-question-image');
  await expect(image).toBeVisible({ timeout: 20_000 });
  await expect(image).toHaveAttribute('src', `/media/${mediaId}.webp`);
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(64);
  await expect(host.getByTestId('quiz-question')).toContainText(tag);
  await phone.getByTestId('quiz-answer').first().click();
  await expect(host.locator('[data-testid="quiz-host"][data-phase="REVEAL"]')).toBeVisible();
  await Promise.all([host.context().close(), phone.context().close()]);

  // Clean up through the panel: pack, then content, then the now unused image and category.
  await admin.goto(`/admin/game-packs/${packId}`);
  await admin.getByTestId('pack-delete').click();
  await admin.getByTestId('pack-delete-confirm').click();
  await expect(admin).toHaveURL(/\/admin\/game-packs$/);
  await admin.goto(`/admin/content/${contentId}`);
  await admin.getByTestId('content-delete').click();
  await admin.getByTestId('content-delete-confirm').click();
  await expect(admin).toHaveURL(/\/admin\/content$/);

  await admin.getByTestId('nav-media').click();
  const card = admin.locator(`[data-testid="media-card"][data-media-id="${mediaId}"]`);
  await card.getByTestId('media-delete').click();
  await card.getByTestId('media-delete-confirm').click();
  await expect(card).toBeHidden();

  await admin.getByTestId('nav-categories').click();
  const row = admin.locator(`[data-testid="category-row"][data-slug="e2e-${tag}"]`);
  await row.getByTestId('category-delete').click();
  await row.getByTestId('category-delete-confirm').click();
  await expect(row).toBeHidden();
  await admin.context().close();
});

test('roles: editors do not manage users; logout ends the session', async ({ browser }) => {
  const tag = randomUUID().slice(0, 8);
  const editorEmail = `editor-${tag}@e2e.local`;
  const admin = await adminPage(browser);

  await admin.goto('/admin/login');
  await login(admin, `nobody-${tag}@e2e.local`, 'wrong password');
  await expect(admin.getByTestId('admin-error')).toHaveAttribute(
    'data-code',
    'INVALID_CREDENTIALS',
  );

  await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.getByTestId('nav-users').click();
  await admin.getByTestId('user-new').click();
  await admin.getByTestId('user-email').fill(editorEmail);
  await admin.getByTestId('user-name').fill('E2E Editör');
  await admin.getByTestId('user-password').fill('editor password 123');
  await admin.getByTestId('user-create').click();
  await expect(
    admin.locator(`[data-testid="user-row"][data-email="${editorEmail}"]`),
  ).toBeVisible();

  const editor = await adminPage(browser);
  await editor.goto('/admin');
  await login(editor, editorEmail, 'editor password 123');
  await expect(editor.getByTestId('admin-user')).toHaveText('E2E Editör');
  await expect(editor.getByTestId('nav-content')).toBeVisible();
  await expect(editor.getByTestId('nav-users')).toHaveCount(0);
  await editor.getByTestId('logout').click();
  await expect(editor).toHaveURL(/\/admin\/login/);
  await editor.goto('/admin/media');
  await expect(editor).toHaveURL(/\/admin\/login/);
  await editor.context().close();

  const row = admin.locator(`[data-testid="user-row"][data-email="${editorEmail}"]`);
  await row.getByTestId('user-delete').click();
  await row.getByTestId('user-delete-confirm').click();
  await expect(row).toBeHidden();
  await admin.context().close();
});
