import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Workspace name').fill('Offline household');
  await page.getByRole('button', { name: 'Create local workspace' }).click();
  await expect(page.locator('#summary-grid')).toBeVisible();
}

async function record(page: Page, merchant: string): Promise<void> {
  await page.locator('#primary-record').click();
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  await page.locator('#transaction-amount').fill('12.34');
  await page.locator('#transaction-category').fill('Food');
  await page.locator('#transaction-advanced-details summary').click();
  await page.locator('#transaction-merchant').fill(merchant);
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.locator('#transaction-list-region')).toContainText(merchant);
}

async function openTransactionActions(page: Page, merchant: string): Promise<void> {
  const row = page.locator('.transaction-item').filter({ hasText: merchant });
  await expect(row).toBeVisible();
  const trigger = row.locator('.transaction-actions-trigger');
  if (await trigger.isVisible()) await trigger.click();
}

test('production shell cold-opens offline and persists new records', async ({ page, context }) => {
  test.skip(!process.env.LUNA_TEST_BASE_URL && process.env.LUNA_TEST_PRODUCTION !== '1', 'Production build only');
  await setup(page);
  await record(page, 'Online shop');
  await expect(page.locator('#offline-status')).toHaveText('Ready for offline use on this device');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.close();
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  const errors: string[] = [];
  offlinePage.on('pageerror', (error) => errors.push(error.message));
  await offlinePage.goto('/');
  await expect(offlinePage.locator('#transaction-list-region')).toContainText('Online shop');
  await record(offlinePage, 'Offline shop');
  await offlinePage.reload();
  await expect(offlinePage.locator('#transaction-list-region')).toContainText('Offline shop');
  await expect(offlinePage.locator('#income-total')).toHaveText('••••');
  expect(errors).toEqual([]);
  await context.setOffline(false);
});

test('a stale financial edit is rejected and its input is retained', async ({ page, context }) => {
  await setup(page);
  await record(page, 'Shared shop');
  const second = await context.newPage();
  await second.goto('/');
  await openTransactionActions(page, 'Shared shop');
  await openTransactionActions(second, 'Shared shop');
  await page.getByRole('button', { name: /Edit Shared shop/ }).click();
  await second.getByRole('button', { name: /Edit Shared shop/ }).click();
  await page.locator('#transaction-amount').fill('45.67');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('#transaction-list-region')).toContainText('45.67');
  await second.locator('#transaction-amount').fill('89.01');
  await second.getByRole('button', { name: 'Save changes' }).click();
  await expect(second.locator('#transaction-alert')).toContainText('changed in another window');
  await expect(second.locator('#transaction-amount')).toHaveValue('89.01');
  await page.reload();
  await expect(page.locator('#transaction-list-region')).toContainText('45.67');
  await expect(page.locator('#transaction-list-region')).not.toContainText('89.01');
});

test('the production ledger is SQLite-WASM-backed and does not use the legacy browser state key', async ({ page }) => {
  await setup(page);
  await record(page, 'SQLite shop');
  expect(await page.evaluate(() => localStorage.getItem('luna.web.state.v1'))).toBeNull();
  await page.reload();
  await expect(page.locator('#transaction-list-region')).toContainText('SQLite shop');
});

test('two tabs preserve simultaneous writes', async ({ page, context }) => {
  await setup(page);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('#summary-grid')).toBeVisible();
  await Promise.all([record(page, 'Tab one'), record(second, 'Tab two')]);
  await page.reload();
  await expect(page.locator('#transaction-list-region')).toContainText('Tab one');
  await expect(page.locator('#transaction-list-region')).toContainText('Tab two');
});
