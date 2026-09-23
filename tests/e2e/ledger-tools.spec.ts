import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { encryptLedgerDocument, decryptLedgerDocument } from '../../src/shared/ledger-crypto';
import { appendLedgerRevision, mergeLedgerDocuments, type LedgerDocument } from '../../src/shared/ledger-sync';
import { decodeFullBackup, FULL_BACKUP_MAGIC } from '../../src/shared/full-backup';
import { reviseTransaction } from '../../src/shared/domain';
import { isStoredTransaction, storedTransactionToTransaction } from '../../src/shared/ledger-record';
import { readLedgerDocument } from './helpers/public-ledger';

const password = 'synthetic household backup phrase';

async function seed(page: Page, withImage = false): Promise<LedgerDocument> {
  await page.goto('/');
  await expect(page.locator('#workspace-form')).toBeVisible();
  await page.evaluate(async (withImage) => {
    await window.lunaLedger.createWorkspace({ name: 'Backup family', currency: 'CNY', precision: 2, monthlyBudgetMinor: '100000' });
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const image = withImage ? await window.lunaLedger.stageTransactionImage('backup-image',
      Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c => c.charCodeAt(0)), 'image/png', 1, 1) : null;
    await window.lunaLedger.createTransaction({ type: 'expense', amountMinor: '1250', date,
      splits: [{ category: 'expense:0', amountMinor: '1250' }], merchant: 'Original market', notes: 'Original notes', attachments: image ? [{ draftToken: image.draftToken }] : [] });
  }, withImage);
  const document = await readLedgerDocument(page, password);
  expect(document).not.toBeNull();
  await page.reload();
  await expect(page.locator('#transaction-list-region')).toContainText('Original market');
  return document!;
}

async function importBackup(page: Page, raw: string | Uint8Array, phrase = password): Promise<void> {
  if (new URL(page.url()).pathname !== '/settings/backup') {
    await page.locator('#open-secondary-menu').click();
    await page.getByRole('link', { name: /Encrypted backup|加密备份/ }).click();
  }
  const details = page.locator('#ledger-backup-details');
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
  const buffer = Buffer.from(raw);
  const complete = buffer.subarray(0, FULL_BACKUP_MAGIC.length).toString('ascii') === FULL_BACKUP_MAGIC;
  await page.locator('#ledger-import-file').setInputFiles({
    name: complete ? 'family.luna-backup' : 'family.encrypted.json',
    mimeType: complete ? 'application/octet-stream' : 'application/json',
    buffer,
  });
  await page.locator('#ledger-import-password').fill(phrase);
  await page.locator('#ledger-import-confirm').check();
  await page.locator('#ledger-import-submit').click();
  await expect(page.locator('#ledger-import-submit')).toBeEnabled();
}

async function openTransactionActions(page: Page, merchant: string): Promise<void> {
  const row = page.locator('.transaction-item').filter({ hasText: merchant });
  await expect(row).toBeVisible();
  const trigger = row.locator('.transaction-actions-trigger');
  if (await trigger.isVisible()) await trigger.click();
}

function branch(document: LedgerDocument, id: string, notes: string, transactionId?: string): LedgerDocument {
  const revision = document.revisions.find((item) => item.kind === 'transaction' && (!transactionId || item.entityId === transactionId));
  if (revision?.kind !== 'transaction') throw new Error('Test transaction missing');
  const current = isStoredTransaction(revision.value)
    ? storedTransactionToTransaction(revision.value)
    : revision.value;
  return appendLedgerRevision(document, { id, kind: 'transaction', entityId: current.id,
    value: reviseTransaction(current, { type: current.type, amountMinor: '1250', date: current.date,
      splits: [{ category: 'expense:0', amountMinor: '1250' }], merchant: current.merchant, notes },
    document.workspace.precision, new Date().toISOString()) });
}

