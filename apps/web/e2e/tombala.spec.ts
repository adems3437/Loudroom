import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const PHONE = devices['iPhone 15'];

/** The seeded "Tombala Gecesi" pack (apps/server/src/seed/tombala-spy-packs.ts): one round. */
const TOMBALA_PACK_ID = '0062b11a-97d7-477b-a292-b92da1d0b854';

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

/** The phone's card, row by row. */
async function cardRows(page: Page): Promise<number[][]> {
  const rows: number[][] = [[], [], []];
  for (const cell of await page.getByTestId('tombala-cell').all()) {
    const row = Number(await cell.getAttribute('data-row'));
    rows[row]?.push(Number(await cell.getAttribute('data-number')));
  }
  return rows;
}

async function drawnOnTv(host: Page): Promise<Set<number>> {
  const cells = host.locator('[data-testid="tombala-board-cell"][data-drawn="true"]');
  const numbers = await cells.evaluateAll((list) =>
    list.map((cell) => Number(cell.getAttribute('data-number'))),
  );
  return new Set(numbers);
}

test('tombala: the host draws, phones mark, a wrong call is locked, a full row wins', async ({
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
  const [ayse, mehmet, zeynep] = [
    await joinAs(browser, joinPath, 'Ayşe'),
    await joinAs(browser, joinPath, 'Mehmet'),
    await joinAs(browser, joinPath, 'Zeynep'),
  ];
  await expect(host.getByTestId('player-card')).toHaveCount(3);

  await host.locator(`[data-testid="pack-option"][data-pack-id="${TOMBALA_PACK_ID}"]`).click();
  await host.getByTestId('start-game').click();

  // Every phone has its own card before the first number.
  for (const { page } of [ayse, mehmet, zeynep]) {
    await expect(page.getByTestId('tombala-cell')).toHaveCount(15);
  }
  const rows = await cardRows(ayse.page);
  expect(rows.map((row) => row.length)).toEqual([5, 5, 5]);
  expect(await cardRows(mehmet.page)).not.toEqual(rows);

  // The host draws the first number without waiting for the intro.
  const stage = host.getByTestId('tombala-host');
  await host.getByTestId('tombala-draw').click();
  await expect(stage).toHaveAttribute('data-phase', 'DRAW');

  // A number that has not been drawn cannot be marked.
  let drawn = await drawnOnTv(host);
  const notYet = rows.flat().find((number) => !drawn.has(number)) ?? 0;
  await ayse.page.locator(`[data-testid="tombala-cell"][data-number="${notYet}"]`).click();
  await expect(ayse.page.getByTestId('tombala-notice')).toContainText(String(notYet));
  await expect(
    ayse.page.locator(`[data-testid="tombala-cell"][data-number="${notYet}"]`),
  ).toHaveAttribute('data-marked', 'false');

  // Mehmet calls far too early: the call is wrong and he is locked out for a few draws.
  await mehmet.page.getByTestId('tombala-claim').click();
  await expect(mehmet.page.getByTestId('tombala-locked')).toBeVisible();
  await expect(mehmet.page.getByTestId('tombala-claim')).toBeDisabled();

  // The host draws until one of Ayşe's rows is full.
  const fullRow = () => rows.find((row) => row.every((number) => drawn.has(number)));
  while (!fullRow()) {
    const count = Number(await stage.getAttribute('data-drawn-count'));
    await host.getByTestId('tombala-draw').click();
    await expect(stage).not.toHaveAttribute('data-drawn-count', String(count));
    drawn = await drawnOnTv(host);
  }
  const row = fullRow() ?? [];
  for (const number of row) {
    await ayse.page.locator(`[data-testid="tombala-cell"][data-number="${number}"]`).click();
    await expect(
      ayse.page.locator(`[data-testid="tombala-cell"][data-number="${number}"]`),
    ).toHaveAttribute('data-marked', 'true');
  }
  await ayse.page.getByTestId('tombala-claim').click();
  await expect(host.getByTestId('tombala-claim-banner')).toHaveAttribute('data-prize', 'firstLine');
  // Drawing stops a few seconds for the prize; the other phones hear about it.
  await expect(zeynep.page.getByTestId('tombala-claim-news')).toContainText('Ayşe');
  await expect(ayse.page.getByTestId('tombala-my-prizes')).toHaveAttribute(
    'data-prizes',
    'firstLine',
  );
  await expect(
    host.locator('[data-testid="tombala-prize"][data-prize="firstLine"]'),
  ).not.toHaveAttribute('data-winners', '');

  // The host ends the game early: the prize is kept.
  await host.getByTestId('skip-round').click();
  await expect(stage).toHaveAttribute('data-phase', 'REVEAL');
  await host.getByTestId('next-step').click();
  await expect(host.getByTestId('podium')).toBeVisible();

  // The bag's order never reached a browser.
  for (const frames of [hostFrames, ayse.frames, mehmet.frames, zeynep.frames]) {
    expect(frames.join('\n')).not.toContain('"bag"');
  }
  await Promise.all(
    [host, ayse.page, mehmet.page, zeynep.page].map((page) => page.context().close()),
  );
});
