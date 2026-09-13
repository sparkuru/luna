import { startObjectServer as startS3ObjectServer } from './helpers/s3-object-server';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createTransaction, type TransactionDraft } from '../../src/shared/domain';
import { decryptLedgerDocument, encryptLedgerDocument } from '../../src/shared/ledger-crypto';
import type { LedgerConflictChoice } from '../../src/shared/ledger-data';
import { appendLedgerRevision, seedLedgerDocument } from '../../src/shared/ledger-sync';
import type { ConfigureConfigSyncInput } from '../../src/shared/settings';
import { readLedgerDocument } from './helpers/public-ledger';

const PASSWORD = 'browser-test-only-ledger-password';
const ACCESS_KEY = 'BROWSER_TEST_ACCESS_SENTINEL';
const SECRET_KEY = 'BROWSER_TEST_SECRET_SENTINEL';
const OBJECT_PATH = '/ledger-browser-tests/browser/ledger-v1.enc.json';
const draft: TransactionDraft = {
  type: 'expense', amountMinor: '1234', date: '2026-09-05',
  splits: [{ category: 'Private browser category', amountMinor: '1234' }],
  merchant: 'Private browser merchant', notes: 'Private browser financial note',
};

function connection(endpoint: string, password = PASSWORD): ConfigureConfigSyncInput {
  return {
    connection: { endpoint, region: 'us-east-1', bucket: 'ledger-browser-tests', prefix: 'browser/', forcePathStyle: true },
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY, passphrase: password },
    rememberSecrets: false,
  };
}

function startObjectServer(origin: string) { return startS3ObjectServer(origin, OBJECT_PATH, ACCESS_KEY); }

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.lunaLedger?.configureLedgerSync === 'function');
}

async function sync(page: Page): Promise<void> {
  expect((await page.evaluate(() => window.lunaLedger.syncLedgerNow())).code).toBe('synced');
}

async function persistedState(page: Page): Promise<string> {
  const ledger = await readLedgerDocument(page, PASSWORD);
  const state = await page.evaluate(async () => ({
    settings: await window.lunaLedger.getSettings(),
    legacy: localStorage.getItem('luna.web.state.v1'),
  }));
  return JSON.stringify({ ledger, ...state });
}

