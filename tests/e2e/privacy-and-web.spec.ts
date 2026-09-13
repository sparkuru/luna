import { expect, test, type Page } from '@playwright/test';

const currentMonth = new Date().toISOString().slice(0, 7);
const currentDate = `${currentMonth}-${new Date().getUTCDate().toString().padStart(2, '0')}`;

async function createWorkspaceWithRecords(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up your workspace' })).toBeVisible();
  await page.getByLabel('Workspace name').fill('Playwright household');
  await page.locator('#workspace-currency').selectOption('CNY');
  await page.getByLabel('Monthly spending limit').fill('1000.00');
  await page.getByRole('button', { name: 'Create local workspace' }).click();
  await expect(page.locator('#summary-grid')).toBeVisible();

  await page.locator('#record-income').click();
  await page.locator('#transaction-type').selectOption('income');
  await page.locator('#transaction-amount').fill('100.00');
  await page.locator('#transaction-category').fill('Salary');
  await page.locator('#transaction-advanced-details summary').click();
  await page.locator('#transaction-merchant').fill('Employer');
  await page.locator('#transaction-date').fill(currentDate);
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.locator('#transaction-list-region')).toContainText('100.00');

  await page.locator('#record-expense').click();
  await page.locator('#transaction-type').selectOption('expense');
  await page.locator('#transaction-amount').fill('12.50');
  await page.locator('#transaction-category').fill('Groceries');
  await page.locator('#transaction-advanced-details summary').click();
  await page.locator('#transaction-merchant').fill('Market');
  await page.locator('#transaction-date').fill(currentDate);
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.locator('#transaction-list-region')).toContainText('12.50');
}

test('works when crypto.randomUUID is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    });
  });

  await createWorkspaceWithRecords(page);
  expect(await page.evaluate(() => typeof globalThis.crypto.randomUUID)).toBe('undefined');
  await page.locator('#open-secondary-menu').click();
  await page.getByRole('link', { name: /Encrypted backup|加密备份/ }).click();
  await page.locator('#ledger-export-password').fill('secure fallback backup phrase');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#ledger-export-submit').click();
  expect(await downloadPromise).toBeTruthy();
});

