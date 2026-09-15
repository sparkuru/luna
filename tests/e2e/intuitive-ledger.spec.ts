import { expect, test, type Locator, type Page } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function setupWorkspace(page: Page, name = 'Intuitive household'): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#workspace-form')).toBeVisible();
  await page.getByLabel('Workspace name').fill(name);
  await page.getByRole('button', { name: 'Create local workspace' }).click();
  await expect(page.locator('#transactions-title')).toHaveText('Recent ledger');
  await expect(page.locator('#transaction-dialog')).not.toBeVisible();
}

async function openEntry(page: Page, type: 'expense' | 'income'): Promise<void> {
  await page.locator('#primary-record').click();
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  if (type === 'income') await page.locator('#quick-income').click();
  await expect(page.locator('#transaction-amount')).toBeFocused();
}

async function openTransactionActions(page: Page, row: Locator): Promise<void> {
  await expect(row).toBeVisible();
  const trigger = row.locator('.transaction-actions-trigger');
  if (await trigger.isVisible()) await trigger.click();
}

async function expectRecordBelowMonth(page: Page, aligned = true): Promise<void> {
  await expect(page.locator('.page-heading-copy > #primary-record')).toHaveCount(0);
  await expect(page.locator('.page-heading-actions > #primary-record')).toHaveCount(1);
  const [monthBox, recordBox] = await Promise.all([
    page.locator('.page-heading-actions .month-controls').boundingBox(),
    page.locator('.page-heading-actions > #primary-record').boundingBox(),
  ]);
  expect(monthBox).not.toBeNull();
  expect(recordBox).not.toBeNull();
  expect(recordBox?.y ?? 0).toBeGreaterThanOrEqual(
    (monthBox?.y ?? 0) + (monthBox?.height ?? 0),
  );
  if (aligned) {
    expect(Math.abs(
      (recordBox?.x ?? 0) + (recordBox?.width ?? 0) -
        ((monthBox?.x ?? 0) + (monthBox?.width ?? 0)),
    )).toBeLessThanOrEqual(1);
  }
}

test('empty ledger makes the next record obvious and saves a focused expense', async ({ page }) => {
  await setupWorkspace(page);

  await expect(page.locator('#transaction-list-region')).toContainText('Your ledger starts here');
  await expect(page.locator('#primary-record')).toBeVisible();
  await expect(page.locator('#record-expense, #record-income')).toHaveCount(0);
  await expect(page.locator('.quick-entry-panel')).toHaveCount(0);
  await expect(page.locator('#summary-grid .summary-card')).toHaveCount(3);
  await expect(page.locator('#budget-total')).toHaveCount(0);
  await expect(page.locator('#transaction-merchant')).not.toBeVisible();

  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;
  });
  await openEntry(page, 'expense');
  await expect(page.locator('#transaction-advanced-details')).not.toHaveAttribute('open', '');
  await expect(page.locator('#transaction-date')).toBeVisible();
  await expect(page.locator('#transaction-date')).toHaveValue(today);
  await expect(page.locator('#transaction-type')).toHaveValue('expense');
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('not used for the selected type');
    await dialog.dismiss();
  });
  await page.locator('#quick-income').click();
  await expect(page.locator('#transaction-type')).toHaveValue('expense');
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.locator('#quick-income').click();
  await expect(page.locator('#transaction-type')).toHaveValue('income');
  await expect(page.locator('#transaction-category')).toHaveValue('');
  await page.locator('#quick-expense').click();
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

  const editRow = page.locator('.transaction-item').filter({ hasText: 'Corner cafe' });
  await openTransactionActions(page, editRow);
  const editButton = editRow.getByRole('button', { name: 'Edit Corner cafe', exact: true });
  await editButton.click();
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  await page.locator('#close-transaction').click();
  await expect(editButton).toBeFocused();
});

