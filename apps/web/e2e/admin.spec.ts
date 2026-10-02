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
  await expect(host).toHaveURL(/\/host\/room\/\d{6}$/);
  const roomCode = new URL(host.url()).pathname.split('/').pop() ?? '';
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

  // The game is in the history, with the round as it was played.
  await admin.getByTestId('nav-history').click();
  await admin.getByTestId('sessions-search').fill(roomCode);
  await admin.getByTestId('sessions-search').press('Enter');
  await admin
    .locator(`[data-testid="session-row"][data-room-code="${roomCode}"]`)
    .first()
    .getByRole('link')
    .click();
  await expect(admin.getByTestId('session-player')).toContainText('Editör');
  await expect(admin.getByTestId('session-round')).toHaveCount(1);
  await expect(admin.getByTestId('session-round')).toContainText(tag);

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

test('an editor imports questions from a CSV file, row problems are shown first', async ({
  browser,
}) => {
  const tag = randomUUID().slice(0, 8);
  const admin = await adminPage(browser);
  await admin.goto('/admin/content/import');
  await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(admin.getByTestId('import-game')).toHaveValue('quiz');

  const download = admin.waitForEvent('download');
  await admin.getByTestId('import-template-csv').click();
  const template = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of template) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString('utf8')).toContain('soru;a;b;c;d;e;f;dogru');

  const csv = [
    'soru;a;b;c;dogru;zorluk;etiketler',
    `İçe aktarma ${tag} 1;Kırmızı;Mavi;;a;kolay;${tag}`,
    `İçe aktarma ${tag} 2;Bir;;;a;;${tag}`,
    `İçe aktarma ${tag} 3;Bir;İki;Üç;c;zor;${tag}`,
  ].join('\r\n');
  await admin.getByTestId('import-file').setInputFiles({
    name: 'sorular.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
  });
  await expect(admin.getByTestId('import-row')).toHaveCount(3);
  const bad = admin.locator('[data-testid="import-row"][data-ok="false"]');
  await expect(bad).toHaveAttribute('data-row', '3');
  await expect(bad.locator('[data-code="REQUIRED"]')).toContainText('b sütunu');
  await admin.getByTestId('import-commit').click();
  await expect(admin.getByTestId('import-done')).toContainText('2 içerik eklendi');

  // The imported drafts are in the list; delete them again.
  await admin.goto('/admin/content');
  await admin.getByTestId('content-search').fill(tag);
  await admin.getByTestId('content-search').press('Enter');
  await expect(admin.getByTestId('content-row')).toHaveCount(2);
  for (let left = 2; left > 0; left--) {
    await admin.getByTestId('content-row').first().getByRole('link').click();
    await admin.getByTestId('content-delete').click();
    await admin.getByTestId('content-delete-confirm').click();
    await expect(admin).toHaveURL(/\/admin\/content$/);
  }
  await admin.getByTestId('content-search').fill(tag);
  await admin.getByTestId('content-search').press('Enter');
  await expect(admin.getByTestId('content-row')).toHaveCount(0);
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

