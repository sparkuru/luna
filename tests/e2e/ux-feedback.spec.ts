import { expect, test, type Locator, type Page } from '@playwright/test';

async function welcome(page: Page, locale: 'en' | 'zh-CN') {
  await page.goto('/');
  await expect(page.locator('#workspace-form')).toBeVisible();
  await page.evaluate(locale => window.lunaLedger.updateSettings({ locale }), locale);
  await page.reload();
  await expect(page.locator('#workspace-form')).toBeVisible();
}

async function createLedger(page: Page) {
  await page.locator('#workspace-name').fill('Feedback fixture');
  await page.locator('#workspace-form button[type="submit"]').click();
  await expect(page.locator('#primary-record')).toBeVisible();
}

async function expectFieldError(field: Locator, alertId: string) {
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-describedby', new RegExp(`\\b${alertId}\\b`));
}

for (const locale of ['en', 'zh-CN'] as const) {
  test(`${locale}: setup name errors identify the field and clear on correction`, async ({ page }) => {
    await welcome(page, locale);
    await page.locator('#workspace-form button[type="submit"]').click();
    await expectFieldError(page.locator('#workspace-name'), 'setup-alert');
    await expect(page.locator('#setup-alert')).toContainText(locale === 'en' ? /name/i : /名称/);
    await page.locator('#workspace-name').fill('Corrected ledger');
    await expect(page.locator('#setup-alert')).toBeEmpty();
    await expect(page.locator('#workspace-name')).toHaveAttribute('aria-invalid', 'false');
  });

  test(`${locale}: entry errors focus amount, category and date without losing the draft`, async ({ page }) => {
    await welcome(page, locale);
    await createLedger(page);
    await page.locator('#primary-record').click();
    await page.locator('#save-transaction').click();
    await expectFieldError(page.locator('#transaction-amount'), 'transaction-alert');
    await page.locator('#transaction-amount').fill('12.50');
    await expect(page.locator('#transaction-alert')).toBeEmpty();
    await page.locator('#save-transaction').click();
    await expectFieldError(page.locator('#choose-category'), 'transaction-alert');
    await expect(page.locator('#transaction-amount')).toHaveValue('12.50');
    await page.locator('#choose-category').click();
    await page.locator('#category-options .category-option').first().click();
    await expect(page.locator('#transaction-alert')).toBeEmpty();
    await expect(page.locator('#choose-category')).toHaveAttribute('aria-invalid', 'false');
    await page.locator('#transaction-date').fill('');
    await page.locator('#save-transaction').click();
    await expectFieldError(page.locator('#transaction-date'), 'transaction-alert');
    await page.locator('#transaction-date').fill('2026-09-23');
    await expect(page.locator('#transaction-alert')).toBeEmpty();
    await expect(page.locator('#transaction-date')).toHaveAttribute('aria-invalid', 'false');
    await expect(page.locator('#transaction-amount')).toHaveValue('12.50');
  });

  test(`${locale}: backup passwords explain short and byte-limit failures and clear corrected errors`, async ({ page }) => {
    await welcome(page, locale);
    await createLedger(page);
    await page.locator('#open-secondary-menu').click();
    await page.locator('a[href="/settings/backup"]').click();
    await expect(page.locator('.ledger-tools-panel')).toContainText(locale === 'en' ? /No account or internet/ : /无需登录或联网/);
    const field = page.locator('#ledger-export-password');
    await field.fill('short');
    await page.locator('#ledger-export-submit').click();
    await expectFieldError(field, 'ledger-tools-alert');
    await expect(page.locator('#ledger-tools-alert')).toContainText('12');
    await field.fill('密'.repeat(400));
    await expect(page.locator('#ledger-tools-alert')).toBeEmpty();
    await page.locator('#ledger-export-submit').click();
    await expectFieldError(field, 'ledger-tools-alert');
    await expect(page.locator('#ledger-tools-alert')).toContainText(locale === 'en' ? /too long/i : /过长/);
    await field.fill('a valid backup password');
    await expect(page.locator('#ledger-tools-alert')).toBeEmpty();
    await expect(field).toHaveAttribute('aria-invalid', 'false');
  });

  test(`${locale}: conflict loading and failure never masquerade as an empty result, and retry recovers`, async ({ page }) => {
    await welcome(page, locale);
    await createLedger(page);
    await page.evaluate(() => {
      const pending: Array<() => void> = [];
      const control = window as unknown as { failConflicts: () => void };
      control.failConflicts = () => pending.splice(0).forEach(reject => reject());
      window.lunaLedger.getLedgerConflicts = () => new Promise((_, reject) => {
        pending.push(() => reject(new Error('LUNA_ERROR:web-storage-unavailable')));
      });
    });
    await page.locator('#open-secondary-menu').click();
    await page.locator('a[href="/settings/conflicts"]').click();
    await expect(page.locator('#ledger-conflicts-loading')).toBeVisible();
    await expect(page.locator('#ledger-conflicts-empty')).toHaveCount(0);
    await page.evaluate(() => {
      window.lunaLedger.getLedgerConflicts = async () => { throw new Error('LUNA_ERROR:web-storage-unavailable'); };
      (window as unknown as { failConflicts: () => void }).failConflicts();
    });
    await expect(page.locator('#ledger-conflicts-retry')).toBeVisible();
    await expect(page.locator('#ledger-tools-alert')).not.toBeEmpty();
    await expect(page.locator('#ledger-conflicts-empty')).toHaveCount(0);
    await page.evaluate(() => { window.lunaLedger.getLedgerConflicts = async () => []; });
    await page.locator('#ledger-conflicts-retry').click();
    await expect(page.locator('#ledger-conflicts-empty')).toHaveText(locale === 'en' ? 'No conflicts. Nothing needs your attention.' : '没有冲突，无需处理。');
    await expect(page.locator('#ledger-tools-alert')).toBeEmpty();
    await expect(page.locator('#ledger-conflicts-retry')).toHaveCount(0);
  });
}
