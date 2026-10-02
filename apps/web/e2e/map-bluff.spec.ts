import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const PHONE = devices['iPhone 15'];

/** The seeded "Harita ve Blöf" pack (apps/server/src/seed/map-pack.ts): 3 + 3 questions. */
const MAP_PACK_ID = '3a25bd2f-7809-45bb-8b86-f5241ad04bde';
const TOTAL_ROUNDS = 6;

/** Real answers of the seeded Bluff questions, by a piece of the question. */
const SEEDED_ANSWERS: [string, string][] = [
  ['ahtapot', 'üç'],
  ['Bal arıları', 'yiyeceğin yerini'],
  ['Geriye doğru', 'sinekkuşu'],
  ['Mısır', 'kalp'],
  ['Kediler', 'tatlı'],
  ['zürafa', 'yedi'],
  ['fethinde', 'haliç'],
  ['Wombat', 'küp'],
  ['yıldırım', 'güneş'],
  ['denizanası', 'hiç'],
];

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

function since(all: string[][], marks: number[]): string {
  return all.map((frames, index) => frames.slice(marks[index] ?? 0).join('\n')).join('\n');
}

test('maps and bluffs: pins on the image, lies refused when too close, staged reveal', async ({
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
  ];
  const allFrames = [hostFrames, ...phones.map((phone) => phone.frames)];
  await expect(host.getByTestId('player-card')).toHaveCount(3);

  await host.locator(`[data-testid="pack-option"][data-pack-id="${MAP_PACK_ID}"]`).click();
  await host.getByTestId('start-game').click();

  const seen = new Set<string>();
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    await expect(host.getByTestId('round-label')).toHaveText(`Soru ${round} / ${TOTAL_ROUNDS}`);
    const open = host.locator('[data-phase="ANSWERING"], [data-phase="WRITE"]');
    await expect(open).toBeVisible();
    const game = (await open.getAttribute('data-testid')) ?? '';
    const first = !seen.has(game);
    seen.add(game);
    const marks = allFrames.map((frames) => frames.length);

    if (game === 'location-host') {
      // Each phone taps a different spot on the image, moves it once, then sends.
      const spots = [
        [0.3, 0.4],
        [0.6, 0.5],
        [0.8, 0.7],
      ] as const;
      for (const [index, { page }] of phones.entries()) {
        const image = page.getByTestId('location-image');
        const box = await image.boundingBox();
        if (!box) throw new Error('no image');
        const [fx, fy] = spots[index] ?? [0.5, 0.5];
        await image.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
        await expect(page.getByTestId('location-my-pin')).toBeVisible();
        await image.click({ position: { x: box.width * fx, y: box.height * fy } });
        await page.getByTestId('location-submit').click();
        if (index < phones.length - 1) {
          await expect(page.getByTestId('location-player-locked')).toBeVisible();
          if (first) expect(since(allFrames, marks)).not.toContain('"target"');
        }
      }
      await expect(
        host.locator('[data-testid="location-host"][data-phase="REVEAL"]'),
      ).toBeVisible();
      await expect(host.getByTestId('location-target')).toBeVisible();
      await expect(host.getByTestId('location-pin')).toHaveCount(3);
      await expect(host.getByTestId('location-ranking-row')).toHaveCount(3);
      for (const { page } of phones) {
        await expect(page.getByTestId('location-player-reveal')).toBeVisible();
      }
    } else if (game === 'bluff-host') {
      for (const [index, { page }] of phones.entries()) {
        const question = (await page.getByTestId('bluff-player-write').innerText()).split('\n')[0];
        const answer = SEEDED_ANSWERS.find(([piece]) => question?.includes(piece))?.[1];
        expect(answer, question).toBeDefined();
        // Writing the real answer is refused: the player must invent something else.
        await page.getByTestId('bluff-input').fill(answer ?? '');
        await page.getByTestId('bluff-submit').click();
        await expect(page.getByTestId('bluff-error')).toContainText('çok yakın');
        await page.getByTestId('bluff-input').fill(`Uydurma ${round}${index}`);
        await page.getByTestId('bluff-submit').click();
        if (index < phones.length - 1) {
          await expect(page.getByTestId('bluff-player-written')).toBeVisible();
        }
      }
      await expect(host.locator('[data-testid="bluff-host"][data-phase="VOTE"]')).toBeVisible();
      await expect(host.getByTestId('bluff-host-option')).toHaveCount(4);
      for (const [index, { page }] of phones.entries()) {
        await expect(page.locator('[data-testid="bluff-option"][data-own="true"]')).toHaveCount(1);
        await page.locator('[data-testid="bluff-option"][data-own="false"]').first().click();
        if (index < phones.length - 1) {
          await expect(page.getByTestId('bluff-player-voted')).toBeVisible();
        }
      }
      // Before the reveal no browser learns the truth or who wrote which lie.
      if (first) expect(since(allFrames, marks)).not.toMatch(/"truth"|"authors"|"fooled/);
      await expect(host.locator('[data-testid="bluff-host"][data-phase="REVEAL"]')).toBeVisible();
      await expect(host.getByTestId('bluff-reveal-step')).toBeVisible();
      for (const { page } of phones) {
        await expect(page.getByTestId('bluff-player-revealing')).toBeVisible();
      }
      // The staged reveal ends with the truth; then phones show how they did.
      await expect(host.getByTestId('bluff-reveal-step')).toHaveAttribute('data-kind', 'truth', {
        timeout: 30_000,
      });
      for (const { page } of phones) {
        await expect(page.getByTestId('bluff-player-reveal')).toBeVisible({ timeout: 30_000 });
      }
    } else {
      throw new Error(`unexpected game screen: ${game}`);
    }

    for (const { page } of phones) await expect(page.getByTestId('round-points')).toBeVisible();
    await host.getByTestId('next-step').click();
    if (round === TOTAL_ROUNDS) break;
    if (round === 3) {
      await expect(host.getByTestId('scoreboard')).toBeVisible();
      await host.getByTestId('next-step').click();
    }
  }

  expect([...seen].sort()).toEqual(['bluff-host', 'location-host']);
  await expect(host.getByTestId('podium')).toBeVisible();
  await Promise.all(
    [host, ...phones.map(({ page }) => page)].map((page) => page.context().close()),
  );
});
