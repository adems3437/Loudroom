import { devices, expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { adminSession, createPack, deletePack } from './admin-api';

const PHONE = devices['iPhone 15'];

/** The seeded Kızma Birader content (apps/server/src/seed/board-packs.ts). */
const KIZMA_CONTENT_ID = 'd33eb2a4-7e33-429e-ace1-f7f32d74b80b';

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
  return { page, frames, open: true };
}

const attribute = (locator: Locator, name: string) =>
  locator.getAttribute(name, { timeout: 2_000 }).catch(() => null);

test('kızma birader: phones roll and move, a bot takes over, someone gets home first', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const admin = await adminSession(browser);
  const packId = await createPack(admin, 'kizmaBirader', KIZMA_CONTENT_ID, { pawns: 1 });

  const host = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  const hostFrames = recordFrames(host);
  await host.goto('/host/create');
  await host.getByTestId('create-room').click();
  await expect(host).toHaveURL(/\/host\/room\/\d{6}$/);
  const joinUrl = (await host.getByTestId('join-url').getAttribute('data-url')) ?? '';
  const joinPath = new URL(joinUrl).pathname;
  const ayse = await joinAs(browser, joinPath, 'Ayşe');
  const mehmet = await joinAs(browser, joinPath, 'Mehmet');
  await expect(host.getByTestId('player-card')).toHaveCount(2);
  await host.locator(`[data-testid="pack-option"][data-pack-id="${packId}"]`).click();
  await host.getByTestId('start-game').click();

  const stage = host.getByTestId('kizma-host');
  await expect(stage).toHaveAttribute('data-phase', /^(ROLL|MOVE)$/);
  await expect(host.getByTestId('kizma-board-pawn')).toHaveCount(2);

  let rolls = 0;
  for (let step = 0; step < 300; step++) {
    if ((await attribute(stage, 'data-phase')) === 'END') break;
    // After a few rolls Mehmet's phone goes away: a bot plays his turns.
    if (rolls === 4 && mehmet.open) {
      await mehmet.page.context().close();
      mehmet.open = false;
    }
    const phones = [ayse, mehmet].filter((phone) => phone.open);
    let moved = false;
    for (const phone of phones) {
      if ((await attribute(phone.page.getByTestId('kizma-player'), 'data-my-turn')) !== 'true')
        continue;
      const roll = phone.page.getByTestId('kizma-roll');
      const pawn = phone.page.locator('[data-testid="kizma-pawn"][data-movable="true"]').first();
      // The turn can move on between looking and tapping: never wait long for a button.
      if (await roll.isVisible()) {
        await roll.click({ timeout: 2_000 }).catch(() => undefined);
        rolls++;
        moved = true;
      } else if (await pawn.isVisible()) {
        await pawn.click({ timeout: 2_000 }).catch(() => undefined);
        moved = true;
      }
      break;
    }
    if (!moved) await host.waitForTimeout(300);
  }

  await expect(stage).toHaveAttribute('data-phase', 'END', { timeout: 120_000 });
  await expect(host.getByTestId('kizma-result')).toBeVisible();
  // The bot rolled for Mehmet: the TV was told so.
  expect(hostFrames.join('\n')).toContain('"bot":true');
  // The dice seed never left the server.
  for (const frames of [hostFrames, ayse.frames, mehmet.frames]) {
    expect(frames.join('\n')).not.toMatch(/"seed"|"rolls"/);
  }
  await host.getByTestId('next-step').click();
  await expect(host.getByTestId('podium')).toBeVisible();

  await Promise.all([host, ayse.page].map((page) => page.context().close()));
  await deletePack(admin, packId);
});
