import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const PHONE = devices['iPhone 15'];

/** The seeded "Parti Karışık" pack (apps/server/src/seed/party-pack.ts): 2 rounds of each game. */
const PARTY_PACK_ID = 'd5d1007e-82c0-41d3-87a8-373cc6163319';
const TOTAL_ROUNDS = 8;

/** Every WebSocket frame a page receives, so the test can check what reached the browser. */
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

/** Frames every browser received since the given marks. */
function since(all: string[][], marks: number[]): string {
  return all.map((frames, index) => frames.slice(marks[index] ?? 0).join('\n')).join('\n');
}

async function itemOrder(page: Page): Promise<string[]> {
  return page
    .getByTestId('sorting-item')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-item-id') ?? ''));
}

/** Drags the second item to the top by its handle (mouse; the sensor needs a few pixels). */
async function dragSecondToTop(page: Page) {
  const handle = await page.getByTestId('sorting-handle').nth(1).boundingBox();
  const top = await page.getByTestId('sorting-item').first().boundingBox();
  if (!handle || !top) throw new Error('sorting list not laid out');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 10, { steps: 5 });
  await page.mouse.move(handle.x + handle.width / 2, top.y + 4, { steps: 15 });
  await page.mouse.up();
  // dnd-kit swallows clicks for 50 ms after a drag (so a drop is never a tap); a person never
  // taps that fast, the test would.
  await page.waitForTimeout(100);
}