test('encrypted backup downloads and restores through setup UI without storing its password', async ({ page, browser }) => {
  const document = await seed(page, true);
  await page.locator('#open-secondary-menu').click();
  await page.getByRole('link', { name: /Encrypted backup|加密备份/ }).click();
  expect((await page.evaluate(() => window.lunaLedger.server!.status())).account).toBeNull();
  await page.context().setOffline(true);
  await page.locator('#ledger-export-password').fill(password);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#ledger-export-submit').click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).not.toBeNull();
  const raw = await readFile(file!);
  expect(raw.toString('utf8')).not.toContain('Original market');
  expect(raw.toString('utf8')).not.toContain(password);
  expect(raw.subarray(0, FULL_BACKUP_MAGIC.length).toString('ascii')).toBe(FULL_BACKUP_MAGIC);
  const fullGraph = (await decodeFullBackup(new Uint8Array(raw), password)).graph;
  expect(fullGraph).toEqual(document);
  await expect(page.locator('#ledger-export-password')).toHaveValue('');
  const context = await browser.newContext({ locale: 'en', viewport: page.viewportSize() });
  try {
    const restored = await context.newPage();
    await restored.goto(new URL("/", page.url()).href);
    await expect(restored.locator("#setup-restore")).toBeVisible();
    await context.setOffline(true);
    await restored.locator("#setup-restore").click();
    await expect(restored.locator('#workspace-form')).toHaveCount(0);
    await importBackup(restored, raw, 'this is a wrong password');
    await expect(restored.locator('#ledger-tools-alert')).toContainText(/password|damaged/i);
    await expect(restored.locator('#workspace-form')).toHaveCount(0);
    expect(await readLedgerDocument(restored, password)).toBeNull();
    await importBackup(restored, raw);
    await expect(restored.locator('#ledger-import-password')).toHaveValue('');
    await restored.locator('.brand').click();
    await expect(restored.locator('#transaction-list-region')).toContainText('Original market');
    await expect(restored.locator('#income-total')).toHaveText('••••');
    expect(await readLedgerDocument(restored, password)).toEqual(fullGraph);
    await context.setOffline(false);
    await restored.reload();
    await expect(restored.locator('#transaction-list-region')).toContainText('Original market');
    await openTransactionActions(restored, 'Original market');
    await restored.locator('[id^="view-images-"]').click();
    await expect(restored.locator('#transaction-image-dialog img')).toBeVisible();
    expect(await restored.locator('#transaction-image-dialog img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(1);
  } finally { await context.close(); }
});

test('backup merge and presentation changes retain financial drafts and the original edit revision', async ({ page }) => {
  const document = await seed(page);
  await openTransactionActions(page, 'Original market');
  await page.getByRole('button', { name: 'Edit Original market', exact: true }).click();
  await page.locator('#transaction-notes').fill('Unsaved local draft');
  await page.locator('#close-transaction').click();
  await page.locator('#open-secondary-menu').click();
  await page.getByRole('link', { name: /Preferences|偏好设置/ }).click();
  await page.locator('#hide-default').click();
  await page.locator('#open-secondary-menu').click();
  await page.getByRole('link', { name: /Encrypted backup|加密备份/ }).click();
  await expect(page.locator('#transaction-notes')).toHaveValue('Unsaved local draft');
  const remote = branch(document, 'remote-edit', 'Remote committed notes');
  await importBackup(page, await encryptLedgerDocument(remote, password));
  await page.locator('.brand').click();
  await expect(page.locator('#transaction-list-region')).toContainText('Remote committed notes');
  await expect(page.locator('#transaction-notes')).toHaveValue('Unsaved local draft');
  await openTransactionActions(page, 'Original market');
  await page.getByRole('button', { name: 'Edit Original market', exact: true }).click();
  await page.locator('#save-transaction').click();
  await expect(page.locator('#transaction-alert')).toContainText('changed');
  await expect(page.locator('#transaction-notes')).toHaveValue('Unsaved local draft');
  expect(await readLedgerDocument(page, password)).toEqual(remote);
});

test('conflict UI shows both safe candidates, excludes totals and resolves only an explicit choice', async ({ page }) => {
  const document = await seed(page);
  const left = branch(document, 'left-edit', 'Choose this version');
  const right = branch(document, 'right-edit', '<img src=x onerror=alert(1)>Other version');
  const conflicted = mergeLedgerDocuments(left, right);
  await importBackup(page, await encryptLedgerDocument(conflicted, password));
  await page.locator('.brand').click();
  await expect(page.locator('#ledger-conflict-notice')).toBeVisible();
  await page.locator('#open-secondary-menu').click();
  await page.getByRole('link', { name: /Conflicts|冲突处理/ }).click();
  await expect(page.locator('#ledger-conflict-inbox')).toBeVisible();
  await expect(page.locator('.ledger-conflict-candidate')).toHaveCount(2);
  await expect(page.locator('#ledger-conflict-inbox img')).toHaveCount(0);
  await page.locator('.brand').click();
  await expect(page.locator('#transaction-list-region')).not.toContainText('Original market');
  await expect(page.locator('#expense-total')).toHaveText('••••');
  await page.locator('#open-secondary-menu').click();
  await page.getByRole('link', { name: /Conflicts|冲突处理/ }).click();
  await expect(page.locator('#ledger-conflict-inbox')).toBeVisible();
  await page.locator('.ledger-conflict-candidate').filter({ hasText: 'Choose this version' }).getByRole('button').click();
  await expect(page.locator('#ledger-conflict-notice')).toBeHidden();
  await expect(page.locator('#ledger-conflict-inbox')).toBeHidden();
  await page.locator('.brand').click();
  await expect(page.locator('#transaction-list-region')).toContainText('Choose this version');
  const dimensions = await page.evaluate(() => ({ width: globalThis.document.documentElement.clientWidth, scroll: globalThis.document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
});


test('multiple real conflicts remain independent until each explicit decision is saved', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const snapshot = await window.lunaLedger.getSnapshot(new Date().toISOString().slice(0, 7));
    await window.lunaLedger.createTransaction({ type: 'expense', amountMinor: '1250', date: snapshot.transactions[0]!.date,
      splits: [{ category: 'expense:0', amountMinor: '1250' }], merchant: 'Second market', notes: '' });
  });
  const document = (await readLedgerDocument(page, password))!;
  const transactionIds = document.revisions.filter(item => item.kind === 'transaction').map(item => item.entityId);
  expect(transactionIds).toHaveLength(2);
  let left = document;
  let right = document;
  for (const [index, id] of transactionIds.entries()) {
    left = branch(left, `left-${index}`, `Chosen version ${index}`, id);
    right = branch(right, `right-${index}`, `Other version ${index}`, id);
  }
  await importBackup(page, await encryptLedgerDocument(mergeLedgerDocuments(left, right), password));
  await page.locator('#open-secondary-menu').click();
  await page.getByRole('link', { name: /Conflicts|冲突处理/ }).click();
  await expect(page.locator('.ledger-conflict')).toHaveCount(2);
  await expect(page.locator('.ledger-conflict-candidate')).toHaveCount(4);
  await expect(page.locator('#ledger-conflicts-empty')).toHaveCount(0);
  await page.locator('.ledger-conflict-candidate').filter({ hasText: 'Chosen version 0' }).getByRole('button').click();
  await expect(page.locator('.ledger-conflict')).toHaveCount(1);
  await expect(page.locator('#ledger-conflicts-empty')).toHaveCount(0);
  await page.locator('.ledger-conflict-candidate').filter({ hasText: 'Chosen version 1' }).getByRole('button').click();
  await expect(page.locator('#ledger-conflicts-empty')).toBeVisible();
  await expect(page.locator('.ledger-conflict')).toHaveCount(0);
});
