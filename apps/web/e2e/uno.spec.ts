import { devices, expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { adminSession, createPack, deletePack } from './admin-api';

const PHONE = devices['iPhone 15'];

/** The seeded "Klasik UNO" content (apps/server/src/seed/card-packs.ts). */
const UNO_CONTENT_ID = '82a2e26f-29b5-42f6-8917-2dedc712546e';

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
  return { page, frames, nickname, open: true };
}

type Phone = Awaited<ReturnType<typeof joinAs>>;

/** An attribute, or null when the element is not there (e.g. the match just ended). */
const attribute = (locator: Locator, name: string) =>
  locator.getAttribute(name, { timeout: 2_000 }).catch(() => null);

const handCount = async (phone: Phone) =>
  Number(await attribute(phone.page.getByTestId('uno-player'), 'data-hand-count'));

/** The phone whose turn it is plays a card it may play, or draws (and passes). */
async function takeTurn(phone: Phone, sayUno: boolean) {
  const { page } = phone;
  const card = page.locator('[data-testid="hand-card"][data-playable="true"]').first();
  if (await card.count()) {
    if (sayUno && (await handCount(phone)) === 2) await page.getByTestId('uno-say').click();
    await card.click();
    const colors = page.getByTestId('uno-colors');
    if (await colors.isVisible()) await page.getByTestId('uno-color').first().click();
    else await page.getByTestId('uno-play').click();
    return;
  }
  await page.getByTestId('uno-draw').click();
  const pass = page.getByTestId('uno-pass');
  if (await pass.isVisible({ timeout: 1_000 }).catch(() => false)) await pass.click();
}

test('uno: phones play in turn, a forgotten "UNO!" is caught, a bot takes over, someone wins', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const admin = await adminSession(browser);
  const packId = await createPack(admin, 'uno', UNO_CONTENT_ID, { startingCards: 3 });

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
    await joinAs(browser, joinPath, 'Zeynep'),
  ];
  const [ayse, mehmet, zeynep] = phones as [Phone, Phone, Phone];
  await expect(host.getByTestId('player-card')).toHaveCount(3);
  await host.locator(`[data-testid="pack-option"][data-pack-id="${packId}"]`).click();
  await host.getByTestId('start-game').click();

  const stage = host.getByTestId('uno-host');
  await expect(stage).toHaveAttribute('data-phase', 'TURN');
  for (const phone of phones) {
    await expect(phone.page.getByTestId('hand-card')).not.toHaveCount(0);
  }
  // Hands never reach the TV, the draw pile no browser.
  expect(hostFrames.join('\n')).not.toContain('"hand"');

  let caught = false;
  for (let turn = 0; turn < 60; turn++) {
    if ((await attribute(stage, 'data-phase')) === 'END') break;
    // Enough seen (a catch, or plenty of turns, and the bot): the bots finish the match.
    if (!zeynep.open && (caught || turn >= 30)) break;

    // Mehmet forgets to say "UNO!": Ayşe catches him once.
    if (!caught && (await handCount(mehmet)) === 1) {
      const catchButton = ayse.page.getByTestId('uno-catch');
      if (await catchButton.isVisible()) {
        await catchButton.click();
        await expect(host.getByTestId('uno-last')).toHaveAttribute('data-kind', 'caught');
        await expect.poll(() => handCount(mehmet)).toBe(3);
        caught = true;
      }
    }
    // After the first move Zeynep's phone goes away: a bot plays for her.
    if (turn === 1 && zeynep.open) {
      await zeynep.page.context().close();
      zeynep.open = false;
    }

    const active = [];
    for (const phone of phones.filter((p) => p.open)) {
      if ((await attribute(phone.page.getByTestId('uno-player'), 'data-my-turn')) === 'true') {
        active.push(phone);
      }
    }
    if (active[0]) {
      const before = await attribute(
        stage.locator('[data-testid="table-seat"][data-active="true"]'),
        'data-player-id',
      );
      await takeTurn(active[0], active[0] !== mehmet || caught);
      await expect(stage.locator('[data-testid="table-seat"][data-active="true"]'))
        .not.toHaveAttribute('data-player-id', before ?? '', { timeout: 5_000 })
        .catch(() => undefined);
    } else {
      // Zeynep's turn: the bot moves after its short pause.
      if (!zeynep.open) {
        await expect(stage.getByText('🤖'))
          .toBeVisible({ timeout: 5_000 })
          .catch(() => undefined);
      }
      await host.waitForTimeout(800);
    }
  }

  // Everyone else goes too: bots play every seat until someone wins.
  for (const phone of [ayse, mehmet]) await phone.page.context().close();
  await expect(stage).toHaveAttribute('data-phase', 'END', { timeout: 180_000 });
  await expect(host.getByTestId('uno-rank')).toHaveCount(3);
  // A bot played Zeynep's turns: the TV was told so.
  expect(hostFrames.join('\n')).toContain('"bot":true');
  for (const frames of [hostFrames, ayse.frames, mehmet.frames]) {
    expect(frames.join('\n')).not.toContain('"deck"');
  }
  await host.getByTestId('next-step').click();
  await expect(host.getByTestId('podium')).toBeVisible();

  await host.context().close();
  await deletePack(admin, packId);
});
