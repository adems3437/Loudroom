import { devices, expect, test, type Page } from '@playwright/test';

const MS = /^[+\-−]?[\d.]+ ms$/;

async function expectLiveConnection(page: Page): Promise<void> {
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');
}

test('home page shows the live socket connection and the measured clock offset', async ({
  page,
}) => {
  await page.goto('/');

  await expectLiveConnection(page);
  await expect(page.getByTestId('clock-rtt')).toHaveText(MS);
  await expect(page.getByTestId('clock-offset')).toHaveText(MS);
});

test('a host screen and three phones are connected at the same time', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const phoneContexts = await Promise.all(
    Array.from({ length: 3 }, () => browser.newContext({ ...devices['iPhone 15'] })),
  );

  try {
    const host = await hostContext.newPage();
    await host.goto('/host');
    const phones = await Promise.all(
      phoneContexts.map(async (context) => {
        const phone = await context.newPage();
        await phone.goto('/play');
        return phone;
      }),
    );

    await expectLiveConnection(host);
    await expect(host.getByTestId('clock-offset')).toHaveText(MS);
    for (const phone of phones) {
      await expectLiveConnection(phone);
      await expect(phone.locator('meta[name="viewport"]')).toHaveAttribute(
        'content',
        /user-scalable=no/,
      );
    }
  } finally {
    await Promise.all([hostContext, ...phoneContexts].map((context) => context.close()));
  }
});

test('the host stage keeps 16:9 and scales to fit the screen', async ({ browser }) => {
  const cases = [
    { viewport: { width: 1920, height: 1080 }, stage: { x: 0, y: 0, width: 1920, height: 1080 } },
    { viewport: { width: 1280, height: 720 }, stage: { x: 0, y: 0, width: 1280, height: 720 } },
    // 4:3 projector: letterboxed vertically.
    { viewport: { width: 1024, height: 768 }, stage: { x: 0, y: 96, width: 1024, height: 576 } },
  ];

  for (const { viewport, stage } of cases) {
    const context = await browser.newContext({ viewport });
    try {
      const page = await context.newPage();
      await page.goto('/host');
      const locator = page.getByTestId('stage');
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x).toBeCloseTo(stage.x, 0);
      expect(box?.y).toBeCloseTo(stage.y, 0);
      expect(box?.width).toBeCloseTo(stage.width, 0);
      expect(box?.height).toBeCloseTo(stage.height, 0);
    } finally {
      await context.close();
    }
  }
});
