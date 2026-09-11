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

async function openMoreMenu(page: Page): Promise<void> {
  if (!(await page.locator('#secondary-menu-dialog').isVisible())) await page.getByRole('button', { name: 'Open more menu' }).click();
  await expect(page.locator('#secondary-menu-dialog')).toBeVisible();
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
});

test('keeps detail amounts visible while independently masking summary values', async ({ page }) => {
  await createWorkspaceWithRecords(page);

  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 247, 251)');
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
  await openMoreMenu(page);
  await expect(page.locator('#budget-status')).toContainText('12.50');
  await expect(page.locator('#budget-status')).toContainText('1,000.00');
  await expect(page.locator('#budget-input')).toHaveValue('1000.00');
  await expect(page.locator('#budget-input')).toBeEnabled();
  await expect(page.locator('#save-budget')).toBeEnabled();
  await expect(page.locator('#transaction-list-region')).toContainText('12.50');
  await expect(page.locator('#category-breakdown')).toContainText('12.50');
  await expect(page.getByRole('button', { name: /Edit Market/, includeHidden: true })).toBeEnabled();

  await expect(page.locator('#config-sync-form')).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('#sync-endpoint')).toBeEnabled();
  await expect(page.locator('#sync-now')).toBeDisabled();
  await expect(page.locator('#remember-secrets')).toBeDisabled();

  await expect(page.locator('#summary-grid')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('#income-total')).toContainText('100.00');
  await expect(page.locator('#expense-total')).toContainText('12.50');
  await expect(page.locator('#net-total')).toContainText('87.50');
});

test('session reveal resets after reload and leaves accessible controls in place', async ({ page }) => {
  await createWorkspaceWithRecords(page);
  await page.locator('#toggle-income-amounts').click();
  await expect(page.locator('#toggle-income-amounts')).toHaveAttribute('aria-label', 'Hide income amount');
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
  await openMoreMenu(page);
  await expect(page.locator('#settings-language')).toBeVisible();
});
