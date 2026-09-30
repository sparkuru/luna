import { expect, test } from '@playwright/test';

test('reduced-motion mode preserves keyboard navigation and backup disclosure', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#workspace-form')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.locator('#workspace-name').focus();
  await page.keyboard.type('Keyboard household');
  const create = page.locator('#workspace-form button[type="submit"]');
  await create.focus();
  expect(await create.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  const durations = await create.evaluate((element) => getComputedStyle(element).transitionDuration.split(',').map(Number.parseFloat));
  expect(durations.every((duration) => duration <= 0.00001)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#summary-grid')).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('link', { name: /Encrypted backup/ }).click();
  await expect(page).toHaveURL(/\/settings\/backup$/);
  await page.locator('#ledger-backup-details summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ledger-export-password')).not.toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ledger-export-password')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#ledger-export-password')).toBeFocused();
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test('457px effective CSS viewport at 2x density keeps key routes accessible and contained', async ({ browser, baseURL }) => {
  // Playwright page keyboard events do not operate Chrome's browser UI.
  // This models the 457px CSS viewport and DPR produced by 200% zoom from 914px.
  const context = await browser.newContext({
    baseURL: baseURL!,
    locale: 'en-US',
    viewport: { width: 457, height: 999 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('#workspace-form')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await page.locator('#workspace-name').fill('Zoom acceptance household');
    await page.locator('#workspace-form button[type="submit"]').click();
    await expect(page.locator('#transaction-list-region')).toBeVisible();

    const metrics = await page.evaluate(() => ({
      dpr: window.devicePixelRatio,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.dpr).toBe(2);
    expect(metrics.viewportWidth).toBe(457);

    for (const route of ['/luna', '/statistics', '/budget', '/settings', '/settings/preferences']) {
      await page.goto(route);
      await expect(page.locator('#main-content')).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(dimensions.content, `${route} should not overflow in the zoom-equivalent viewport`).toBeLessThanOrEqual(dimensions.viewport);
    }
  } finally {
    await context.close();
  }
});
