import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const PHONE = devices['iPhone 15'];

/** The seeded "Genel Kültür Karışık" pack (apps/server/src/seed/quiz-pack.ts). */
const SAMPLE_PACK_ID = '624505d8-a23a-433d-8e22-fa41ed3770c3';

async function startSamplePack(host: Page) {
  await host.locator(`[data-testid="pack-option"][data-pack-id="${SAMPLE_PACK_ID}"]`).click();
  await host.getByTestId('start-game').click();
}

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

async function score(phone: Page): Promise<number> {
  return Number(await phone.getByTestId('my-score').getAttribute('data-score'));
}

test('a full quiz: start, answer on phones, server scores, results, scoreboard, podium', async ({
  browser,
}) => {
  test.setTimeout(240_000);

  const host = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  const hostFrames = recordFrames(host);
  await host.goto('/host/create');
  await host.getByTestId('create-room').click();
  await expect(host).toHaveURL(/\/host\/room\/\d{6}$/);
  const joinUrl = (await host.getByTestId('join-url').getAttribute('data-url')) ?? '';
  const joinPath = new URL(joinUrl).pathname;

  // Phones join through the QR link.
  const phones = [
    await joinAs(browser, joinPath, 'Ayşe'),
    await joinAs(browser, joinPath, 'Mehmet'),
    await joinAs(browser, joinPath, 'Zeynep'),
  ];
  await expect(host.getByTestId('player-card')).toHaveCount(3);

  await startSamplePack(host);
  await expect(host.getByTestId('game-starting')).toBeVisible();
  for (const { page } of phones) await expect(page.getByTestId('phone-starting')).toBeVisible();

  const totalRounds = 10;
  for (let round = 1; round <= totalRounds; round++) {
    await expect(host.getByTestId('round-label')).toHaveText(`Soru ${round} / ${totalRounds}`);
    await expect(host.locator('[data-testid="quiz-host"][data-phase="ANSWERING"]')).toBeVisible();

    // Before any answer is revealed, the correct answer must not have reached any browser.
    if (round === 1) {
      for (const frames of [hostFrames, ...phones.map((phone) => phone.frames)]) {
        const sent = frames.join('\n');
        expect(sent).not.toContain('correctOptionId');
        expect(sent).not.toMatch(/"correct":/);
      }
    }

    // A phone reloading mid-question comes back into the same question.
    if (round === 2) {
      const reloading = phones[1];
      if (!reloading) throw new Error('missing phone');
      await reloading.page.reload();
      await expect(reloading.page.getByTestId('player-game')).toBeVisible();
    }

    // Each phone picks a different option (by display position).
    const picks: string[] = [];
    for (const [index, { page }] of phones.entries()) {
      const option = page.getByTestId('quiz-answer').nth(index);
      picks.push((await option.getAttribute('data-option-id')) ?? '');
      await option.click();
      // The last answer ends the round at once, so only the others see the "locked" screen.
      if (index < phones.length - 1) {
        await expect(page.getByTestId('quiz-player-locked')).toBeVisible();
      }
    }

    // Everyone answered: the round ends early and the host reveals the answer.
    await expect(host.locator('[data-testid="quiz-host"][data-phase="REVEAL"]')).toBeVisible();
    const correct =
      (await host
        .locator('[data-testid="quiz-option"][data-correct="true"]')
        .getAttribute('data-option-id')) ?? '';
    expect(correct).not.toBe('');

    // Each phone shows its own verdict and the points the server gave it.
    for (const [index, { page }] of phones.entries()) {
      const right = picks[index] === correct;
      await expect(page.getByTestId('quiz-player-reveal')).toHaveAttribute(
        'data-correct',
        String(right),
      );
      const points = Number(await page.getByTestId('round-points').getAttribute('data-points'));
      if (right) expect(points).toBeGreaterThanOrEqual(500);
      else expect(points).toBe(0);
    }

    // Host moves on: scoreboard (sorted by score), then the next question — or the podium.
    await host.getByTestId('next-step').click();
    if (round === totalRounds) break;
    await expect(host.getByTestId('scoreboard')).toBeVisible();
    const scores = await host
      .getByTestId('scoreboard-row')
      .evaluateAll((rows) => rows.map((row) => Number(row.getAttribute('data-score'))));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    await host.getByTestId('next-step').click();
  }

  // Game over: podium on the TV, final rank on every phone, consistent with the scores.
  await expect(host.getByTestId('podium')).toBeVisible();
  const finalScores = await Promise.all(phones.map(({ page }) => score(page)));
  const best = Math.max(...finalScores);
  for (const [index, { page }] of phones.entries()) {
    await expect(page.getByTestId('phone-finished')).toBeVisible();
    const rank = Number(await page.getByTestId('final-rank').getAttribute('data-rank'));
    if (finalScores[index] === best && finalScores.filter((value) => value === best).length === 1) {
      expect(rank).toBe(1);
      const winner = host.locator('[data-testid="podium-place"][data-rank="1"]');
      await expect(winner).toContainText(phones[index]?.nickname ?? '');
    }
  }

  // Same players, new game: back to the lobby with scores reset.
  await host.getByTestId('play-again').click();
  await expect(host.getByTestId('start-game')).toBeVisible();
  for (const { page } of phones) await expect(page.getByTestId('player-lobby')).toBeVisible();

  await Promise.all(
    [host, ...phones.map(({ page }) => page)].map((page) => page.context().close()),
  );
});

test('the host can pause and resume; phones see the pause', async ({ browser }) => {
  const host = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await host.goto('/host/create');
  await host.getByTestId('create-room').click();
  const joinUrl = (await host.getByTestId('join-url').getAttribute('data-url')) ?? '';
  const phone = await joinAs(browser, new URL(joinUrl).pathname, 'Deniz');

  await startSamplePack(host);
  await expect(host.locator('[data-testid="quiz-host"][data-phase="ANSWERING"]')).toBeVisible();
  await host.getByTestId('pause-game').click();
  await expect(host.getByTestId('paused-overlay')).toBeVisible();
  await expect(phone.page.getByTestId('phone-paused')).toBeVisible();

  await host.getByTestId('resume-game').click();
  await expect(host.getByTestId('paused-overlay')).toHaveCount(0);
  await expect(phone.page.getByTestId('quiz-answer').first()).toBeVisible();

  await host.getByTestId('end-game').click();
  await host.getByTestId('end-confirm').click();
  await expect(host.getByTestId('podium')).toBeVisible();
  await Promise.all([host, phone.page].map((page) => page.context().close()));
});
