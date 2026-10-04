import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { adminSession, createPack, deletePack } from './admin-api';

const PHONE = devices['iPhone 15'];

/** The seeded "Pişti" content (apps/server/src/seed/card-packs.ts). */
const PISTI_CONTENT_ID = '0ff21f83-19d1-471d-b27b-f862646de072';

function recordFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      frames.push(typeof payload === 'string' ? payload : payload.toString('utf8'));
    });
  });
  return frames;
}

async function joinAs(browser: Browser, joinPath: string, nickname: string) {
  const page = await (await browser.newContext({ ...PHONE })).newPage();
  const frames = recordFrames(page);
  await page.goto(joinPath);
  await page.getByTestId('nickname-input').fill(nickname);
  await page.getByTestId('join-button').click();
  await expect(page.getByTestId('my-nickname')).toHaveText(nickname);
  return { page, frames };
}

test('pişti: two phones play a deal, the table is taken, the deal is scored', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const admin = await adminSession(browser);
  const packId = await createPack(admin, 'pisti', PISTI_CONTENT_ID, {
    maxDeals: 1,
    targetPoints: 0,
  });

  const host = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  const hostFrames = recordFrames(host);
  await host.goto('/host/create');
  await host.getByTestId('create-room').click();
  await expect(host).toHaveURL(/\/host\/room\/\d{6}$/);
  const joinUrl = (await host.getByTestId('join-url').getAttribute('data-url')) ?? '';
  const joinPath = new URL(joinUrl).pathname;
  const phones = [
    await joinAs(browser, joinPath, 'Ayşe'),
    await joinAs(browser, joinPath, 'Mehmet'),
  ];
  await expect(host.getByTestId('player-card')).toHaveCount(2);
  await host.locator(`[data-testid="pack-option"][data-pack-id="${packId}"]`).click();
  await host.getByTestId('start-game').click();

  const stage = host.getByTestId('pisti-host');
  await expect(stage).toHaveAttribute('data-phase', 'TURN');
  // Four on the table (three face down), four in each hand.
  await expect(host.getByTestId('pisti-pile')).toHaveAttribute('data-count', '4');
  for (const { page } of phones) await expect(page.getByTestId('hand-card')).toHaveCount(4);

  let taken = false;
  for (let turn = 0; turn < 48; turn++) {
    const player = (
      await Promise.all(
        phones.map(async (phone) =>
          (await phone.page.getByTestId('pisti-player').getAttribute('data-my-turn')) === 'true'
            ? phone
            : null,
        ),
      )
    ).find((phone) => phone !== null);
    if (!player) {
      await host.waitForTimeout(300);
      turn--;
      continue;
    }
    const count = await player.page.getByTestId('pisti-player').getAttribute('data-hand-count');
    await player.page.getByTestId('hand-card').first().click();
    await player.page.getByTestId('pisti-throw').click();
    await expect(player.page.getByTestId('pisti-player')).not.toHaveAttribute(
      'data-hand-count',
      count ?? '',
    );
    if ((await host.getByTestId('pisti-last').getAttribute('data-captured')) === 'true') {
      taken = true;
    }
    if ((await stage.getAttribute('data-phase')) === 'TALLY') break;
  }

  // The deal is scored: all 52 cards went to someone.
  await expect(stage).toHaveAttribute('data-phase', 'TALLY');
  const rows = host.getByTestId('pisti-tally-row');
  await expect(rows).toHaveCount(2);
  const cards = await rows.evaluateAll((list) =>
    list.map((row) => Number(row.getAttribute('data-cards'))),
  );
  expect(cards.reduce((sum, count) => sum + count, 0)).toBe(52);
  expect(taken).toBe(true);

  // One deal was asked for: the match ends.
  await expect(stage).toHaveAttribute('data-phase', 'END', { timeout: 15_000 });
  await expect(host.getByTestId('pisti-side')).toHaveCount(2);
  for (const { page } of phones) await expect(page.getByTestId('pisti-player-end')).toBeVisible();
  for (const frames of [hostFrames, ...phones.map((phone) => phone.frames)]) {
    expect(frames.join('\n')).not.toContain('"deck"');
  }
  expect(hostFrames.join('\n')).not.toContain('"hand"');
  await host.getByTestId('next-step').click();
  await expect(host.getByTestId('podium')).toBeVisible();

  await Promise.all(
    [host, ...phones.map(({ page }) => page)].map((page) => page.context().close()),
  );
  await deletePack(admin, packId);
});
