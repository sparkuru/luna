import { expect, test, type Page } from '@playwright/test';
import { previousMonth } from '../../src/shared/domain';

async function ready(page: Page, locale: 'en' | 'zh-CN') {
  await page.goto('/');
  await expect(page.locator('#workspace-form')).toBeVisible();
  await page.evaluate(async locale => {
    await window.lunaLedger.updateSettings({ locale });
    await window.lunaLedger.createWorkspace({ name: 'Query and budget', currency: 'CNY', precision: 2, monthlyBudgetMinor: null });
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    await window.lunaLedger.createTransaction({ type: 'expense', amountMinor: '1250', date,
      splits: [{ category: 'expense:0', amountMinor: '1250' }], merchant: 'Market fixture', notes: '' });
  }, locale);
  await page.reload();
  await expect(page.locator('#primary-record')).toBeVisible();
}

async function openBudget(page: Page) {
  await page.locator('#open-secondary-menu').click();
  await page.locator('[data-settings-area="budget"]').click();
  await expect(page.locator('#budget-input')).toBeVisible();
}

for (const locale of ['en', 'zh-CN'] as const) {
  test(`${locale}: common search stays outside advanced filters and clear resets collapsed criteria`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await ready(page, locale);
    const month = (await page.locator('#month-picker').getAttribute('data-month'))!;
    await page.locator('#filter-details > summary').click();
    await expect(page.locator('#filter-query')).toBeVisible();
    await expect(page.locator('#filter-advanced')).not.toHaveAttribute('open', '');
    await expect(page.locator('#filter-date-from')).toBeHidden();
    await page.locator('#filter-query').fill('Market');
    await page.locator('#filter-type').selectOption('expense');
    await page.locator('#filter-category-options input[value="expense:0"]').check();
    await page.locator('#filter-regex').click();
    await page.locator('#filter-advanced > summary').click();
    await page.locator('#filter-date-from').fill(`${month}-01`);
    await page.locator('#filter-date-to').fill(`${month}-15`);
    await page.locator('#filter-minimum').fill('1');
    await page.locator('#filter-maximum').fill('100');
    await expect(page.locator('#transaction-list-region')).toContainText('Market fixture');
    const chipCount = await page.locator('#filter-chips button').count();
    expect(chipCount).toBeGreaterThanOrEqual(7);
    await page.locator('#filter-advanced > summary').click();
    await expect(page.locator('#filter-date-from')).toBeHidden();
    await expect(page.locator('#filter-chips button')).toHaveCount(chipCount);
    await page.locator('#filter-details > summary').click();
    await expect(page.locator('#filter-chips')).toBeVisible();
    await page.locator('#filter-chips button').last().click();
    await expect(page.locator('#filter-chips button')).toHaveCount(chipCount - 1);
    await page.locator('#filter-details > summary').click();
    await page.locator('#filter-form button[type="reset"]').click();
    await expect(page.locator('#filter-chips')).toHaveCount(0);
    await expect(page.locator('#filter-query')).toHaveValue('');
    await expect(page.locator('#filter-type')).toHaveValue('all');
    await expect(page.locator('#filter-regex')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#filter-category-options input:checked')).toHaveCount(0);
    for (const id of ['filter-date-from', 'filter-date-to', 'filter-minimum', 'filter-maximum']) {
      await expect(page.locator(`#${id}`)).toHaveValue('');
    }
    await expect(page.locator('#transaction-list-region')).toContainText('Market fixture');
  });

  test(`${locale}: budget month controls protect unsaved drafts and save only the chosen month`, async ({ page }) => {
    await ready(page, locale);
    await openBudget(page);
    const initialMonth = (await page.locator('#month-picker').getAttribute('data-month'))!;
    const targetMonth = previousMonth(initialMonth);
    await page.locator('#budget-input').fill('321.09');
    page.once('dialog', dialog => void dialog.dismiss());
    await page.locator('#previous-month').click();
    await expect(page.locator('#month-picker')).toHaveAttribute('data-month', initialMonth);
    await expect(page.locator('#budget-input')).toHaveValue('321.09');
    page.once('dialog', dialog => void dialog.accept());
    await page.locator('#previous-month').click();
    await expect(page.locator('#month-picker')).toHaveAttribute('data-month', targetMonth);
    await expect(page.locator('#budget-input')).toHaveValue('');
    await page.locator('#budget-input').fill('456.78');
    await page.locator('#save-budget').click();
    await expect.poll(async () => (await page.evaluate(month => window.lunaLedger.getSnapshot(month), targetMonth)).summary?.budgetMinor).toBe('45678');
    expect((await page.evaluate(month => window.lunaLedger.getSnapshot(month), initialMonth)).summary?.budgetMinor).toBeNull();
    await page.locator('#next-month').click();
    await expect(page.locator('#month-picker')).toHaveAttribute('data-month', initialMonth);
    await expect(page.locator('#budget-input')).toHaveValue('');
    await page.locator('#month-picker').click();
    // Select any other month in the current year through the shared picker.
    const option = page.locator('.month-picker-option[aria-pressed="false"]').first();
    const picked = (await option.getAttribute('data-month'))!;
    await option.click();
    await expect(page.locator('#month-picker')).toHaveAttribute('data-month', picked);
    await expect(page.locator('#month-picker-panel')).toHaveCount(0);
  });

  test(`${locale}: a month-selected budget draft retains its original heads after another tab commits`, async ({ page, context }) => {
    await ready(page, locale);
    await openBudget(page);
    await page.locator('#previous-month').click();
    const month = (await page.locator('#month-picker').getAttribute('data-month'))!;
    const second = await context.newPage();
    try {
      await second.goto(page.url());
      await expect(second.locator('#month-picker')).toHaveAttribute('data-month', month);
      await page.locator('#budget-input').fill('1500.00');
      await second.locator('#budget-input').fill('2000.00');
      await second.locator('#save-budget').click();
      await expect.poll(async () => (await second.evaluate(month => window.lunaLedger.getSnapshot(month), month)).summary?.budgetMinor).toBe('200000');
      const committed = await second.evaluate(month => window.lunaLedger.getSnapshot(month), month);
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.locator('#save-budget').click();
        await expect(page.locator('#budget-alert')).not.toBeEmpty();
        await expect(page.locator('#budget-input')).toHaveValue('1500.00');
        await expect(page.locator('#budget-input')).toBeFocused();
        const after = await page.evaluate(month => window.lunaLedger.getSnapshot(month), month);
        expect(after.budgetHeadIds).toEqual(committed.budgetHeadIds);
        expect(after.summary?.budgetMinor).toBe('200000');
      }
    } finally {
      await second.close();
    }
  });
}