test('real browser clients sync encrypted ledgers, merge offline edit/delete conflicts, and converge', async ({ page, context, browser, baseURL }) => {
  test.setTimeout(60_000);
  await ready(page);
  const remote = await startObjectServer(new URL(page.url()).origin);
  let secondContext: BrowserContext | undefined;
  try {
    secondContext = await browser.newContext({ ...(baseURL === undefined ? {} : { baseURL }), locale: 'en-US', viewport: page.viewportSize() ?? { width: 375, height: 800 } });
    const second = await secondContext.newPage();
    await ready(second);
    const record = await page.evaluate(async (input) => {
      await window.lunaLedger.createWorkspace({ name: 'Browser sync household', currency: 'CNY', precision: 2, monthlyBudgetMinor: '50000' });
      return window.lunaLedger.createTransaction(input);
    }, draft);
    await page.evaluate((input) => window.lunaLedger.configureLedgerSync(input), connection(remote.endpoint));
    remote.state.conflictOnce = true;
    await sync(page);
    expect(remote.state.conflicts).toBe(1);
    expect(remote.state.gets).toBe(2);
    expect(remote.state.puts).toBe(2);
    expect(await readLedgerDocument(second, PASSWORD)).toBeNull();
    await second.evaluate((input) => window.lunaLedger.configureLedgerSync(input), connection(remote.endpoint));
    await sync(second);
    expect(await readLedgerDocument(second, PASSWORD)).toEqual(await readLedgerDocument(page, PASSWORD));
    expect((await page.evaluate(() => window.lunaLedger.getLedgerSyncStatus())).code).toBe('synced');
    expect((await second.evaluate(() => window.lunaLedger.getLedgerSyncStatus())).code).toBe('synced');
    const callsBeforeOffline = { gets: remote.state.gets, puts: remote.state.puts };
    await context.setOffline(true);
    await secondContext.setOffline(true);
    await page.evaluate(({ id, input }) => window.lunaLedger.updateTransaction(id, input, 1), { id: record.id, input: { ...draft, notes: 'Edited while browser offline' } });
    await second.evaluate((id) => window.lunaLedger.deleteTransaction(id, 1), record.id);
    expect((await page.evaluate(() => window.lunaLedger.getLedgerSyncStatus())).code).toBe('pending');
    expect((await second.evaluate(() => window.lunaLedger.getLedgerSyncStatus())).code).toBe('pending');
    expect({ gets: remote.state.gets, puts: remote.state.puts }).toEqual(callsBeforeOffline);
    await context.setOffline(false);
    await secondContext.setOffline(false);
    await sync(page);
    await sync(second);
    await sync(page);
    const conflicts = await page.evaluate(() => window.lunaLedger.getLedgerConflicts());
    expect(conflicts).toHaveLength(1);
    const conflict = conflicts[0];
    if (conflict?.kind !== 'transaction') throw new Error('Expected transaction conflict');
    const deleted = conflict.heads.find((head) => head.value.deletedAt !== null);
    if (deleted === undefined) throw new Error('Expected deletion candidate');
    expect((await page.evaluate(() => window.lunaLedger.getSnapshot('2026-09'))).transactions).toHaveLength(0);
    const choice: LedgerConflictChoice = {
      kind: 'transaction', entityId: record.id, selectedHeadId: deleted.id, expectedHeadIds: conflict.heads.map((head) => head.id),
    };
    await page.evaluate((input) => window.lunaLedger.resolveLedgerConflict(input), choice);
    await sync(page);
    await sync(second);
    const final = await readLedgerDocument(page, PASSWORD);
    expect(await readLedgerDocument(second, PASSWORD)).toEqual(final);
    expect(await second.evaluate(() => window.lunaLedger.getLedgerConflicts())).toEqual([]);
    const snapshot = await second.evaluate(() => window.lunaLedger.getSnapshot('2026-09'));
    expect(snapshot.transactions[0]?.deletedAt).not.toBeNull();
    expect(snapshot.transactions[0]?.revision).toBe(3);
    expect(snapshot.summary?.totalExpenseMinor).toBe('0');
    expect(remote.state.body).not.toBeNull();
    const encrypted = remote.state.body ?? '';
    for (const text of [PASSWORD, ACCESS_KEY, SECRET_KEY, 'Private browser financial note', 'amountMinor', 'Browser sync household']) expect(encrypted).not.toContain(text);
    expect(await decryptLedgerDocument(encrypted, PASSWORD)).toEqual(final);
    for (const client of [page, second]) {
      const persisted = await persistedState(client);
      for (const secret of [PASSWORD, ACCESS_KEY, SECRET_KEY]) expect(persisted).not.toContain(secret);
    }
    expect(remote.state.preflights).toBeGreaterThan(0);
    expect(remote.state.signedRequests).toBe(remote.state.gets + remote.state.puts);
    expect(remote.state.failures).toEqual([]);
    await page.reload();
    await page.waitForFunction(() => typeof window.lunaLedger?.getLedgerSyncStatus === 'function');
    expect((await page.evaluate(() => window.lunaLedger.getLedgerSyncStatus())).code).toBe('disabled');
    expect(await readLedgerDocument(page, PASSWORD)).toEqual(final);
  } finally {
    try {
      await context.setOffline(false);
      await secondContext?.close();
    } finally {
      await remote.close();
    }
  }
});

