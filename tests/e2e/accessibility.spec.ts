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
  await page.getByRole('button', { name: 'Open more menu' }).click();
  await expect(page.locator('#secondary-menu-dialog')).toBeVisible();
  await page.locator('#ledger-backup-details summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ledger-export-password')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#ledger-export-password')).toBeFocused();
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