test('income entry and advanced fields are keyboard reachable', async ({ page }) => {
  await setupWorkspace(page, 'Keyboard household');

  await page.locator('#primary-record').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  await page.locator('#quick-income').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#transaction-type')).toHaveValue('income');
  await expect(page.locator('#quick-income')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#transaction-amount').fill('0.1+0.2');
  await page.locator('#transaction-amount').press('Enter');
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  await expect(page.locator('#transaction-amount')).toHaveValue('0.30');
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

test('statistics show the top five expenses first and reveal the complete ranking', async ({ page }) => {
  await setupWorkspace(page, 'Statistics ranking household');
  await page.evaluate(async () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const [index, amountMinor] of (['100', '200', '300', '400', '500', '600'] as const).entries()) {
      await window.lunaLedger.createTransaction({
        type: 'expense',
        amountMinor,
        date,
        splits: [{ category: `Rank ${index + 1}`, amountMinor }],
        merchant: `Ranked expense ${index + 1}`,
      });
    }
  });
  await page.goto('/statistics');
  await expect(page.locator('#largest-expense-list .largest-expense-row')).toHaveCount(5);
  const toggle = page.locator('#statistics-largest-toggle');
  await expect(toggle).toHaveText('View all');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.locator('#largest-expense-list .largest-expense-row')).toHaveCount(6);
  await expect(toggle).toHaveText('Show top 5');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('image attachments stage, save, reload, and preview through the Web host', async ({ page }) => {
  await setupWorkspace(page, 'Image household');
  await openEntry(page, 'expense');
  await page.locator('#transaction-amount').fill('8.50');
  await page.locator('#transaction-category').fill('Photo');
  await page.locator('#transaction-images').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });
  await expect(page.locator('.attachment-preview')).toHaveCount(1);
  await expect(page.locator('.attachment-preview-meta')).toContainText('1×1');
  await page.locator('#save-transaction').click();
  await expect(page.locator('#transaction-list-region')).toContainText('8.50');

  const imageButton = page.locator('[id^="view-images-"]');
  await expect(imageButton).toHaveCount(1);
  await openTransactionActions(page, page.locator('.transaction-item:has([id^="view-images-"])'));
  await imageButton.click();
  await expect(page.locator('#transaction-image-dialog img')).toBeVisible();
  await expect(page.locator('#transaction-image-dialog img')).toHaveAttribute('src', /^blob:/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#transaction-image-dialog')).not.toBeVisible();

  await page.reload();
  await expect(page.locator('[id^="view-images-"]')).toHaveCount(1);
});

test('secondary menu and subdued filters stay discoverable without taking over the home', async ({ page }) => {
  await setupWorkspace(page, 'Discoverable household');

  await expect(page.locator('#filter-details')).not.toHaveAttribute('open', '');
  await page.locator('#filter-details summary').click();
  await expect(page.locator('#filter-form')).toBeVisible();
  await page.locator('#filter-details summary').click();

  await expect(page.locator('#open-secondary-menu .settings-navigation-icon')).toHaveCount(1);
  await expect(page.locator('#open-secondary-menu .menu-icon')).toHaveCount(0);
  await expect(page.locator('#open-secondary-menu')).not.toContainText('三');
  await page.locator('#open-secondary-menu').click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator('#settings-title')).toBeVisible();
  await expect(page.getByRole('link', { name: /Monthly spending limit|每月支出上限/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Encrypted backup|加密备份/i })).toBeVisible();
  await page.goto('/ledger');
  await expect(page.locator('#open-secondary-menu')).toBeVisible();
});

test.describe('desktop primary layout', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('keeps the recent ledger primary and opens entry on demand', async ({ page }) => {
    await setupWorkspace(page, 'Desktop household');
    await expect(page.locator('.transactions-panel')).toBeVisible();
    await expect(page.locator('.quick-entry-panel')).toHaveCount(0);
    await expect(page.locator('#open-secondary-menu')).toBeVisible();
    await expectRecordBelowMonth(page);
    await openEntry(page, 'expense');
  });
});

test.describe('wide desktop primary layout', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('keeps the record action below the month control at 1440px', async ({ page }) => {
    await setupWorkspace(page, 'Wide desktop household');
    await expectRecordBelowMonth(page);
  });
});

