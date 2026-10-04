import { devices, expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { adminSession, createPack, deletePack } from './admin-api';

const PHONE = devices['iPhone 15 landscape'];
const PORTRAIT = devices['iPhone 15'].viewport;

/** The seeded Okey content (apps/server/src/seed/board-packs.ts). */
const OKEY_CONTENT_ID = '9c2c70f5-0a29-4fda-b712-f7b16d369b82';

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
  return { page, frames, nickname };
}

const attribute = (locator: Locator, name: string) =>
  locator.getAttribute(name, { timeout: 2_000 }).catch(() => null);

/** Drags with the mouse from one element's centre to another's (dnd-kit's mouse sensor). */
async function drag(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('drag: element not visible');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

const slotOf = (page: Page, tile: string) =>
  page
    .locator(`[data-testid="okey-slot"]:has([data-testid="okey-rack-tile"][data-tile="${tile}"])`)
    .getAttribute('data-slot');

test('okey: the TV sets the match up, phones play the rack sideways, bots finish the hand', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const admin = await adminSession(browser);
  const packId = await createPack(admin, 'okey', OKEY_CONTENT_ID, {
    botDelayMs: 500,
    turnMs: 60_000,
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
  const ayse = await joinAs(browser, joinPath, 'Ayşe');
  const mehmet = await joinAs(browser, joinPath, 'Mehmet');
  await expect(host.getByTestId('player-card')).toHaveCount(2);
  await host.locator(`[data-testid="pack-option"][data-pack-id="${packId}"]`).click();
  await host.getByTestId('start-game').click();

  // Setup on the TV: two bots fill the empty seats; the host picks one hand from 10 points.
  const stage = host.getByTestId('okey-host');
  await expect(stage).toHaveAttribute('data-phase', 'SETUP');
  await expect(host.locator('[data-testid="okey-setup-seat"][data-bot="true"]')).toHaveCount(2);
  await expect(ayse.page.getByTestId('okey-player')).toHaveAttribute('data-phase', 'SETUP');
  await host.getByTestId('okey-hands-1').click();
  await host.getByTestId('okey-points-10').click();
  await host.getByTestId('okey-start').click();
  await expect(stage).toHaveAttribute('data-phase', 'TURN');
  await expect(host.getByTestId('okey-seat')).toHaveCount(4);

  // Held upright, the phone asks to be turned; sideways it shows the rack.
  await ayse.page.setViewportSize(PORTRAIT);
  await expect(ayse.page.getByTestId('okey-rotate')).toBeVisible();
  await ayse.page.setViewportSize(PHONE.viewport);
  await expect(ayse.page.getByTestId('okey-rack')).toBeVisible();
  expect([14, 15]).toContain(await ayse.page.getByTestId('okey-rack-tile').count());

  // Dragging a tile to an empty slot moves it there, and the rack stays so after a reload.
  const tile =
    (await ayse.page.getByTestId('okey-rack-tile').first().getAttribute('data-tile')) ?? '';
  const empty = ayse.page
    .locator('[data-testid="okey-slot"]:not(:has([data-testid="okey-rack-tile"]))')
    .last();
  const target = await empty.getAttribute('data-slot');
  await drag(
    ayse.page,
    ayse.page.locator(`[data-testid="okey-rack-tile"][data-tile="${tile}"]`),
    empty,
  );
  await expect.poll(() => slotOf(ayse.page, tile)).toBe(target);
  await ayse.page.reload();
  await expect(ayse.page.getByTestId('okey-rack')).toBeVisible();
  await expect.poll(() => slotOf(ayse.page, tile)).toBe(target);

  // A few turns by hand: draw (or take from the left), a wrong "Bitir", then discard by drag.
  const phones = [ayse, mehmet];
  let turns = 0;
  let took = false;
  let triedFinish = false;
  for (let step = 0; step < 200 && turns < 4; step++) {
    let acted = false;
    for (const { page } of phones) {
      if ((await attribute(page.getByTestId('okey-player'), 'data-my-turn')) !== 'true') continue;
      acted = true;
      const tiles = page.getByTestId('okey-rack-tile');
      if ((await tiles.count()) === 14) {
        const take = page.getByTestId('okey-take');
        const draw = page.getByTestId('okey-draw');
        if (!took && (await attribute(take, 'data-enabled')) === 'true') {
          await take.click();
          took = true;
        } else if ((await attribute(draw, 'data-enabled')) === 'true') {
          await drag(
            page,
            draw,
            page.locator('[data-testid="okey-slot"]:not(:has(button))').first(),
          );
        }
        await expect(tiles)
          .toHaveCount(15, { timeout: 5_000 })
          .catch(() => undefined);
      }
      if ((await tiles.count()) !== 15) continue;
      if (!triedFinish) {
        await tiles.first().click();
        await page.getByTestId('okey-finish').click();
        await expect(page.getByTestId('okey-error')).toBeVisible();
        triedFinish = true;
      }
      await drag(page, tiles.last(), page.getByTestId('okey-discard-zone'));
      await expect(tiles).toHaveCount(14);
      turns++;
    }
    if (!acted) await host.waitForTimeout(300);
  }
  expect(turns).toBeGreaterThanOrEqual(4);
  expect(took).toBe(true);
  expect(triedFinish).toBe(true);

  // The phones close: bots play every seat until the hand ends; one hand, then the podium.
  await Promise.all([ayse, mehmet].map(({ page }) => page.context().close()));
  await expect(host.getByTestId('okey-tally')).toBeVisible({ timeout: 180_000 });
  await expect(stage).toHaveAttribute('data-phase', 'END', { timeout: 30_000 });
  await expect(host.getByTestId('okey-rank')).toHaveCount(4);

  // Racks, the middle's order and the seed never left the server.
  for (const frames of [hostFrames, ayse.frames, mehmet.frames]) {
    expect(frames.join('\n')).not.toMatch(/"racks"|"deck":\[|"seed"/);
  }
  expect(hostFrames.join('\n')).not.toContain('"rack"');
  await host.getByTestId('next-step').click();
  await expect(host.getByTestId('podium')).toBeVisible();

  await host.context().close();
  await deletePack(admin, packId);
});
