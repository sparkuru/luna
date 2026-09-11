import { expect, test, type Page } from '@playwright/test';

async function setupWorkspace(page: Page, name = 'Intuitive household'): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#workspace-form')).toBeVisible();
  await page.getByLabel('Workspace name').fill(name);
  await page.getByRole('button', { name: 'Create local workspace' }).click();
  await expect(page.locator('#transactions-title')).toHaveText('Recent ledger');
  await expect(page.locator('#transaction-dialog')).not.toBeVisible();
}

async function openEntry(page: Page, type: 'expense' | 'income'): Promise<void> {
  await page.locator(type === 'expense' ? '#record-expense' : '#record-income').click();
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  await expect(page.locator('#transaction-amount')).toBeFocused();
}

test('empty ledger makes the next record obvious and saves a focused expense', async ({ page }) => {
  await setupWorkspace(page);

  await expect(page.locator('#transaction-list-region')).toContainText('Your ledger starts here');
  await expect(page.locator('#record-expense')).toBeVisible();
  await expect(page.locator('#record-income')).toBeVisible();
  await expect(page.locator('.quick-entry-panel')).toHaveCount(0);
  await expect(page.locator('#summary-grid .summary-card')).toHaveCount(3);
  await expect(page.locator('#budget-total')).toHaveCount(0);
  await expect(page.locator('#transaction-merchant')).not.toBeVisible();

  await openEntry(page, 'expense');
  await expect(page.locator('#transaction-advanced-details')).not.toHaveAttribute('open', '');
  await expect(page.locator('#transaction-type')).toHaveValue('expense');
  await page.locator('#transaction-amount').fill('18.50');
  await page.locator('#choose-category').click();
  await expect(page.locator('#category-dialog')).toBeVisible();
  await page.locator('#category-custom').fill('Lunch');
  await page.locator('#use-category').click();
  await expect(page.locator('#transaction-category')).toHaveValue('Lunch');
  await page.locator('#transaction-advanced-details summary').click();
  await page.locator('#transaction-merchant').fill('Corner cafe');
  await page.getByRole('button', { name: 'Save transaction' }).click();

  await expect(page.locator('#transaction-list-region')).toContainText('Corner cafe');
  await expect(page.locator('#transaction-list-region')).toContainText('18.50');
  await expect(page.locator('#live-status')).toHaveText('Transaction saved locally.');

  const editButton = page.getByRole('button', { name: 'Edit Corner cafe', exact: true });
  await editButton.click();
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  await page.locator('#close-transaction').click();
  await expect(editButton).toBeFocused();
});

test('income entry and advanced fields are keyboard reachable', async ({ page }) => {
  await setupWorkspace(page, 'Keyboard household');

  await page.locator('#record-income').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  await expect(page.locator('#transaction-type')).toHaveValue('income');
  await expect(page.locator('#quick-income')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#transaction-amount').fill('2400.00');
  await page.locator('#transaction-category').fill('Salary');

  const details = page.locator('#transaction-advanced-details');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#transaction-merchant')).toBeVisible();
  await page.locator('#transaction-merchant').fill('Employer');
  await page.getByRole('button', { name: 'Save transaction' }).click();

  await expect(page.locator('#transaction-list-region')).toContainText('Employer');
  await expect(page.locator('.tag.income')).toContainText('Income');
});

test('secondary menu and subdued filters stay discoverable without taking over the home', async ({ page }) => {
  await setupWorkspace(page, 'Discoverable household');

  await expect(page.locator('#filter-details')).not.toHaveAttribute('open', '');
  await page.locator('#filter-details summary').click();
  await expect(page.locator('#filter-form')).toBeVisible();
  await page.locator('#filter-details summary').click();

  await expect(page.locator('#open-secondary-menu .menu-icon > span')).toHaveCount(3);
  await expect(page.locator('#open-secondary-menu')).not.toContainText('三');
  await page.getByRole('button', { name: 'Open more menu' }).click();
  await expect(page.locator('#secondary-menu-dialog')).toBeVisible();
  await expect(page.locator('#close-secondary-menu')).toBeFocused();
  await expect(page.locator('#budget-form')).toBeVisible();
  await page.locator('#close-secondary-menu').click();
  await expect(page.locator('#secondary-menu-dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Open more menu' })).toBeFocused();
});

test.describe('desktop primary layout', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('keeps the recent ledger primary and opens entry on demand', async ({ page }) => {
    await setupWorkspace(page, 'Desktop household');
    await expect(page.locator('.transactions-panel')).toBeVisible();
    await expect(page.locator('.quick-entry-panel')).toHaveCount(0);
    await expect(page.locator('#open-secondary-menu')).toBeVisible();
    await openEntry(page, 'expense');
  });
});

test('narrow layout keeps one primary path without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await setupWorkspace(page, 'Narrow household');
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.locator('.transactions-panel')).toBeVisible();
  await expect(page.locator('.quick-entry-panel')).toHaveCount(0);
  await openEntry(page, 'expense');
});