test('real browser clients sync encrypted image objects and read them after the second client restarts', async ({ page, context, browser, baseURL }) => {
  test.setTimeout(90_000);
  await ready(page);
  const remote = await startObjectServer(new URL(page.url()).origin);
  const image = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
    0, 0, 0, 0,
  ];
  let secondContext: BrowserContext | undefined;
  try {
    await page.evaluate(() => window.lunaLedger.createWorkspace({
      name: 'Browser image sync household', currency: 'CNY', precision: 2, monthlyBudgetMinor: null,
    }));
    await context.setOffline(true);
    const created = await page.evaluate(async (bytes) => {
      const staged = await window.lunaLedger.stageTransactionImage(
        'browser-image-draft', new Uint8Array(bytes), 'image/png', 1, 1,
      );
      return window.lunaLedger.createTransaction({
        type: 'expense', amountMinor: '1234', date: '2026-09-05',
        splits: [{ category: 'Browser image category', amountMinor: '1234' }],
        merchant: 'Browser image merchant', notes: 'Browser encrypted image note',
        attachments: [{ draftToken: staged.draftToken }],
      });
    }, image);
    await context.setOffline(false);
    await page.evaluate((input) => window.lunaLedger.configureLedgerSync(input), connection(remote.endpoint));
    const firstSync = await page.evaluate(() => window.lunaLedger.syncLedgerNow());
    if (firstSync.code !== 'synced') {
      throw new Error(`Image sync did not complete: ${JSON.stringify({
        status: firstSync,
        events: remote.state.events,
        attachmentGets: remote.state.attachmentGets,
        attachmentPuts: remote.state.attachmentPuts,
        failures: remote.state.failures,
      })}`);
    }

    const attachmentId = created.attachments?.[0]?.id;
    expect(attachmentId).toBeDefined();
    expect(remote.state.attachments.has(attachmentId!)).toBe(true);
    const attachmentPut = remote.state.events.findIndex((event) => event === `attachment-put:${attachmentId}`);
    const graphPut = remote.state.events.indexOf('graph-put');
    expect(attachmentPut).toBeGreaterThanOrEqual(0);
    expect(graphPut).toBeGreaterThan(attachmentPut);
    expect(remote.state.attachmentPuts).toBe(1);
    expect(remote.state.attachmentGets).toBeGreaterThanOrEqual(2);
    expect(remote.state.failures).toEqual([]);
    const remoteObject = remote.state.attachments.get(attachmentId!);
    expect(remoteObject).toBeDefined();
    expect(remoteObject!.body.equals(Buffer.from(image))).toBe(false);
    expect(remoteObject!.body.length).toBe(image.length + 16);

    secondContext = await browser.newContext({
      ...(baseURL === undefined ? {} : { baseURL }),
      locale: 'en-US', viewport: page.viewportSize() ?? { width: 375, height: 800 },
    });
    const second = await secondContext.newPage();
    await ready(second);
    await second.evaluate((input) => window.lunaLedger.configureLedgerSync(input), connection(remote.endpoint));
    await sync(second);
    const secondSnapshot = await second.evaluate(() => window.lunaLedger.getSnapshot('2026-09'));
    const secondTransaction = secondSnapshot.transactions.find((transaction) => transaction.id === created.id);
    expect(secondTransaction?.attachments?.map((item) => item.id)).toEqual([attachmentId]);
    const restored = await second.evaluate(async ({ transactionId, id }) => {
      const result = await window.lunaLedger.readTransactionImage(transactionId, id);
      const value = {
        bytes: Array.from(result.bytes), mime: result.mime, width: result.width, height: result.height,
      };
      result.bytes.fill(0);
      return value;
    }, { transactionId: created.id, id: attachmentId! });
    expect(restored).toEqual({ bytes: image, mime: 'image/png', width: 1, height: 1 });
    await second.reload();
    await second.waitForFunction(() => typeof window.lunaLedger?.readTransactionImage === 'function');
    const afterRestart = await second.evaluate(async ({ transactionId, id }) => {
      const result = await window.lunaLedger.readTransactionImage(transactionId, id);
      const bytes = Array.from(result.bytes);
      result.bytes.fill(0);
      return { bytes, mime: result.mime, width: result.width, height: result.height };
    }, { transactionId: created.id, id: attachmentId! });
    expect(afterRestart).toEqual(restored);
  } finally {
    await context.setOffline(false);
    await secondContext?.close();
    await remote.close();
  }
});

