import { expect, test } from '@playwright/test';

for (const locale of ['en', 'zh-CN'] as const) {
  for (const currency of ['CNY', 'JPY'] as const) {
    test(`summary controls keep independent space for ${locale} ${currency}`, async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#workspace-form')).toBeVisible();
      await page.evaluate(async ({ locale, currency }) => {
        await window.lunaLedger.updateSettings({ locale });
        await window.lunaLedger.createWorkspace({ name: 'Summary geometry', currency,
          precision: currency === 'JPY' ? 0 : 2, monthlyBudgetMinor: null });
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        await window.lunaLedger.createTransaction({ type: 'expense', amountMinor: '987654321234', date,
          splits: [{ category: 'expense:0', amountMinor: '987654321234' }], merchant: 'Large expense', notes: '' });
      }, { locale, currency });
      await page.reload();
      await expect(page.locator('#summary-grid')).toBeVisible();
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const shown of [false, true]) {
          for (const toggle of await page.locator('[data-summary-visibility-toggle]').all()) {
            if ((await toggle.getAttribute('aria-pressed')) !== String(shown)) await toggle.click();
          }
          const geometry = await page.locator('.summary-card').evaluateAll(cards => cards.map(card => {
            const button = card.querySelector('button')!.getBoundingClientRect();
            const amount = card.querySelector('.metric')!.getBoundingClientRect();
            const box = card.getBoundingClientRect();
            return { width: button.width, height: button.height,
              overlaps: button.left < amount.right && button.right > amount.left && button.top < amount.bottom && button.bottom > amount.top,
              within: amount.left >= box.left && amount.right <= box.right,
              clipped: card.querySelector('.metric')!.scrollWidth > card.querySelector('.metric')!.clientWidth };
          }));
          for (const value of geometry) {
            expect(value, `${locale} ${currency} ${width} shown=${shown}`).toMatchObject({ overlaps: false, within: true, clipped: false });
            expect(value.width).toBeGreaterThanOrEqual(44);
            expect(value.height).toBeGreaterThanOrEqual(44);
          }
          if (!shown) {
            await expect(page.locator('#summary-grid')).not.toContainText('987');
            expect(await page.locator('#summary-grid').innerHTML()).not.toContain('987');
            await expect(page.locator('#live-status')).not.toContainText('987');
          } else {
            await expect(page.locator('#net-total')).toContainText('-');
          }
        }
      }
    });
  }
}

test('welcome recovery links have a cancel path without creating a ledger', async ({ page }) => {
  await page.goto('/');
  for (const target of ['restore', 'connect']) {
    await page.locator(`#setup-${target}`).click();
    await expect(page.locator('#workspace-form')).toHaveCount(0);
    await page.locator('#setup-back').click();
    await expect(page.locator('#workspace-form')).toBeVisible();
    expect((await page.evaluate(() => window.lunaLedger.getSnapshot(new Date().toISOString().slice(0, 7)))).workspace).toBeNull();
  }
});