test.describe('tablet primary layout', () => {
  test.use({ viewport: { width: 768, height: 900 } });

  test('keeps the record action visible without horizontal overflow at 768px', async ({ page }) => {
    await setupWorkspace(page, 'Tablet household');
    await expectRecordBelowMonth(page, false);
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
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

test('375px home viewport keeps the month, summary, two records, and central entry action visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setupWorkspace(page, 'First viewport household');
  await page.evaluate(async () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const [type, amountMinor, category, merchant] of [
      ['expense', '1850', 'Food', 'Lunch'],
      ['expense', '4200', 'Home', ''],
      ['income', '250000', 'Salary', 'Employer'],
    ] as const) {
      await window.lunaLedger.createTransaction({
        type,
        amountMinor,
        date,
        splits: [{ category, amountMinor }],
        merchant,
        ...(merchant === 'Lunch'
          ? { notes: 'A long note that must remain complete in transaction details.' }
          : category === 'Home'
            ? { notes: 'Home note fallback title' }
            : {}),
      });
    }
  });
  await page.reload();
  await expect(page.locator('.transaction-item')).toHaveCount(3);
  await expect(page.locator('#month-picker')).toBeVisible();
  await expect(page.locator('#summary-grid .summary-card')).toHaveCount(3);
  await expect(page.locator('.primary-record-button')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const readBox = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    };
    return {
      viewportHeight: window.innerHeight,
      navigation: readBox(document.querySelector('.primary-navigation')),
      summary: readBox(document.querySelector('#summary-grid')),
      transactions: Array.from(document.querySelectorAll('.transaction-item'))
        .slice(0, 2)
        .map((element) => readBox(element)),
    };
  });
  expect(geometry.navigation).not.toBeNull();
  expect(geometry.summary).not.toBeNull();
  expect(geometry.summary?.bottom ?? geometry.viewportHeight + 1).toBeLessThanOrEqual(
    geometry.navigation?.top ?? 0,
  );
  expect(geometry.transactions).toHaveLength(2);
  for (const transaction of geometry.transactions) {
    expect(transaction).not.toBeNull();
    expect(transaction?.bottom ?? geometry.viewportHeight + 1).toBeLessThanOrEqual(
      geometry.navigation?.top ?? 0,
    );
  }
  await page.locator('.transaction-actions-trigger').first().click();
  await expect(page.locator('.transaction-actions-menu').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Edit / }).first()).toBeVisible();

  const detailedRecord = page.getByRole('button', { name: /Transaction details: Lunch/ });
  await detailedRecord.click();
  await expect(page.locator('#transaction-detail-dialog')).toBeVisible();
  await expect(page.locator('.transaction-day-heading')).toHaveCount(1);
  await expect(page.locator('#transaction-detail-notes')).toContainText(
    'A long note that must remain complete in transaction details.',
  );
  await page.keyboard.press('Escape');
  await expect(detailedRecord).toBeFocused();
  await detailedRecord.press('Enter');
  await expect(page.locator('#transaction-detail-dialog')).toBeVisible();
  await page.locator('#transaction-detail-edit').click();
  await expect(page.locator('#transaction-dialog')).toBeVisible();
  await expect(page.locator('#transaction-amount')).toHaveValue('18.50');
  await page.locator('#close-transaction').click();
  await expect(page.getByRole('button', { name: /Transaction details: Home note fallback title/ })).toBeVisible();
});

test('minimum mobile width keeps critical actions above the fixed navigation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await setupWorkspace(page, 'Minimum width household');
  await page.evaluate(async () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await window.lunaLedger.createTransaction({
      type: 'expense',
      amountMinor: '88888888',
      date,
      splits: [{ category: 'Large amount', amountMinor: '88888888' }],
      merchant: 'Large amount regression',
    });
  });
  await page.reload();
  await expect(page.locator('#transaction-list-region')).toContainText('Large amount regression');
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const record = page.locator('#primary-record');
  const navigation = page.locator('.primary-navigation');
  const [incomeBox, navigationBox] = await Promise.all([
    record.boundingBox(),
    navigation.boundingBox(),
  ]);
  expect(incomeBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect((incomeBox?.y ?? 0) + (incomeBox?.height ?? 0)).toBeLessThanOrEqual(
    navigationBox?.y ?? 0,
  );
});
