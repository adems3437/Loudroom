import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const PHONE = devices['iPhone 15'];

/** The seeded "Çiz Bil" pack (apps/server/src/seed/drawing-pack.ts). */
const DRAWING_PACK_ID = '6c0e43d1-6b7a-4f2e-9a39-55d8c1a3b7e2';

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

/** Draws a stroke across the pad with the mouse, in fractions of its size. */
async function drawStroke(page: Page, from: [number, number], to: [number, number]) {
  const pad = await page.getByTestId('drawing-pad').boundingBox();
  if (!pad) throw new Error('no drawing pad');
  const at = ([x, y]: [number, number]) => [pad.x + pad.width * x, pad.y + pad.height * y] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps: 12 });
  await page.mouse.up();
}

/** A guess one or two letters off the word: "close", not right (SPEC §7.5). */
function nearMiss(word: string): string | null {
  const letters = Array.from(word.toLocaleLowerCase('tr'));
  if (letters.length < 3) return null;
  const changed = letters.length >= 6 ? 2 : 1;
  return [...letters.slice(0, -changed), ...Array<string>(changed).fill('q')].join('');
}

test('drawing: live strokes on the TV, history after a reload, hidden hints, early reveal', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const host = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  const hostFrames = recordFrames(host);
  await host.goto('/host/create');
  await host.getByTestId('create-room').click();
  await expect(host).toHaveURL(/\/host\/room\/\d{6}$/);
  const joinUrl = (await host.getByTestId('join-url').getAttribute('data-url')) ?? '';
  const joinPath = new URL(joinUrl).pathname;
  // Turns follow join order: Ayşe draws first.
  const drawer = await joinAs(browser, joinPath, 'Ayşe');
  const mehmet = await joinAs(browser, joinPath, 'Mehmet');
  const zeynep = await joinAs(browser, joinPath, 'Zeynep');
  await expect(host.getByTestId('player-card')).toHaveCount(3);

  await host.locator(`[data-testid="pack-option"][data-pack-id="${DRAWING_PACK_ID}"]`).click();
  await host.getByTestId('start-game').click();

  // The drawer sees the word; the others see who draws and empty letter boxes.
  await expect(drawer.page.getByTestId('drawing-player-drawer')).toBeVisible();
  const word = (await drawer.page.getByTestId('drawing-secret-word').innerText()).trim();
  expect(word.length).toBeGreaterThan(1);
  await expect(mehmet.page.getByTestId('drawing-player-guess')).toBeVisible();
  await expect(host.locator('[data-testid="drawing-host"][data-phase="DRAWING"]')).toBeVisible();
  await expect(host.getByTestId('drawing-drawer')).toContainText('Ayşe');

  // Two strokes on the phone appear on the TV.
  await drawStroke(drawer.page, [0.2, 0.2], [0.8, 0.3]);
  await drawStroke(drawer.page, [0.3, 0.7], [0.6, 0.5]);
  await expect(drawer.page.getByTestId('drawing-pad')).toHaveAttribute('data-strokes', '2');
  await expect(host.getByTestId('drawing-host-canvas')).toHaveAttribute('data-strokes', '2');
  // Undo on the phone takes the last stroke off the TV too.
  await drawer.page.getByTestId('drawing-undo').click();
  await expect(host.getByTestId('drawing-host-canvas')).toHaveAttribute('data-strokes', '1');
  await drawStroke(drawer.page, [0.1, 0.9], [0.9, 0.9]);
  await expect(host.getByTestId('drawing-host-canvas')).toHaveAttribute('data-strokes', '2');

  // The TV reloads mid-drawing (which pauses the game) and gets the whole drawing back.
  await host.reload();
  await expect(host.getByTestId('drawing-host-canvas')).toHaveAttribute('data-strokes', '2');
  await host.getByTestId('resume-game').click();
  await expect(host.getByTestId('paused-overlay')).toHaveCount(0);
  // "Hide" blurs the drawing on the TV only.
  await host.getByTestId('drawing-hide').click();
  await expect(host.getByTestId('drawing-hide')).toHaveAttribute('aria-pressed', 'true');
  await host.getByTestId('drawing-hide').click();

  // A wrong guess shows on the TV; a near miss is only told to its author.
  await mehmet.page.getByTestId('drawing-input').fill('xyzabc');
  await mehmet.page.getByTestId('drawing-submit').click();
  await expect(host.getByTestId('drawing-feed-item')).toContainText('xyzabc');
  const near = nearMiss(word);
  if (near) {
    await zeynep.page.getByTestId('drawing-input').fill(near);
    await zeynep.page.getByTestId('drawing-submit').click();
    await expect(zeynep.page.getByTestId('drawing-my-guess').first()).toHaveAttribute(
      'data-result',
      'close',
    );
    await expect(host.getByTestId('drawing-feed')).not.toContainText(near);
  }

  // Before the reveal the word reached no browser but the drawer's.
  const fold = (text: string) => text.toLocaleLowerCase('tr');
  for (const frames of [hostFrames, mehmet.frames, zeynep.frames]) {
    expect(fold(frames.join('\n'))).not.toContain(fold(word));
  }

  // Both guess it (in another case): the round ends at once, the word is shown.
  for (const { page } of [mehmet, zeynep]) {
    await page.getByTestId('drawing-input').fill(word.toLocaleUpperCase('tr'));
    await page.getByTestId('drawing-submit').click();
  }
  await expect(host.locator('[data-testid="drawing-host"][data-phase="REVEAL"]')).toBeVisible();
  await expect(host.getByTestId('drawing-word')).toHaveText(word);
  await expect(host.getByTestId('drawing-solver')).toHaveCount(2);
  for (const { page } of [mehmet, zeynep]) {
    await expect(page.getByTestId('drawing-player-reveal')).toHaveAttribute('data-correct', 'true');
  }
  const points = Number(await drawer.page.getByTestId('round-points').getAttribute('data-points'));
  expect(points).toBe(500);

  // Next drawing: Mehmet's turn.
  await host.getByTestId('next-step').click();
  await expect(host.getByTestId('scoreboard')).toBeVisible();
  await host.getByTestId('next-step').click();
  await expect(mehmet.page.getByTestId('drawing-player-drawer')).toBeVisible();
  await expect(host.getByTestId('drawing-drawer')).toContainText('Mehmet');
  await expect(host.getByTestId('drawing-host-canvas')).toHaveAttribute('data-strokes', '0');

  // The host skips: the word is shown, the round ends.
  await host.getByTestId('skip-round').click();
  await expect(host.locator('[data-testid="drawing-host"][data-phase="REVEAL"]')).toBeVisible();

  await host.getByTestId('end-game').click();
  await host.getByTestId('end-confirm').click();
  await expect(host.getByTestId('podium')).toBeVisible();
  await Promise.all(
    [host, drawer.page, mehmet.page, zeynep.page].map((page) => page.context().close()),
  );
});
