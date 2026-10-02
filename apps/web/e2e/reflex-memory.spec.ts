import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const PHONE = devices['iPhone 15'];

/** The seeded "Refleks ve Hafıza" pack (apps/server/src/seed/reflex-pack.ts): 2 + 3 rounds. */
const REFLEX_PACK_ID = '19cb8d29-eb29-4668-a947-2c8b4dda66c1';
const TOTAL_ROUNDS = 5;

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

type Phone = Awaited<ReturnType<typeof joinAs>>;

/**
 * Plays a Reaction round: each phone taps its target after a human-like pause (faster than
 * 100 ms is refused), never a decoy; `early` taps once while waiting in the first attempt.
 */
async function playReaction(host: Page, phones: Phone[], early: Phone | null) {
  const stage = host.getByTestId('reaction-host');
  if (early) {
    await expect(stage).toHaveAttribute('data-phase', 'ARMED', { timeout: 15_000 });
    await early.page.getByTestId('reaction-wait').click();
    await expect(early.page.getByTestId('reaction-wait')).toHaveAttribute('data-early', 'true');
  }
  for (;;) {
    await expect(stage).toHaveAttribute('data-phase', /^(GO|REVEAL)$/, { timeout: 15_000 });
    if ((await stage.getAttribute('data-phase')) === 'REVEAL') return;
    for (const { page } of phones) {
      const target = page.getByTestId('reaction-target');
      if (!(await target.isVisible())) continue;
      if ((await target.getAttribute('data-kind')) === 'decoy') continue;
      await page.waitForTimeout(200);
      await target.click();
    }
    await expect(stage).not.toHaveAttribute('data-phase', 'GO', { timeout: 10_000 });
  }
}

test('reflex and memory: targets on phones, an early tap, a board to memorise', async ({
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

  await host.locator(`[data-testid="pack-option"][data-pack-id="${REFLEX_PACK_ID}"]`).click();
  await host.getByTestId('start-game').click();

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    await expect(host.getByTestId('round-label')).toHaveText(`Soru ${round} / ${TOTAL_ROUNDS}`);
    if (round <= 2) {
      await playReaction(host, phones, round === 1 ? (phones[2] ?? null) : null);
      // Every phone's taps passed the plausibility checks: everyone has a median time.
      await expect(
        host.getByTestId('reaction-ranking-row').filter({ hasText: /\d+ ms/ }),
      ).toHaveCount(3);
      for (const { page } of phones) {
        await expect(page.getByTestId('reaction-player-reveal')).toBeVisible();
      }
      // The wait before GO never reached a browser.
      expect(allFrames.flat().join('\n')).not.toMatch(/"name":"ARMED","endsAt":\d/);
    } else {
      // The board is on the TV for a few seconds, never on the phones.
      await expect(host.getByTestId('memory-card')).toHaveCount(9);
      for (const { page } of phones) {
        await expect(page.getByTestId('memory-player-watch')).toBeVisible();
      }
      const marks = allFrames.map((frames) => frames.length);
      for (const [index, { page }] of phones.entries()) {
        for (let question = 0; question < 3; question++) {
          await expect(page.getByTestId('memory-player-question')).toHaveAttribute(
            'data-index',
            String(question),
          );
          await page
            .getByTestId('memory-option')
            .nth(index % 4)
            .click();
        }
        if (index < phones.length - 1) {
          await expect(page.getByTestId('memory-player-done')).toBeVisible();
          const sent = allFrames.map((frames, i) => frames.slice(marks[i] ?? 0).join('\n'));
          expect(sent.join('\n')).not.toContain('correctOptionId');
        }
      }
      await expect(host.locator('[data-testid="memory-host"][data-phase="REVEAL"]')).toBeVisible();
      await expect(host.getByTestId('memory-answer')).toHaveCount(3);
      for (const { page } of phones) {
        await expect(page.getByTestId('memory-player-answer')).toHaveCount(3);
      }
    }
    await host.getByTestId('next-step').click();
    if (round === TOTAL_ROUNDS) break;
    if (round === 2) {
      await expect(host.getByTestId('scoreboard')).toBeVisible();
      await host.getByTestId('next-step').click();
    }
  }

  await expect(host.getByTestId('podium')).toBeVisible();
  await Promise.all(
    [host, ...phones.map(({ page }) => page)].map((page) => page.context().close()),
  );
});