test('keeps detail amounts visible while independently masking summary values', async ({ page }) => {
  await createWorkspaceWithRecords(page);

  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 248, 252)');
  await expect(page.locator('#summary-grid')).toHaveCSS('display', 'grid');
  await expect(page.locator('#summary-grid')).toHaveClass(/is-collapsed/);
  for (const id of ['#income-total', '#expense-total', '#net-total']) {
    await expect(page.locator(id)).toHaveText('••••');
  }
  const summaryHeight = await page.locator('#summary-grid').evaluate((element) => element.clientHeight);
  const summaryVisibilityToggles = page.locator('[data-summary-visibility-toggle]');
  await expect(summaryVisibilityToggles).toHaveCount(3);
  await expect(summaryVisibilityToggles.first().locator('.eye-icon')).toBeVisible();
  await expect(summaryVisibilityToggles.first()).toHaveAttribute('aria-label', 'Show income amount');
  await expect(summaryVisibilityToggles.first()).toHaveAttribute('aria-pressed', 'false');
  await summaryVisibilityToggles.first().click();
  await expect(summaryVisibilityToggles.first()).toHaveAttribute('aria-label', 'Hide income amount');
  await expect(summaryVisibilityToggles.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#income-total')).toContainText('100.00');
  await expect(page.locator('#expense-total')).toHaveText('••••');
  await expect(page.locator('#net-total')).toHaveText('••••');
  await expect(page.locator('#summary-grid')).toHaveJSProperty('clientHeight', summaryHeight);
  await expect(page.locator('.summary-card.income')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('.summary-card.expense')).toHaveClass(/is-collapsed/);
  await expect(page.locator('.summary-card.net')).toHaveClass(/is-collapsed/);
  await summaryVisibilityToggles.nth(1).click();
  await expect(page.locator('#income-total')).toContainText('100.00');
  await expect(page.locator('#expense-total')).toContainText('12.50');
  await expect(page.locator('#net-total')).toHaveText('••••');
  await expect(page.locator('#summary-grid')).toHaveJSProperty('clientHeight', summaryHeight);
  await expect(page.locator('.summary-card.income')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('.summary-card.expense')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('.summary-card.net')).toHaveClass(/is-collapsed/);
  await summaryVisibilityToggles.last().click();
  await expect(page.locator('#summary-grid')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('#income-total')).toContainText('100.00');
  await expect(page.locator('#expense-total')).toContainText('12.50');
  await expect(page.locator('#net-total')).toContainText('87.50');
  await expect(page.locator('#summary-grid')).toHaveJSProperty('clientHeight', summaryHeight);
  await summaryVisibilityToggles.first().click();
  await expect(page.locator('#income-total')).toHaveText('••••');
  await expect(page.locator('#expense-total')).toContainText('12.50');
  await expect(page.locator('#net-total')).toContainText('87.50');
  await expect(page.locator('#summary-grid')).toHaveJSProperty('clientHeight', summaryHeight);
  await expect(page.locator('.summary-card.income')).toHaveClass(/is-collapsed/);
  await expect(page.locator('.summary-card.expense')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('.summary-card.net')).not.toHaveClass(/is-collapsed/);
  await summaryVisibilityToggles.first().click();
  await page.goto('/budget');
  await expect(page.locator('#budget-form')).toBeVisible();
  await expect(page.locator('#budget-status')).toContainText('12.50');
  await expect(page.locator('#budget-status')).toContainText('1,000.00');
  await expect(page.locator('#budget-input')).toHaveValue('1000.00');
  await expect(page.locator('#budget-input')).toBeEnabled();
  await expect(page.locator('#save-budget')).toBeEnabled();
  await page.goto('/statistics');
  await expect(page.locator('#category-breakdown')).toContainText('12.50');
  await page.locator('.statistics-category-button').filter({ hasText: 'Groceries' }).click();
  await expect(page.locator('#statistics-drilldown')).toBeVisible();
  await expect(page.locator('#statistics-drilldown')).toContainText('Market');
  await expect(page.locator('.statistics-drilldown-row').first()).toContainText('12.50');
  await expect(page.locator('#statistics-sort-amount')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#statistics-sort-date').click();
  await expect(page.locator('#statistics-sort-date')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#statistics-category-view-ring').click();
  await expect(page.locator('.statistics-donut')).toBeVisible();
  await page.locator('#statistics-category-view-bars').click();
  await page.locator('.statistics-bar-row').filter({ hasText: '12.50' }).press('Enter');
  await expect(page.locator('#statistics-bucket-detail')).toBeVisible();
  await expect(page.locator('#statistics-bucket-detail')).toContainText('Market');
  await expect(page.locator('#statistics-bucket-detail')).toContainText('12.50');
  await page.goto('/settings/sync/advanced');
  await expect(page.locator('#config-sync-form')).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('#sync-endpoint')).toBeEnabled();
  await expect(page.locator('#sync-now')).toBeDisabled();
  await expect(page.locator('#remember-secrets')).toBeDisabled();
  await page.goto('/ledger');
  await expect(page.locator('#transaction-list-region')).toContainText('12.50');
  await expect(page.getByRole('button', { name: /Edit Market/, includeHidden: true })).toBeEnabled();

  await expect(page.locator('#summary-grid')).toHaveClass(/is-collapsed/);
  await expect(page.locator('#income-total')).toHaveText('••••');
  await expect(page.locator('#expense-total')).toHaveText('••••');
  await expect(page.locator('#net-total')).toHaveText('••••');
});

test('session reveal resets after reload and leaves accessible controls in place', async ({ page }) => {
  await createWorkspaceWithRecords(page);
  const incomeVisibility = page.locator('[data-summary-visibility-toggle]').first();
  await incomeVisibility.click();
  await expect(incomeVisibility).toHaveAttribute('aria-label', 'Hide income amount');
  await expect(page.locator('#income-total')).toContainText('100.00');
  await expect(page.locator('#expense-total')).toHaveText('••••');
  await page.reload();
  await expect(page.locator('#summary-grid')).toBeVisible();
  await expect(page.locator('#summary-grid')).toHaveClass(/is-collapsed/);
  await expect(page.locator('#income-total')).toHaveText('••••');
  await expect(page.locator('#expense-total')).toHaveText('••••');
  await expect(page.locator('#transaction-list-region')).toContainText('12.50');
  await expect(page.getByRole('heading', { name: 'Recent ledger' })).toBeVisible();
  await expect(page.locator('#transaction-dialog')).not.toBeVisible();
  await page.locator('#record-expense').click();
  await expect(page.locator('#transaction-amount')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save transaction' })).toBeEnabled();
});

test('fits a narrow viewport without horizontal overflow', async ({ page }) => {
  await createWorkspaceWithRecords(page);
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.locator('[data-summary-visibility-toggle]')).toHaveCount(3);
  await page.goto('/settings/preferences');
  await expect(page.locator('#settings-language')).toBeVisible();
});