test('Node-encrypted restore and browser password, tamper, and HTTP 403 failures preserve stored data', async ({ page }) => {
  test.setTimeout(60_000);
  await ready(page);
  const remote = await startObjectServer(new URL(page.url()).origin);
  try {
    const document = seedLedgerDocument({
      id: 'node-created-workspace', name: 'Node encrypted household', currency: 'CNY', precision: 2, createdAt: '2026-09-01T00:00:00.000Z',
    }, [createTransaction('node-record', draft, 2, '2026-09-05T01:00:00.000Z')], { '2026-09': '50000' });
    remote.replace(await encryptLedgerDocument(document, PASSWORD));
    const originalRemote = remote.state.body;
    await page.evaluate((input) => window.lunaLedger.configureLedgerSync(input), connection(remote.endpoint, 'wrong-browser-ledger-password'));
    await expect(page.evaluate(() => window.lunaLedger.syncLedgerNow())).rejects.toThrow('ledger-wrong-password-or-tampered');
    expect(await readLedgerDocument(page, PASSWORD)).toBeNull();
    expect(remote.state.body).toBe(originalRemote);
    expect(remote.state.puts).toBe(0);
    await page.evaluate((input) => window.lunaLedger.configureLedgerSync(input), connection(remote.endpoint));
    await sync(page);
    expect(await readLedgerDocument(page, PASSWORD)).toEqual(document);
    const committed = await persistedState(page);
    remote.state.denyReads = true;
    await expect(page.evaluate(() => window.lunaLedger.syncLedgerNow())).rejects.toThrow('ledger-remote-permission');
    expect(await persistedState(page)).toBe(committed);
    expect(remote.state.body).toBe(originalRemote);
    remote.state.denyReads = false;
    const tampered = (originalRemote ?? '').replace(/("ciphertext":")([A-Za-z0-9+/])/, (_whole, prefix: string, first: string) => `${prefix}${first === 'A' ? 'B' : 'A'}`);
    expect(tampered).not.toBe(originalRemote);
    remote.replace(tampered);
    await expect(page.evaluate(() => window.lunaLedger.syncLedgerNow())).rejects.toThrow('ledger-wrong-password-or-tampered');
    expect(await persistedState(page)).toBe(committed);
    expect(remote.state.body).toBe(tampered);
    expect(remote.state.puts).toBe(0);
    expect(remote.state.failures).toEqual([]);
  } finally {
    await remote.close();
  }
});

test('budget forms reject another tab update without losing the stale draft', async ({ page, context }) => {
  await ready(page);
  await page.evaluate(() => window.lunaLedger.createWorkspace({ name: 'Budget tabs', currency: 'CNY', precision: 2, monthlyBudgetMinor: '100000' }));
  await page.reload();
  await page.goto('/budget');
  await expect(page.locator('#budget-input')).toHaveValue('1000.00');
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.locator('#budget-input')).toHaveValue('1000.00');
  await page.locator('#budget-input').fill('1500.00');
  await second.locator('#budget-input').fill('2000.00');
  await second.locator('#save-budget').click();
  await expect(second.locator('#save-budget')).toBeEnabled();
  const committed = await readLedgerDocument(second, PASSWORD);
  await page.locator('#save-budget').click();
  await expect(page.locator('#budget-alert')).toContainText(/budget.*changed/i);
  await expect(page.locator('#budget-input')).toHaveValue('1500.00');
  await expect(page.locator('#budget-input')).toBeFocused();
  expect(await readLedgerDocument(page, PASSWORD)).toEqual(committed);
  await second.close();
});

test('encrypted sync and presentation refresh never upgrade a budget draft precondition', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.lunaLedger.createWorkspace({ name: 'Budget sync', currency: 'CNY', precision: 2, monthlyBudgetMinor: '100000' }));
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: 'Recent ledger', exact: true })
    .click();
  const month = await page.locator('#month-picker').inputValue();
  await page.goto('/budget');
  await expect(page.locator('#budget-input')).toHaveValue('1000.00');
  const original = await readLedgerDocument(page, PASSWORD);
  if (original === null) throw new Error('Missing budget fixture');
  const updated = appendLedgerRevision(original, { id: 'remote-budget-update', kind: 'budget', entityId: month, value: '200000' });
  const remote = await startObjectServer(new URL(page.url()).origin);
  try {
    remote.replace(await encryptLedgerDocument(updated, PASSWORD));
    await page.locator('#budget-input').fill('1500.00');
    await page.evaluate((input) => window.lunaLedger.configureLedgerSync(input), connection(remote.endpoint));
    await page.evaluate(() => window.lunaLedger.updateSettings({ hideSensitiveAmountsByDefault: true }));
    const syncStatus = await page.evaluate(() => window.lunaLedger.syncLedgerNow());
    expect(syncStatus.code).toBe('synced');
    await expect(page.locator('#budget-input')).toHaveValue('1500.00');
    expect(await readLedgerDocument(page, PASSWORD)).toEqual(updated);
    // Re-rendering committed presentation settings must retain the old causal token too.
    await page.evaluate(() => window.lunaLedger.updateSettings({ hideSensitiveAmountsByDefault: false }));
    await page.locator('#save-budget').click();
    await expect(page.locator('#budget-alert')).toContainText(/budget.*changed/i);
    await expect(page.locator('#budget-input')).toHaveValue('1500.00');
    expect(await readLedgerDocument(page, PASSWORD)).toEqual(updated);
    expect(remote.state.failures).toEqual([]);
  } finally { await remote.close(); }
});