test('a mixed pack: quiz, closest number, sorting and "Kim Yapar?" with three phones', async ({
  browser,
  browserName,
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

  const phones: Phone[] = [
    await joinAs(browser, joinPath, 'Ayşe'),
    await joinAs(browser, joinPath, 'Mehmet'),
    await joinAs(browser, joinPath, 'Zeynep'),
  ];
  const [ayse, mehmet] = phones as [Phone, Phone, Phone];
  const allFrames = [hostFrames, ...phones.map((phone) => phone.frames)];
  await expect(host.getByTestId('player-card')).toHaveCount(3);

  const option = host.locator(`[data-testid="pack-option"][data-pack-id="${PARTY_PACK_ID}"]`);
  await expect(option).toContainText('en az 3 oyuncu');
  await option.click();
  await host.getByTestId('start-game').click();

  const seen = new Set<string>();
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    await expect(host.getByTestId('round-label')).toHaveText(`Soru ${round} / ${TOTAL_ROUNDS}`);
    const open = host.locator('[data-phase="ANSWERING"], [data-phase="VOTING"]');
    await expect(open).toBeVisible();
    const game = (await open.getAttribute('data-testid')) ?? '';
    const marks = allFrames.map((frames) => frames.length);
    const first = !seen.has(game);
    seen.add(game);

    if (game === 'quiz-host') {
      for (const [index, { page }] of phones.entries()) {
        await page.getByTestId('quiz-answer').nth(index).click();
      }
      await expect(host.locator('[data-testid="quiz-host"][data-phase="REVEAL"]')).toBeVisible();
    } else if (game === 'closest-host') {
      const guesses = ['1234567', '1923', '850'];
      for (const [index, { page }] of phones.entries()) {
        const input = page.getByTestId('closest-input');
        await input.fill(guesses[index] ?? '1');
        if (index === 0) await expect(input).toHaveValue(/^1\.?234\.?567$|^1234567$/);
        await page.getByTestId('closest-submit').click();
        if (index < phones.length - 1) {
          await expect(page.getByTestId('closest-player-locked')).toBeVisible();
          // Before the reveal, the answer must not have reached any browser.
          if (first) expect(since(allFrames, marks)).not.toContain('"answer":');
        }
      }
      await expect(host.locator('[data-testid="closest-host"][data-phase="REVEAL"]')).toBeVisible();
      await expect(host.getByTestId('closest-answer')).toBeVisible();
      await expect(host.getByTestId('closest-ranking-row')).toHaveCount(3);
      const verdicts = await Promise.all(
        phones.map(async ({ page }) => {
          const reveal = page.getByTestId('closest-player-reveal');
          await expect(reveal).toBeVisible();
          return reveal.getAttribute('data-correct');
        }),
      );
      expect(verdicts).toContain('true');
    } else if (game === 'sorting-host') {
      // Ayşe drags (Chromium) or uses the arrows (WebKit, steadier there); Mehmet uses the
      // arrows; Zeynep sends the starting order.
      const before = await itemOrder(ayse.page);
      if (browserName === 'chromium') await dragSecondToTop(ayse.page);
      else await ayse.page.getByTestId('sorting-up').nth(1).click();
      await expect
        .poll(() => itemOrder(ayse.page))
        .toEqual([before[1], before[0], ...before.slice(2)]);
      const mehmetBefore = await itemOrder(mehmet.page);
      await mehmet.page.getByTestId('sorting-down').first().click();
      await expect
        .poll(() => itemOrder(mehmet.page))
        .toEqual([mehmetBefore[1], mehmetBefore[0], ...mehmetBefore.slice(2)]);

      for (const [index, { page }] of phones.entries()) {
        const sentOrder = await itemOrder(page);
        await page.getByTestId('sorting-submit').click();
        if (index < phones.length - 1) {
          const locked = page.getByTestId('sorting-player-locked');
          await expect(locked).toBeVisible();
          expect(sentOrder).toHaveLength(before.length);
          if (first) expect(since(allFrames, marks)).not.toContain('correctOrder');
        }
      }
      await expect(host.locator('[data-testid="sorting-host"][data-phase="REVEAL"]')).toBeVisible();
      await expect(host.getByTestId('sorting-correct-item')).toHaveCount(before.length);
      for (const { page } of phones) {
        await expect(page.getByTestId('sorting-player-reveal')).toBeVisible();
      }
    } else if (game === 'who-host') {
      // Everyone votes for Mehmet (self votes are allowed by default).
      for (const [index, { page }] of phones.entries()) {
        await page.getByTestId('who-candidate').filter({ hasText: 'Mehmet' }).click();
        // The last vote ends the round at once, so only the others see the "locked" screen.
        if (index < phones.length - 1) {
          await expect(page.getByTestId('who-player-locked')).toBeVisible();
        }
      }
      await expect(host.locator('[data-testid="who-host"][data-phase="REVEAL"]')).toBeVisible();
      const winner = host.locator('[data-testid="who-result"][data-winner="true"]');
      await expect(winner).toHaveCount(1);
      await expect(winner).toHaveAttribute('data-count', '3');
      await expect(winner).toContainText('Mehmet');
      for (const { page } of phones) {
        await expect(page.getByTestId('who-player-reveal')).toHaveAttribute('data-correct', 'true');
      }
      await expect(mehmet.page.getByTestId('who-my-title')).toBeVisible();
      // Votes are anonymous: the TV never learns who voted for whom.
      expect(hostFrames.join('\n')).not.toContain('votedFor');
    } else {
      throw new Error(`unexpected game screen: ${game}`);
    }

    // Each phone shows the points the server gave it.
    for (const { page } of phones) {
      await expect(page.getByTestId('round-points')).toBeVisible();
    }

    await host.getByTestId('next-step').click();
    if (round === TOTAL_ROUNDS) break;
    // After the last question of each game comes the scoreboard.
    if (round % 2 === 0) {
      await expect(host.getByTestId('scoreboard')).toBeVisible();
      await host.getByTestId('next-step').click();
    }
  }

  expect([...seen].sort()).toEqual(['closest-host', 'quiz-host', 'sorting-host', 'who-host']);
  await expect(host.getByTestId('podium')).toBeVisible();
  for (const { page } of phones) await expect(page.getByTestId('phone-finished')).toBeVisible();

  await Promise.all(
    [host, ...phones.map(({ page }) => page)].map((page) => page.context().close()),
  );
});
