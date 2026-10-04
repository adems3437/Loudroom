import { devices, expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { adminSession, createPack, deletePack } from './admin-api';

const PHONE = devices['iPhone 15'];

/** The seeded Amiral Battı content (apps/server/src/seed/board-packs.ts). */
const AMIRAL_CONTENT_ID = 'c0f6a339-3e9c-45c2-92f4-f418138edf80';

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

type Phone = Awaited<ReturnType<typeof joinAs>>;

const attribute = (locator: Locator, name: string) =>
  locator.getAttribute(name, { timeout: 2_000 }).catch(() => null);

/** The fleets a phone was sent (from its game:state frames). */
function fleetsIn(frames: readonly string[]): string[] {
  const fleets = new Set<string>();
  for (const frame of frames) {
    const match = /^\d+(\[.*)$/s.exec(frame);
    if (!match?.[1]) continue;
    try {
      const [event, payload] = JSON.parse(match[1]) as [
        string,
        { round?: { view?: { fleet?: unknown } } },
      ];
      const fleet = payload.round?.view?.fleet;
      if (event === 'game:state' && Array.isArray(fleet)) fleets.add(JSON.stringify(fleet));
    } catch {
      // not a JSON event frame
    }
  }
  return [...fleets];
}

async function open(browser: Browser, packId: string, names: string[]) {
  const host = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  const hostFrames = recordFrames(host);
  await host.goto('/host/create');
  await host.getByTestId('create-room').click();
  await expect(host).toHaveURL(/\/host\/room\/\d{6}$/);
  const joinUrl = (await host.getByTestId('join-url').getAttribute('data-url')) ?? '';
  const joinPath = new URL(joinUrl).pathname;
  const phones: Phone[] = [];
  for (const name of names) phones.push(await joinAs(browser, joinPath, name));
  await expect(host.getByTestId('player-card')).toHaveCount(names.length);
  await host.locator(`[data-testid="pack-option"][data-pack-id="${packId}"]`).click();
  await host.getByTestId('start-game').click();
  return { host, hostFrames, phones };
}

/** Plays until the match ends: placers lay out at random, shooters aim at the first free cell and fire. */
async function playOut(host: Page, phones: Phone[]) {
  const stage = host.getByTestId('amiral-host');
  for (let step = 0; step < 600; step++) {
    if ((await attribute(stage, 'data-phase')) === 'END') return;
    let acted = false;
    for (const { page } of phones) {
      const placer = page.getByTestId('amiral-placer');
      if (await placer.isVisible()) {
        await page
          .getByTestId('amiral-random')
          .click({ timeout: 2_000 })
          .catch(() => undefined);
        await page
          .getByTestId('amiral-ready-button')
          .click({ timeout: 2_000 })
          .catch(() => undefined);
        acted = true;
        continue;
      }
      if ((await attribute(page.getByTestId('amiral-player'), 'data-can-shoot')) === 'true') {
        const cell = page.locator('button[data-testid="amiral-target-cell"]').first();
        if (await cell.isVisible()) {
          await cell.click({ timeout: 2_000 }).catch(() => undefined);
          await page
            .getByTestId('amiral-fire')
            .click({ timeout: 2_000 })
            .catch(() => undefined);
          acted = true;
        }
      }
    }
    if (!acted) await host.waitForTimeout(250);
  }
}

test('amiral battı teams: captains lay out fleets, members take turns, a team wins', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const admin = await adminSession(browser);
  const packId = await createPack(admin, 'amiralBatti', AMIRAL_CONTENT_ID, {
    mode: 'teams',
    fleet: 'mini',
  });
  const { host, hostFrames, phones } = await open(browser, packId, [
    'Ayşe',
    'Mehmet',
    'Zeynep',
    'Deniz',
  ]);
  const [ayse, mehmet, zeynep, deniz] = phones as [Phone, Phone, Phone, Phone];

  const stage = host.getByTestId('amiral-host');
  await expect(stage).toHaveAttribute('data-phase', 'PLACE');
  // Only the captains (the first of each team) place.
  await expect(ayse.page.getByTestId('amiral-placer')).toBeVisible();
  await expect(mehmet.page.getByTestId('amiral-placer')).toBeVisible();
  await expect(zeynep.page.getByTestId('amiral-waiting')).toBeVisible();

  // The shooter's phone opens on the enemy board; everyone else watches their own fleet. A
  // tap only aims: the shot goes with "Ateş!".
  for (const { page } of [ayse, mehmet]) {
    await page.getByTestId('amiral-random').click();
    await page.getByTestId('amiral-ready-button').click();
  }
  await expect(stage).toHaveAttribute('data-phase', 'BATTLE');
  const canShoot = (phone: Phone) =>
    phone.page.locator('[data-testid="amiral-player"][data-can-shoot="true"]');
  const shooterName = async () =>
    (await canShoot(ayse).isVisible())
      ? ayse.nickname
      : (await canShoot(mehmet).isVisible())
        ? mehmet.nickname
        : null;
  await expect.poll(shooterName).not.toBeNull();
  const shooter = (await shooterName()) === ayse.nickname ? ayse : mehmet;
  for (const phone of phones.filter((p) => p !== shooter)) {
    await expect(phone.page.getByTestId('amiral-tab-own')).toHaveAttribute('aria-pressed', 'true');
    await expect(phone.page.getByTestId('amiral-own')).toBeVisible();
  }
  const fire = shooter.page.getByTestId('amiral-fire');
  const c2 = shooter.page.locator('[data-testid="amiral-target-cell"][data-x="2"][data-y="1"]');
  await expect(shooter.page.getByTestId('amiral-tab-target')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(fire).toBeDisabled();
  await c2.click();
  await expect(c2).toHaveAttribute('data-aimed', 'true');
  await expect(fire).toHaveText(/C2/);
  await expect(canShoot(shooter)).toBeVisible();
  await fire.click();
  await expect(c2).toHaveAttribute('data-state', /^(hit|miss|sunk)$/);
  await expect(canShoot(shooter)).toBeHidden();

  await playOut(host, phones);
  await expect(stage).toHaveAttribute('data-phase', 'END', { timeout: 30_000 });
  await expect(host.getByTestId('amiral-result')).toBeVisible();
  await expect(host.getByTestId('amiral-rank')).toHaveCount(4);

  // Each team's fleet reached its own phones only, and the TV none.
  expect(hostFrames.join('\n')).not.toContain('"fleet":[');
  const fleetA = fleetsIn(ayse.frames);
  const fleetB = fleetsIn(mehmet.frames);
  expect(fleetA.length).toBeGreaterThan(0);
  expect(fleetsIn(zeynep.frames)).toEqual(fleetA);
  for (const fleet of fleetA) {
    expect([...mehmet.frames, ...deniz.frames].join('\n')).not.toContain(fleet);
  }
  for (const fleet of fleetB)
    expect([...ayse.frames, ...zeynep.frames].join('\n')).not.toContain(fleet);

  await host.getByTestId('next-step').click();
  await expect(host.getByTestId('podium')).toBeVisible();
  await Promise.all(
    [host, ...phones.map(({ page }) => page)].map((page) => page.context().close()),
  );
  await deletePack(admin, packId);
});

test('amiral battı tournament: parallel duels, a final, one champion', async ({ browser }) => {
  test.setTimeout(300_000);
  const admin = await adminSession(browser);
  const packId = await createPack(admin, 'amiralBatti', AMIRAL_CONTENT_ID, {
    mode: 'tournament',
    fleet: 'mini',
  });
  const { host, phones } = await open(browser, packId, ['Ayşe', 'Mehmet', 'Zeynep', 'Deniz']);
  const stage = host.getByTestId('amiral-host');
  await expect(stage).toHaveAttribute('data-phase', 'PLACE');
  await expect(host.getByTestId('amiral-pair')).toHaveCount(2);

  await playOut(host, phones);
  await expect(stage).toHaveAttribute('data-phase', 'END', { timeout: 30_000 });
  const places = await host
    .getByTestId('amiral-rank')
    .evaluateAll((rows) => rows.map((row) => Number(row.getAttribute('data-place'))));
  expect(places).toEqual([1, 2, 3, 3]);

  await host.getByTestId('next-step').click();
  await expect(host.getByTestId('podium')).toBeVisible();
  await Promise.all(
    [host, ...phones.map(({ page }) => page)].map((page) => page.context().close()),
  );
  await deletePack(admin, packId);
});
