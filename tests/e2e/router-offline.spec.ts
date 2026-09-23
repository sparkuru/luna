import { expect, test } from '@playwright/test';

test('production menu deep links cold-open offline without caching API requests', async ({ page, context }) => {
  test.skip(process.env.LUNA_TEST_PRODUCTION !== '1', 'Requires the production service worker');
  await page.goto('/');
  await page.getByLabel('Ledger name').fill('Offline routes');
  await page.getByRole('button', { name: 'Create local ledger' }).click();
  await expect(page.locator('#summary-grid')).toBeVisible();
  await expect(page.locator('#offline-status')).toHaveText('Ready for offline use on this device');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto('/budget');
  await expect(offline.locator('#budget-form')).toBeVisible();
  await offline.reload();
  await expect(offline.locator('#budget-form')).toBeVisible();
  const requests = await offline.evaluate(async () => {
    const apiFailed = await fetch('/api/v1/meta').then(() => false, () => true);
    const missingAssetFailed = await fetch('/assets/nonexistent.js').then(() => false, () => true);
    const urls = (await Promise.all((await caches.keys()).map(async (key) =>
      (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)))).flat();
    return { apiFailed, missingAssetFailed, urls };
  });
  expect(requests.apiFailed).toBe(true);
  expect(requests.missingAssetFailed).toBe(true);
  expect(requests.urls.some((path) => path.startsWith('/api/'))).toBe(false);
  await context.setOffline(false);
});
