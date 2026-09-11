import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { encryptLedgerDocument, decryptLedgerDocument } from '../../src/shared/ledger-crypto';
import { appendLedgerRevision, mergeLedgerDocuments, type LedgerDocument } from '../../src/shared/ledger-sync';
import { reviseTransaction } from '../../src/shared/domain';

const password = 'synthetic household backup phrase';

async function seed(page: Page): Promise<LedgerDocument> {
  await page.goto('/');
  await expect(page.locator('#workspace-form')).toBeVisible();
  const document = await page.evaluate(async () => {
    await window.lunaLedger.createWorkspace({ name: 'Backup family', currency: 'CNY', precision: 2, monthlyBudgetMinor: '100000' });
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await window.lunaLedger.createTransaction({ type: 'expense', amountMinor: '1250', date,
      splits: [{ category: 'Food', amountMinor: '1250' }], merchant: 'Original market', notes: 'Original notes' });
    return window.lunaLedger.getLedgerDocument();
  });
  expect(document).not.toBeNull();
  await page.reload();
  await expect(page.locator('#transaction-list-region')).toContainText('Original market');
  return document!;
}

async function importBackup(page: Page, raw: string, phrase = password): Promise<void> {
  if (!(await page.locator('#secondary-menu-dialog').isVisible())) await page.getByRole('button', { name: 'Open more menu' }).click();
  const details = page.locator('#ledger-backup-details');
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
  await page.locator('#ledger-import-file').setInputFiles({ name: 'family.encrypted.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await page.locator('#ledger-import-password').fill(phrase);
  await page.locator('#ledger-import-confirm').check();
  await page.locator('#ledger-import-submit').click();
  await expect(page.locator('#ledger-import-submit')).toBeEnabled();
}

function branch(document: LedgerDocument, id: string, notes: string): LedgerDocument {
  const revision = document.revisions.find((item) => item.kind === 'transaction');
  if (revision?.kind !== 'transaction') throw new Error('Test transaction missing');
  const current = revision.value;
  return appendLedgerRevision(document, { id, kind: 'transaction', entityId: current.id,
    value: reviseTransaction(current, { type: current.type, amountMinor: '1250', date: current.date,
      splits: [{ category: 'Food', amountMinor: '1250' }], merchant: current.merchant, notes },
    document.workspace.precision, new Date().toISOString()) });
}

test('encrypted backup downloads and restores through setup UI without storing its password', async ({ page, browser }) => {
  const document = await seed(page);
  await page.getByRole('button', { name: 'Open more menu' }).click();
  await page.locator('#ledger-backup-details summary').click();
  await page.locator('#ledger-export-password').fill(password);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#ledger-export-submit').click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).not.toBeNull();
  const raw = await readFile(file!, 'utf8');
  expect(raw).not.toContain('Original market');
  expect(raw).not.toContain(password);
  expect(await decryptLedgerDocument(raw, password)).toEqual(document);
  await expect(page.locator('#ledger-export-password')).toHaveValue('');
  const context = await browser.newContext({ locale: 'en', viewport: page.viewportSize() });
  try {
    const restored = await context.newPage();
    await restored.goto(page.url());
    await expect(restored.locator('#workspace-form')).toBeVisible();
    await importBackup(restored, raw, 'this is a wrong password');
    await expect(restored.locator('#ledger-tools-alert')).toContainText(/password|damaged/i);
    await expect(restored.locator('#workspace-form')).toBeVisible();
    expect(await restored.evaluate(() => window.lunaLedger.getLedgerDocument())).toBeNull();
    await importBackup(restored, raw);
    await expect(restored.locator('#transaction-list-region')).toContainText('Original market');
    await expect(restored.locator('#income-total')).toHaveText('••••');
    await expect(restored.locator('#ledger-import-password')).toHaveValue('');
    expect(await restored.evaluate(() => window.lunaLedger.getLedgerDocument())).toEqual(document);
    await restored.reload();
    await expect(restored.locator('#transaction-list-region')).toContainText('Original market');
  } finally { await context.close(); }
});

test('backup merge and presentation changes retain financial drafts and the original edit revision', async ({ page }) => {
  const document = await seed(page);
  await page.getByRole('button', { name: 'Edit Original market', exact: true }).click();
  await page.locator('#transaction-notes').fill('Unsaved local draft');
  await page.locator('#close-transaction').click();
  await page.getByRole('button', { name: 'Open more menu' }).click();
  await page.locator('#budget-input').fill('321.09');
  await page.locator('#close-secondary-menu').click();
  await page.locator('#toggle-income-amounts').click();
  await page.getByRole('button', { name: 'Open more menu' }).click();
  await expect(page.locator('#transaction-notes')).toHaveValue('Unsaved local draft');
  await expect(page.locator('#budget-input')).toHaveValue('321.09');
  const remote = branch(document, 'remote-edit', 'Remote committed notes');
  await importBackup(page, await encryptLedgerDocument(remote, password));
  await expect(page.locator('#transaction-list-region')).toContainText('Remote committed notes');
  await expect(page.locator('#transaction-notes')).toHaveValue('Unsaved local draft');
  await expect(page.locator('#budget-input')).toHaveValue('321.09');
  await page.locator('#close-secondary-menu').click();
  await page.getByRole('button', { name: 'Edit Original market', exact: true }).click();
  await page.locator('#save-transaction').click();
  await expect(page.locator('#transaction-alert')).toContainText('changed');
  await expect(page.locator('#transaction-notes')).toHaveValue('Unsaved local draft');
  expect(await page.evaluate(() => window.lunaLedger.getLedgerDocument())).toEqual(remote);
});

test('conflict UI shows both safe candidates, excludes totals and resolves only an explicit choice', async ({ page }) => {
  const document = await seed(page);
  const left = branch(document, 'left-edit', 'Choose this version');
  const right = branch(document, 'right-edit', '<img src=x onerror=alert(1)>Other version');
  const conflicted = mergeLedgerDocuments(left, right);
  await importBackup(page, await encryptLedgerDocument(conflicted, password));
  await expect(page.locator('#ledger-conflict-notice')).toBeVisible();
  await expect(page.locator('#ledger-conflict-inbox')).toBeVisible();
  await expect(page.locator('.ledger-conflict-candidate')).toHaveCount(2);
  await expect(page.locator('#ledger-conflict-inbox img')).toHaveCount(0);
  await expect(page.locator('#transaction-list-region')).not.toContainText('Original market');
  await expect(page.locator('#expense-total')).toHaveText('••••');
  await page.locator('.ledger-conflict-candidate').filter({ hasText: 'Choose this version' }).getByRole('button').click();
  await expect(page.locator('#ledger-conflict-notice')).toBeHidden();
  await expect(page.locator('#ledger-conflict-inbox')).toBeHidden();
  await expect(page.locator('#transaction-list-region')).toContainText('Choose this version');
  const dimensions = await page.evaluate(() => ({ width: globalThis.document.documentElement.clientWidth, scroll: globalThis.document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
});