test('an editor writes content for the new games and changes a round’s game settings', async ({
  browser,
}) => {
  // Every browser reaches the server through the web app's address, so the whole suite shares
  // one REST rate-limit bucket: this test goes straight to its pages and reloads nothing.
  test.setTimeout(120_000);
  const tag = randomUUID().slice(0, 8);
  const admin = await adminPage(browser);
  await admin.goto('/admin/content');
  await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(admin).toHaveURL(/\/admin\/content$/);
  // Every registered game gets its own "new content" button.
  for (const gameType of [
    'quiz',
    'closestNumber',
    'sorting',
    'whoWould',
    'imageLocation',
    'bluff',
  ]) {
    await expect(admin.getByTestId(`content-new-${gameType}`)).toBeVisible();
  }

  // Closest Number: a missing answer is refused; typed numbers are grouped the Turkish way,
  // and come back the same from the server.
  await admin.goto('/admin/content/new?gameType=closestNumber');
  await admin.getByTestId('closest-editor-question').fill(`E2E tahmin ${tag}: kaç metre?`);
  await admin.getByTestId('content-save').click();
  await expect(admin.getByTestId('closest-editor-answer')).toHaveAttribute('aria-invalid', 'true');
  await admin.getByTestId('closest-editor-answer').fill('8848,5');
  await expect(admin.getByTestId('closest-editor-answer')).toHaveValue('8.848,5');
  await admin.getByTestId('closest-editor-unit').fill('m');
  await admin.getByTestId('content-save').click();
  await expect(admin).toHaveURL(/\/admin\/content\/[0-9a-f-]{36}$/);
  const closestId = admin.url().split('/').at(-1) ?? '';
  await expect(admin.getByTestId('closest-editor-answer')).toHaveValue('8.848,5');
  await expect(admin.getByTestId('closest-editor-unit')).toHaveValue('m');

  // Sorting: items in their correct order, one added, with end labels.
  await admin.goto('/admin/content/new?gameType=sorting');
  await admin.getByTestId('sorting-editor-question').fill(`E2E sıralama ${tag}`);
  await admin.getByTestId('sorting-editor-add-item').click();
  const items = admin.getByTestId('sorting-editor-item');
  for (const [index, text] of ['Bir', 'İki', 'Üç', 'Dört'].entries()) {
    await items.nth(index).fill(text);
  }
  await admin.getByTestId('sorting-editor-label-first').fill('Az');
  await admin.getByTestId('sorting-editor-label-last').fill('Çok');
  await admin.getByTestId('content-save').click();
  await expect(admin).toHaveURL(/\/admin\/content\/[0-9a-f-]{36}$/);
  await expect(items).toHaveCount(4);
  await expect(items.nth(3)).toHaveValue('Dört');

  // "Kim Yapar?"
  await admin.goto('/admin/content/new?gameType=whoWould');
  await admin.getByTestId('who-editor-question').fill(`E2E kim ${tag}?`);
  await admin.getByTestId('who-editor-title').fill('E2E Şampiyonu');
  await admin.getByTestId('content-save').click();
  await expect(admin).toHaveURL(/\/admin\/content\/[0-9a-f-]{36}$/);
  await expect(admin.getByTestId('who-editor-title')).toHaveValue('E2E Şampiyonu');

  // Image Location: upload an image, click the target on it; the point survives saving.
  await admin.goto('/admin/content/new?gameType=imageLocation');
  await admin.getByTestId('location-editor-question').fill(`E2E harita ${tag}: nerede?`);
  await admin.getByTestId('location-editor-image-choose').click();
  const picker = admin.getByTestId('media-picker');
  await picker.getByTestId('media-file').setInputFiles({
    name: `harita-${tag}.png`,
    mimeType: 'image/png',
    buffer: png(64, 48, [46, 74, 58]),
  });
  await picker.getByTestId('media-upload-submit').click();
  await expect(picker).toBeHidden();
  const canvas = admin.getByTestId('location-editor-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no editor canvas');
  await canvas.click({ position: { x: box.width / 2 + 120, y: box.height / 2 - 60 } });
  const target = admin.getByTestId('location-editor-target');
  await expect(target).not.toContainText('%50.0');
  const chosen = await target.innerText();
  await admin.getByTestId('content-save').click();
  await expect(admin).toHaveURL(/\/admin\/content\/[0-9a-f-]{36}$/);
  await expect(admin.getByTestId('location-editor-target')).toHaveText(chosen);

  // Bluff: a decoy that looks like the answer is refused by the server.
  await admin.goto('/admin/content/new?gameType=bluff');
  await admin.getByTestId('bluff-editor-question').fill(`E2E blöf ${tag}?`);
  await admin.getByTestId('bluff-editor-answer').fill('Üç');
  await admin.getByTestId('bluff-editor-decoy').nth(0).fill('UC');
  await admin.getByTestId('bluff-editor-decoy').nth(1).fill('Beş');
  await admin.getByTestId('content-save').click();
  await expect(admin.getByTestId('bluff-editor-decoy').nth(0)).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await admin.getByTestId('bluff-editor-decoy').nth(0).fill('Dört');
  await admin.getByTestId('content-save').click();
  await expect(admin).toHaveURL(/\/admin\/content\/[0-9a-f-]{36}$/);

  // A draft pack whose Closest Number round scores by rank; the change survives saving.
  await admin.goto('/admin/game-packs/new');
  await admin.getByTestId('pack-name').fill(`E2E ayarlar ${tag}`);
  await admin.getByTestId('pack-round-game').selectOption('closestNumber');
  await admin.getByTestId('pack-content-search').fill(tag);
  await admin.getByTestId('pack-content-search').press('Enter');
  await admin.locator(`[data-testid="pack-content-add"][data-content-id="${closestId}"]`).click();
  const settings = admin.getByTestId('pack-round-settings');
  await settings.locator('summary').click();
  await settings.getByTestId('closest-settings-scoring').selectOption('rank');
  await expect(settings.locator('summary')).toContainText('1 değişiklik');
  await admin.getByTestId('pack-save').click();
  await expect(admin).toHaveURL(/\/admin\/game-packs\/[0-9a-f-]{36}$/);
  await expect(admin.getByTestId('pack-round-game')).toHaveValue('closestNumber');
  await expect(settings.locator('summary')).toContainText('1 değişiklik');
  await settings.locator('summary').click();
  await expect(settings.getByTestId('closest-settings-scoring')).toHaveValue('rank');
  await admin.getByTestId('pack-delete').click();
  await admin.getByTestId('pack-delete-confirm').click();
  await expect(admin).toHaveURL(/\/admin\/game-packs$/);
  await admin.context().close();
});
