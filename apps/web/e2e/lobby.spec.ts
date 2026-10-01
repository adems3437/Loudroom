import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const PHONE = devices['iPhone 15'];

async function openHost(browser: Browser): Promise<{ host: Page; joinUrl: string }> {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await context.newPage();
  await host.goto('/host/create');
  await host.getByTestId('create-room').click();
  await expect(host).toHaveURL(/\/host\/room\/[1-9]\d{5}$/);
  const joinUrl = await host.getByTestId('join-url').getAttribute('data-url');
  if (!joinUrl) throw new Error('join link missing');
  return { host, joinUrl };
}

/** Opens the join link on a new phone and joins with the given nickname. */
async function joinAs(browser: Browser, joinUrl: string, nickname: string): Promise<Page> {
  const context = await browser.newContext({ ...PHONE });
  const phone = await context.newPage();
  // The join link points at PUBLIC_URL; tests may run against another base URL.
  await phone.goto(new URL(joinUrl).pathname);
  await phone.getByTestId('nickname-input').fill(nickname);
  await phone.getByTestId('avatar-option-star').click();
  await phone.getByTestId('join-button').click();
  await expect(phone.getByTestId('my-nickname')).toHaveText(nickname);
  return phone;
}

function hostCard(host: Page, nickname: string) {
  return host.locator(`[data-testid="player-card"][data-nickname="${nickname}"]`);
}

test('host opens a room, three phones join, one reloads into the same slot, one is kicked', async ({
  browser,
}) => {
  const { host, joinUrl } = await openHost(browser);
  const roomCode = await host.getByTestId('room-code').getAttribute('data-code');
  expect(joinUrl).toMatch(new RegExp(`/play/${roomCode ?? 'x'}$`));
  await expect(host.getByTestId('qr-code')).toBeVisible();

  const ayse = await joinAs(browser, joinUrl, 'Ayşe');
  const mehmet = await joinAs(browser, joinUrl, 'Mehmet');
  const zeynep = await joinAs(browser, joinUrl, 'Zeynep');

  // All three appear on the host screen in real time.
  await expect(host.getByTestId('player-card')).toHaveCount(3);
  await expect(host.getByTestId('player-count')).toHaveText('3 / 12');
  await expect(mehmet.getByText('Ayşe')).toBeVisible();

  // Ready state reaches the host.
  await ayse.getByTestId('ready-toggle').click();
  await expect(ayse.getByTestId('ready-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(hostCard(host, 'Ayşe')).toHaveAttribute('data-ready', 'true');

  // Mehmet reloads: same slot (same player id), no duplicate on the host.
  const mehmetId = await mehmet.getByTestId('player-lobby').getAttribute('data-player-id');
  await mehmet.reload();
  await expect(mehmet.getByTestId('player-lobby')).toHaveAttribute(
    'data-player-id',
    mehmetId ?? '',
  );
  await expect(mehmet.getByTestId('my-nickname')).toHaveText('Mehmet');
  await expect(host.getByTestId('player-card')).toHaveCount(3);
  await expect(hostCard(host, 'Mehmet')).toHaveAttribute('data-player-id', mehmetId ?? '');
  await expect(hostCard(host, 'Mehmet')).toHaveAttribute('data-connected', 'true');

  // The host kicks Zeynep: gone from the host screen, told so on her phone.
  await hostCard(host, 'Zeynep').getByTestId('kick-button').click();
  await hostCard(host, 'Zeynep').getByTestId('kick-confirm').click();
  await expect(host.getByTestId('player-card')).toHaveCount(2);
  await expect(hostCard(host, 'Zeynep')).toHaveCount(0);
  await expect(zeynep.getByTestId('kicked-screen')).toBeVisible();
  // …and a reload does not bring her back.
  await zeynep.reload();
  await expect(zeynep.getByTestId('nickname-input')).toBeVisible();
  await expect(host.getByTestId('player-card')).toHaveCount(2);

  // Locking the room keeps newcomers out.
  await host.getByTestId('lock-toggle').click();
  await expect(host.getByTestId('lock-toggle')).toHaveAttribute('aria-pressed', 'true');
  const late = await (await browser.newContext({ ...PHONE })).newPage();
  await late.goto(new URL(joinUrl).pathname);
  await late.getByTestId('nickname-input').fill('Geç Kalan');
  await late.getByTestId('join-button').click();
  await expect(late.getByTestId('form-error')).toHaveText('Oda kilitli, şu an katılım kapalı.');
  await expect(host.getByTestId('player-card')).toHaveCount(2);

  await Promise.all([host, ayse, mehmet, zeynep, late].map((page) => page.context().close()));
});

test('the host screen survives a reload and keeps its room', async ({ browser }) => {
  const { host } = await openHost(browser);
  const roomCode = await host.getByTestId('room-code').getAttribute('data-code');
  await host.reload();
  await expect(host.getByTestId('room-code')).toHaveAttribute('data-code', roomCode ?? '');
  await host.context().close();
});

test('a phone can enter the room code by hand', async ({ browser }) => {
  const { host } = await openHost(browser);
  const roomCode = (await host.getByTestId('room-code').getAttribute('data-code')) ?? '';
  const phone = await (await browser.newContext({ ...PHONE })).newPage();

  await phone.goto('/play');
  await phone.getByTestId('room-code-input').fill('12');
  await phone.getByTestId('continue-button').click();
  await expect(phone.getByTestId('code-error')).toBeVisible();

  await phone.getByTestId('room-code-input').fill(roomCode);
  await phone.getByTestId('continue-button').click();
  await expect(phone).toHaveURL(new RegExp(`/play/${roomCode}$`));
  await phone.getByTestId('nickname-input').fill('Elle Giren');
  await phone.getByTestId('join-button').click();
  await expect(hostCard(host, 'Elle Giren')).toBeVisible();

  await Promise.all([host, phone].map((page) => page.context().close()));
});
