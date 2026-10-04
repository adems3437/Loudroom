import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const PHONE = devices['iPhone 15'];

/** The seeded "Casus Kim?" pack (apps/server/src/seed/tombala-spy-packs.ts): 3 rounds. */
const SPY_PACK_ID = '5beb4421-c8f7-49b5-b07e-b73b1bc3e676';

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

/** The round's spy and the others, read from the role cards. */
async function roles(phones: Phone[]): Promise<{ spy: Phone; town: Phone[] }> {
  const spies: Phone[] = [];
  const town: Phone[] = [];
  for (const phone of phones) {
    const role = phone.page.getByTestId('spy-role');
    await expect(role).toBeVisible();
    ((await role.getAttribute('data-spy')) === 'true' ? spies : town).push(phone);
  }
  expect(spies).toHaveLength(1);
  const [spy] = spies;
  if (!spy) throw new Error('no spy');
  return { spy, town };
}

test('casus kim: the spy never sees the place, gets caught, then names the place', async ({
  browser,
}) => {
  test.setTimeout(300_000);
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
    await joinAs(browser, joinPath, 'Deniz'),
  ];
  await expect(host.getByTestId('player-card')).toHaveCount(4);

  await host.locator(`[data-testid="pack-option"][data-pack-id="${SPY_PACK_ID}"]`).click();
  await host.getByTestId('start-game').click();
  const stage = host.getByTestId('spy-host');

  // ── Round 1: the spy is caught ──
  await expect(host.getByTestId('round-label')).toHaveText('Soru 1 / 3');
  const first = await roles(phones);
  const place = await first.town[0]?.page.getByTestId('spy-role').getAttribute('data-location-id');
  expect(place).toBeTruthy();
  for (const phone of first.town) {
    await expect(phone.page.getByTestId('spy-role')).toHaveAttribute(
      'data-location-id',
      place ?? '',
    );
  }

  await expect(stage).toHaveAttribute('data-phase', 'DISCUSS', { timeout: 20_000 });
  // Whoever's turn it is names who they ask; the TV shows it.
  const myTurn = () =>
    Promise.all(phones.map((phone) => phone.page.getByTestId('spy-my-turn').isVisible()));
  await expect.poll(async () => (await myTurn()).filter(Boolean).length).toBe(1);
  const asker = phones[(await myTurn()).indexOf(true)];
  if (!asker) throw new Error('nobody to ask');
  await asker.page.getByTestId('spy-ask-target').first().click();
  await expect(host.getByTestId('spy-last-ask')).toBeVisible();

  // Three of four ask to vote: a majority, the vote opens before the time is up.
  for (const phone of first.town) await phone.page.getByTestId('spy-request-vote').click();
  await expect(stage).toHaveAttribute('data-phase', 'VOTE');

  // Nothing told the spy or the TV the place, nor anyone who the spy is.
  const beforeReveal = {
    host: hostFrames.join('\n'),
    phones: phones.map((phone) => ({ phone, text: phone.frames.join('\n') })),
  };
  expect(beforeReveal.host).not.toContain('"location"');
  expect(beforeReveal.host).not.toContain('"spies"');
  for (const { phone, text } of beforeReveal.phones) {
    expect(text).not.toContain('"spies"');
    if (phone === first.spy) expect(text).not.toContain('"location"');
    else expect(text).not.toContain('"spy":true');
  }

  for (const phone of first.town) {
    await phone.page
      .locator('[data-testid="spy-vote-candidate"]', { hasText: first.spy.nickname })
      .click();
    await expect(phone.page.getByTestId('spy-vote-locked')).toBeVisible();
  }
  await first.spy.page.getByTestId('spy-vote-candidate').first().click();
  await expect(host.getByTestId('spy-outcome')).toHaveAttribute('data-outcome', 'caught');
  await expect(host.getByTestId('spy-location')).toHaveAttribute('data-location-id', place ?? '');
  await expect(first.spy.page.getByTestId('spy-player-reveal')).toHaveAttribute(
    'data-won',
    'false',
  );
  for (const phone of first.town) {
    await expect(phone.page.getByTestId('spy-player-reveal')).toHaveAttribute('data-won', 'true');
  }

  // ── Round 2: the spy names the place ──
  await host.getByTestId('next-step').click();
  await expect(host.getByTestId('round-label')).toHaveText('Soru 2 / 3');
  await expect(stage).toHaveAttribute('data-phase', 'DISCUSS', { timeout: 20_000 });
  const second = await roles(phones);
  const secret =
    (await second.town[0]?.page.getByTestId('spy-role').getAttribute('data-location-id')) ?? '';
  await second.spy.page.getByTestId('spy-guess-open').click();
  await second.spy.page
    .locator(`[data-testid="spy-guess-option"][data-location-id="${secret}"]`)
    .click();
  await second.spy.page.getByTestId('spy-guess-confirm').click();
  await expect(host.getByTestId('spy-outcome')).toHaveAttribute('data-outcome', 'guessed');
  await expect(second.spy.page.getByTestId('spy-player-reveal')).toHaveAttribute(
    'data-won',
    'true',
  );

  await Promise.all(
    [host, ...phones.map(({ page }) => page)].map((page) => page.context().close()),
  );
});
