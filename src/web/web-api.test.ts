import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBDatabase as FakeIDBDatabase, IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import {
  createTransaction, DomainError, localMonthFromTimestamp, tombstoneTransaction, type TransactionDraft,
} from '../shared/domain';
import { createDefaultSettings } from '../shared/settings';
import { LedgerSyncError } from '../shared/ledger-sync';
import { LedgerSessionError } from '../shared/ledger-session';
import type { LedgerDataPort } from '../sync/ledger-service';
import { createWebLedgerApi } from './web-api';
import {
  WEB_DATABASE_NAME, WEB_DATABASE_RECORD, WEB_DATABASE_STORE, WEB_LEGACY_STORAGE_KEY,
} from './browser-state-store';

const setup = { name: 'Household', currency: 'CNY', precision: 2, monthlyBudgetMinor: '50000' };
const draft: TransactionDraft = {
  type: 'expense', amountMinor: '1234', date: '2026-09-05',
  splits: [{ category: 'Food', amountMinor: '1234' }], notes: 'Lunch',
};

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  failReads = false;
  removals = 0;
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  getItem(key: string): string | null {
    if (this.failReads) throw new Error('Storage access denied');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.removals += 1; this.values.delete(key); }
}

function fixture() {
  const storage = new MemoryStorage();
  const database = new IDBFactory();
  const api = createWebLedgerApi(storage, database);
  return { storage, database, api };
}

test('browser settings sync is available while credentials remain session-only and never enter IDB or legacy bytes', async () => {
  const { api, storage, database } = fixture();
  const configuration = {
    connection: { endpoint: 'https://config.example.test', region: 'us-east-1', bucket: 'browser-config-tests', prefix: 'portable', forcePathStyle: true },
    credentials: { accessKeyId: 'CONFIG_ACCESS_SENTINEL', secretAccessKey: 'CONFIG_SECRET_SENTINEL', passphrase: 'config test-only passphrase' },
    rememberSecrets: true,
  };
  const configured = await api.configureConfigSync(configuration);
  assert.equal(configured.configSyncAvailable, true);
  assert.equal(configured.hasConfigSyncSecrets, true);
  assert.equal(configured.secretPersistence, 'session-only');
  await api.updateSettings({ syncAllPortableSettings: true, locale: 'zh-CN' });
  const persisted = await rawState(database);
  assert.ok(persisted);
  for (const secret of Object.values(configuration.credentials)) assert.equal(persisted.includes(secret), false);
  assert.equal(storage.getItem(WEB_LEGACY_STORAGE_KEY), null);
  const reopened = createWebLedgerApi(storage, database);
  assert.equal((await reopened.getSettings()).hasConfigSyncSecrets, false);
  assert.equal((await reopened.getSettings()).locale, 'zh-CN');
  await assert.rejects(reopened.syncConfigNow(), /missing-secrets/);
  await api.clearConfigSync();
  assert.equal((await api.getSettings()).syncConnection, null);
  assert.equal((await api.syncConfigNow()).code, 'disabled');
});

test('failed browser config setup does not publish credentials or partially replace persisted settings', async (t) => {
  const { api, database } = fixture();
  await api.createWorkspace(setup);
  const original = await rawState(database);
  const put = t.mock.method(IDBObjectStore.prototype, 'put', () => { throw new DOMException('Quota', 'QuotaExceededError'); });
  await assert.rejects(api.configureConfigSync({
    connection: { endpoint: 'https://config.example.test', region: 'us-east-1', bucket: 'browser-config-tests', prefix: 'portable', forcePathStyle: true },
    credentials: { accessKeyId: 'ACCESS_SENTINEL', secretAccessKey: 'SECRET_SENTINEL', passphrase: 'test-only passphrase' }, rememberSecrets: false,
  }), /web-storage-write-failed/);
  put.mock.restore();
  assert.equal(await rawState(database), original);
  assert.equal((await api.getSettings()).hasConfigSyncSecrets, false);
});

test('two browser clients reject stale budget drafts inside the write transaction', async () => {
  const { storage, database, api } = fixture();
  await api.createWorkspace(setup);
  const second = createWebLedgerApi(storage, database);
  const absent = (await api.getSnapshot('2025-01')).budgetHeadIds;
  assert.deepEqual(absent, []);
  await second.setMonthlyBudget('2025-01', '100', absent);
  const bytes = await rawState(database);
  await assert.rejects(api.setMonthlyBudget('2025-01', '200', absent), /ledger-stale-budget/);
  assert.equal(await rawState(database), bytes);
  const observed = (await api.getSnapshot('2025-02')).budgetHeadIds;
  assert.ok(observed);
  await second.setMonthlyBudget('2025-01', '300', observed);
  const latest = await api.getLedgerDocument();
  await assert.rejects(api.setMonthlyBudget('2025-02', '400', observed), /ledger-stale-budget/);
  assert.deepEqual(await api.getLedgerDocument(), latest);
  const current = (await api.getSnapshot('2025-02')).budgetHeadIds;
  await api.setMonthlyBudget('2025-02', '400', current);
  assert.equal((await second.getSnapshot('2025-02')).summary?.budgetMinor, '400');
});

async function openDatabase(factory: IDBFactory, version = 1): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(WEB_DATABASE_NAME, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function rawState(factory: IDBFactory, value?: string): Promise<string | undefined> {
  const database = await openDatabase(factory);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(WEB_DATABASE_STORE, value === undefined ? 'readonly' : 'readwrite');
    const store = transaction.objectStore(WEB_DATABASE_STORE);
    if (value !== undefined) store.put(value, WEB_DATABASE_RECORD);
    const request = store.get(WEB_DATABASE_RECORD);
    transaction.oncomplete = () => { database.close(); resolve(request.result); };
    transaction.onabort = () => { database.close(); reject(transaction.error); };
  });
}

test('workspace persists in IndexedDB, survives reopening, and never writes the legacy key', async () => {
  const { storage, database, api } = fixture();
  const workspace = await api.createWorkspace(setup);
  const restored = createWebLedgerApi(storage, database);
  const snapshot = await restored.getSnapshot(localMonthFromTimestamp(workspace.createdAt));
  assert.deepEqual(snapshot.workspace, workspace);
  assert.equal(snapshot.summary?.budgetMinor, setup.monthlyBudgetMinor);
  assert.equal(storage.getItem(WEB_LEGACY_STORAGE_KEY), null);
  assert.ok(await rawState(database));
});

test('quota failure during put rejects without publishing state and permits retry', async (t) => {
  const { database, api } = fixture();
  const put = t.mock.method(IDBObjectStore.prototype, 'put', () => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  });
  await assert.rejects(api.createWorkspace(setup), /LUNA_ERROR:web-storage-write-failed/);
  assert.equal((await api.getSnapshot('2026-09')).workspace, null);
  assert.equal(await rawState(database), undefined);
  put.mock.restore();
  await api.createWorkspace(setup);
  assert.equal((await api.getSnapshot('2026-09')).workspace?.name, 'Household');
});

test('a storage failure that already aborted its transaction produces no secondary exception', async (t) => {
  const { api } = fixture();
  const put = t.mock.method(IDBObjectStore.prototype, 'put', function (this: IDBObjectStore) {
    this.transaction.abort();
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  });
  await assert.rejects(api.createWorkspace(setup), /LUNA_ERROR:web-storage-write-failed/);
  put.mock.restore();
  assert.equal((await api.getSnapshot('2026-09')).workspace, null);
  await api.createWorkspace(setup);
});

test('abort after a successful put request never reports a committed mutation', async (t) => {
  const { database, api } = fixture();
  await api.createWorkspace(setup);
  const originalBytes = await rawState(database);
  const original = IDBObjectStore.prototype.put;
  const put = t.mock.method(IDBObjectStore.prototype, 'put', function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
    const request = original.apply(this, args);
    request.addEventListener('success', () => this.transaction.abort());
    return request;
  });
  await assert.rejects(api.createTransaction(draft), /LUNA_ERROR:web-storage-write-failed/);
  assert.equal(await rawState(database), originalBytes);
  assert.equal((await api.getSnapshot('2026-09')).transactions.length, 0);
  put.mock.restore();
  await api.createTransaction(draft);
  assert.equal((await api.getSnapshot('2026-09')).transactions.length, 1);
});

test('failed create, edit, delete, budget, and settings transactions preserve bytes and revisions', async (t) => {
  const { database, api } = fixture();
  await api.createWorkspace(setup);
  const transaction = await api.createTransaction(draft);
  const actions = [
    () => api.createTransaction(draft),
    () => api.updateTransaction(transaction.id, { ...draft, notes: 'Updated' }, 1),
    () => api.deleteTransaction(transaction.id, 2),
    () => api.setMonthlyBudget('2026-09', '70000'),
    () => api.updateSettings({ locale: 'zh-CN' }),
  ];
  for (const action of actions) {
    const bytes = await rawState(database);
    const snapshot = await api.getSnapshot('2026-09');
    const put = t.mock.method(IDBObjectStore.prototype, 'put', () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    await assert.rejects(action(), /LUNA_ERROR:web-storage-write-failed/);
    assert.equal(await rawState(database), bytes);
    assert.deepEqual(await api.getSnapshot('2026-09'), snapshot);
    put.mock.restore();
    await action();
  }
  const snapshot = await api.getSnapshot('2026-09');
  assert.equal(snapshot.transactions.length, 2);
  assert.equal(snapshot.transactions.find((item) => item.id === transaction.id)?.revision, 3);
  assert.equal(snapshot.summary?.totalExpenseMinor, '1234');
  assert.equal(snapshot.summary?.budgetMinor, '70000');
  assert.equal((await api.getSettings()).locale, 'zh-CN');
});

test('legacy migration validates and copies exact bytes once while preserving the original', async () => {
  const source = fixture();
  await source.api.createWorkspace(setup);
  await source.api.createTransaction(draft);
  const bytes = await rawState(source.database);
  assert.ok(bytes);
  const { storage, database, api } = fixture();
  storage.setItem(WEB_LEGACY_STORAGE_KEY, bytes);
  assert.equal((await api.getSnapshot('2026-09')).transactions.length, 1);
  assert.equal(await rawState(database), bytes);
  assert.equal(storage.getItem(WEB_LEGACY_STORAGE_KEY), bytes);
  storage.setItem(WEB_LEGACY_STORAGE_KEY, '{obsolete source');
  await api.createTransaction(draft);
  assert.equal((await api.getSnapshot('2026-09')).transactions.length, 2);
  assert.equal(storage.getItem(WEB_LEGACY_STORAGE_KEY), '{obsolete source');
  assert.equal(storage.removals, 0);
});

test('corrupt or unsupported legacy bytes are preserved and never create an authoritative record', async () => {
  for (const raw of ['{broken json', '{"schemaVersion":99}', '{"schemaVersion":1}']) {
    const { storage, database, api } = fixture();
    storage.setItem(WEB_LEGACY_STORAGE_KEY, raw);
    await assert.rejects(api.getSettings(), /LUNA_ERROR:web-storage-invalid/);
    await assert.rejects(api.createWorkspace(setup), /LUNA_ERROR:web-storage-invalid/);
    assert.equal(await rawState(database), undefined);
    assert.equal(storage.getItem(WEB_LEGACY_STORAGE_KEY), raw);
    assert.equal(storage.removals, 0);
  }
});

test('migration abort preserves legacy bytes and can be retried', async (t) => {
  const source = fixture();
  await source.api.createWorkspace(setup);
  const bytes = await rawState(source.database);
  assert.ok(bytes);
  const { storage, database, api } = fixture();
  storage.setItem(WEB_LEGACY_STORAGE_KEY, bytes);
  const put = t.mock.method(IDBObjectStore.prototype, 'put', () => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  });
  await assert.rejects(api.getSettings(), /LUNA_ERROR:web-storage-write-failed/);
  assert.equal(await rawState(database), undefined);
  assert.equal(storage.getItem(WEB_LEGACY_STORAGE_KEY), bytes);
  put.mock.restore();
  await api.getSettings();
  assert.equal(await rawState(database), bytes);
});

test('corrupt authoritative bytes remain untouched and valid restoration recovers reads', async () => {
  const { database, api } = fixture();
  await api.createWorkspace(setup);
  await api.createTransaction(draft);
  const bytes = await rawState(database);
  assert.ok(bytes);
  const corrupt = bytes.replace('"amountMinor":"-1234"', '"amountMinor":"-9999"');
  await rawState(database, corrupt);
  await assert.rejects(api.getSnapshot('2026-09'), /LUNA_ERROR:web-storage-invalid/);
  await assert.rejects(api.setMonthlyBudget('2026-09', '1'), /LUNA_ERROR:web-storage-invalid/);
  assert.equal(await rawState(database), corrupt);
  await rawState(database, bytes);
  assert.equal((await api.getSnapshot('2026-09')).summary?.totalExpenseMinor, '1234');
});

test('unavailable IndexedDB rejects asynchronously instead of falling back to legacy storage', async () => {
  const storage = new MemoryStorage();
  const api = createWebLedgerApi(storage, null);
  await assert.rejects(api.getSettings(), /LUNA_ERROR:web-storage-unavailable/);
  await assert.rejects(api.createWorkspace(setup), /LUNA_ERROR:web-storage-unavailable/);
  assert.equal(storage.length, 0);
});

test('opening failures are explicit and the same adapter can retry', async (t) => {
  const { database, api } = fixture();
  const open = t.mock.method(database, 'open', () => {
    throw new DOMException('Access denied', 'SecurityError');
  });
  await assert.rejects(api.getSettings(), /LUNA_ERROR:web-storage-unavailable/);
  open.mock.restore();
  await api.createWorkspace(setup);
});

test('a blocked schema upgrade rejects, cancels the abandoned upgrade, and allows retry', async (t) => {
  const { database, api } = fixture();
  await api.createWorkspace(setup);
  const heldConnection = await openDatabase(database);
  const originalOpen = database.open.bind(database);
  // Exercise the same open/blocked lifecycle that a future schema version uses.
  t.mock.method(database, 'open', (name: string) => originalOpen(name, 2));
  try {
    await assert.rejects(api.getSettings(), /LUNA_ERROR:web-storage-blocked/);
  } finally {
    heldConnection.close();
  }
  assert.equal((await api.getSnapshot('2026-09')).workspace?.name, 'Household');
});

test('unavailable migration source is retryable and is ignored after an IndexedDB commit', async () => {
  const { storage, api } = fixture();
  storage.failReads = true;
  await assert.rejects(api.getSettings(), /LUNA_ERROR:web-storage-unavailable/);
  storage.failReads = false;
  await api.createWorkspace(setup);
  storage.failReads = true;
  await api.createTransaction(draft);
  assert.equal((await api.getSnapshot('2026-09')).transactions.length, 1);
});

test('future IndexedDB schema is rejected without destroying its existing record', async () => {
  const { database, api } = fixture();
  await api.createWorkspace(setup);
  const future = await openDatabase(database, 2);
  future.close();
  await assert.rejects(api.getSettings(), /LUNA_ERROR:web-storage-invalid/);
  const reopened = await openDatabase(database, 2);
  assert.ok(reopened.objectStoreNames.contains(WEB_DATABASE_STORE));
  reopened.close();
});

test('independent adapters read latest commits and concurrent transactions retain every write', async () => {
  const { storage, database, api: first } = fixture();
  const second = createWebLedgerApi(storage, database);
  await first.createWorkspace(setup);
  await assert.rejects(second.createWorkspace(setup), /LUNA_ERROR:already-configured/);
  await Promise.all(Array.from({ length: 40 }, (_, index) =>
    (index % 2 === 0 ? first : second).createTransaction(draft),
  ));
  await second.updateSettings({ locale: 'zh-CN' });
  await first.setMonthlyBudget('2026-09', '60000');
  const snapshot = await second.getSnapshot('2026-09');
  assert.equal(snapshot.transactions.length, 40);
  assert.equal(new Set(snapshot.transactions.map((item) => item.id)).size, 40);
  assert.equal(snapshot.summary?.totalExpenseMinor, '49360');
  assert.equal(snapshot.summary?.budgetMinor, '60000');
  assert.equal((await first.getSettings()).locale, 'zh-CN');
});

test('revision checks happen inside the transaction and reject stale edit or delete', async () => {
  const { storage, database, api: first } = fixture();
  const second = createWebLedgerApi(storage, database);
  await first.createWorkspace(setup);
  const transaction = await first.createTransaction(draft);
  const results = await Promise.allSettled([
    first.updateTransaction(transaction.id, { ...draft, notes: 'First' }, 1),
    second.updateTransaction(transaction.id, { ...draft, notes: 'Second' }, 1),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected?.status === 'rejected');
  assert.ok(rejected.reason instanceof DomainError);
  assert.equal(rejected.reason.code, 'stale-revision');
  await assert.rejects(second.deleteTransaction(transaction.id, 1), (error: unknown) =>
    error instanceof DomainError && error.code === 'stale-revision',
  );
  assert.equal((await first.getSnapshot('2026-09')).transactions[0]?.revision, 2);
  await second.deleteTransaction(transaction.id, 2);
  assert.equal((await first.getSnapshot('2026-09')).summary?.totalExpenseMinor, '0');
});

test('returned workspace, nested transactions, settings, and snapshots do not alias persisted state', async () => {
  const { api } = fixture();
  const workspace = await api.createWorkspace(setup);
  workspace.name = 'Changed outside API';
  const transaction = await api.createTransaction(draft);
  transaction.notes = 'Changed outside API';
  const split = transaction.splits[0];
  assert.ok(split);
  split.category = 'Changed outside API';
  const snapshot = await api.getSnapshot('2026-09');
  assert.ok(snapshot.workspace);
  snapshot.workspace.currency = 'EUR';
  const record = snapshot.transactions[0];
  assert.ok(record);
  record.amountMinor = '-999999';
  const settings = await api.updateSettings({ locale: 'zh-CN' });
  settings.lastSync.code = 'synced';
  await api.setMonthlyBudget('2026-09', '80000');
  const restored = await api.getSnapshot('2026-09');
  assert.equal(restored.workspace?.name, 'Household');
  assert.equal(restored.workspace?.currency, 'CNY');
  assert.equal(restored.transactions[0]?.notes, 'Lunch');
  assert.equal(restored.transactions[0]?.splits[0]?.category, 'Food');
  assert.equal(restored.transactions[0]?.amountMinor, '-1234');
  assert.notEqual((await api.getSettings()).lastSync.code, 'synced');
  const revised = await api.updateTransaction(transaction.id, { ...draft, notes: 'Revised' }, 1);
  revised.notes = 'Changed outside API';
  const deleted = await api.deleteTransaction(transaction.id, 2);
  deleted.deletedAt = null;
  assert.equal((await api.getSnapshot('2026-09')).transactions[0]?.notes, 'Revised');
  assert.ok((await api.getSnapshot('2026-09')).transactions[0]?.deletedAt);
});

test('v1 migration seeds graph history and tombstones, retaining original bytes until a successful v2 mutation', async (t) => {
  const { api, storage, database } = fixture();
  const original = createTransaction('legacy-record', draft, 2, '2026-09-05T01:00:00.000Z');
  const deleted = tombstoneTransaction(original, '2026-09-05T02:00:00.000Z');
  const legacy = JSON.stringify({
    schemaVersion: 1,
    settings: createDefaultSettings('legacy-device', 'en-US'),
    workspace: { id: 'legacy-workspace', name: 'Old ledger', currency: 'CNY', precision: 2, createdAt: '2026-09-01T00:00:00.000Z' },
    transactions: [deleted], budgets: { '2026-08': '10000', '2026-09': '20000' },
  });
  storage.setItem(WEB_LEGACY_STORAGE_KEY, legacy);
  const migrated = await api.getLedgerDocument();
  assert.ok(migrated);
  assert.deepEqual(migrated.revisions.map((revision) => revision.id), [
    'seed:budget:2026-08', 'seed:budget:2026-09', 'seed:transaction:legacy-record',
  ]);
  assert.equal((await api.getSnapshot('2026-09')).summary?.totalExpenseMinor, '0');
  assert.equal((await api.getSnapshot('2026-09')).transactions[0]?.deletedAt, deleted.deletedAt);
  assert.equal(await rawState(database), legacy);
  const put = t.mock.method(IDBObjectStore.prototype, 'put', () => { throw new DOMException('Quota', 'QuotaExceededError'); });
  await assert.rejects(api.setMonthlyBudget('2026-09', '30000'), /web-storage-write-failed/);
  assert.equal(await rawState(database), legacy);
  put.mock.restore();
  await api.setMonthlyBudget('2026-09', '30000');
  const saved = await rawState(database);
  assert.ok(saved?.startsWith('{"schemaVersion":2,"settings":'));
  assert.equal(storage.getItem(WEB_LEGACY_STORAGE_KEY), legacy);
  const reopened = createWebLedgerApi(storage, database);
  assert.equal((await reopened.getSnapshot('2026-09')).summary?.budgetMinor, '30000');
  assert.equal((await reopened.getLedgerDocument())?.revisions.length, 4);
  assert.equal((await reopened.getSnapshot('2026-09')).transactions[0]?.deletedAt, deleted.deletedAt);
});

test('a remote graph restores into an empty client without replacing its local settings', async () => {
  const first = fixture();
  await first.api.createWorkspace(setup);
  await first.api.createTransaction(draft);
  const graph = await first.api.getLedgerDocument();
  assert.ok(graph);
  const second = fixture();
  assert.equal(await second.api.getLedgerDocument(), null);
  assert.deepEqual(await second.api.getLedgerConflicts(), []);
  await second.api.updateSettings({ locale: 'zh-CN' });
  assert.deepEqual(await second.api.mergeLedgerDocument(graph), graph);
  assert.equal((await second.api.getSettings()).locale, 'zh-CN');
  assert.equal((await second.api.getSnapshot('2026-09')).transactions.length, 1);
  const before = await rawState(second.database);
  await second.api.mergeLedgerDocument(graph);
  assert.equal(await rawState(second.database), before);
  graph.workspace.name = 'External mutation';
  assert.equal((await second.api.getSnapshot('2026-09')).workspace?.name, 'Household');
});

async function divergentClients() {
  const first = fixture();
  const second = fixture();
  await first.api.createWorkspace(setup);
  const record = await first.api.createTransaction(draft);
  const base = await first.api.getLedgerDocument();
  assert.ok(base);
  await second.api.mergeLedgerDocument(base);
  await first.api.updateTransaction(record.id, { ...draft, notes: 'Offline edit' }, 1);
  await second.api.deleteTransaction(record.id, 1);
  const remote = await second.api.getLedgerDocument();
  assert.ok(remote);
  return { first, second, record, base, remote };
}

test('divergent offline edit and deletion merge into an explicit conflict with no financial projection', async () => {
  const { first, second, record, remote } = await divergentClients();
  const merged = await first.api.mergeLedgerDocument(remote);
  assert.equal((await first.api.getSnapshot('2026-09')).transactions.length, 0);
  assert.equal((await first.api.getSnapshot('2026-09')).summary?.totalExpenseMinor, '0');
  const conflicts = await first.api.getLedgerConflicts();
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.heads.length, 2);
  await assert.rejects(first.api.updateTransaction(record.id, draft, 2), /ledger-conflict/);
  await assert.rejects(first.api.deleteTransaction(record.id, 2), /ledger-conflict/);
  await second.api.mergeLedgerDocument(merged);
  assert.deepEqual(await second.api.getLedgerConflicts(), conflicts);
  assert.deepEqual(await first.api.getLedgerDocument(), await second.api.getLedgerDocument());
  const reopened = createWebLedgerApi(first.storage, first.database);
  assert.deepEqual(await reopened.getLedgerConflicts(), conflicts);
  assert.equal((await reopened.getSnapshot('2026-09')).transactions.length, 0);
});

test('workspace mismatch rejects graph adoption without altering committed local state', async () => {
  const { api, database } = fixture();
  await api.createWorkspace(setup);
  await api.createTransaction(draft);
  const graph = await api.getLedgerDocument();
  assert.ok(graph);
  const before = await rawState(database);
  await assert.rejects(api.mergeLedgerDocument({ ...graph, workspace: { ...graph.workspace, id: 'other-workspace' } }), /ledger-workspace-mismatch/);
  assert.equal(await rawState(database), before);
});

test('failed graph merge and failed resolution never partially commit projection or history', async (t) => {
  const { first, remote } = await divergentClients();
  const before = await rawState(first.database);
  const originalSnapshot = await first.api.getSnapshot('2026-09');
  let put = t.mock.method(IDBObjectStore.prototype, 'put', () => { throw new DOMException('Quota', 'QuotaExceededError'); });
  await assert.rejects(first.api.mergeLedgerDocument(remote), /web-storage-write-failed/);
  assert.equal(await rawState(first.database), before);
  assert.deepEqual(await first.api.getSnapshot('2026-09'), originalSnapshot);
  put.mock.restore();
  await first.api.mergeLedgerDocument(remote);
  const conflict = (await first.api.getLedgerConflicts())[0];
  assert.ok(conflict?.kind === 'transaction');
  const selected = conflict.heads.find((head) => head.value.deletedAt !== null);
  assert.ok(selected);
  const choice = { kind: conflict.kind, entityId: conflict.entityId, selectedHeadId: selected.id, expectedHeadIds: conflict.heads.map((head) => head.id) };
  const conflictedBytes = await rawState(first.database);
  put = t.mock.method(IDBObjectStore.prototype, 'put', () => { throw new DOMException('Quota', 'QuotaExceededError'); });
  await assert.rejects(first.api.resolveLedgerConflict(choice), /web-storage-write-failed/);
  assert.equal(await rawState(first.database), conflictedBytes);
  assert.deepEqual(await first.api.getLedgerConflicts(), [conflict]);
  put.mock.restore();
  await first.api.resolveLedgerConflict(choice);
  assert.deepEqual(await first.api.getLedgerConflicts(), []);
  const snapshot = await first.api.getSnapshot('2026-09');
  assert.equal(snapshot.transactions[0]?.revision, 3);
  assert.ok(snapshot.transactions[0]?.deletedAt);
  assert.equal(snapshot.summary?.totalExpenseMinor, '0');
});

test('resolution checks the current graph inside its transaction and refuses stale choices', async () => {
  const { first, base, record, remote } = await divergentClients();
  await first.api.mergeLedgerDocument(remote);
  const conflict = (await first.api.getLedgerConflicts())[0];
  assert.ok(conflict?.kind === 'transaction');
  const selected = conflict.heads.find((head) => head.value.deletedAt === null);
  assert.ok(selected);
  const choice = { kind: conflict.kind, entityId: conflict.entityId, selectedHeadId: selected.id, expectedHeadIds: conflict.heads.map((head) => head.id) };
  const third = fixture();
  await third.api.mergeLedgerDocument(base);
  await third.api.updateTransaction(record.id, { ...draft, notes: 'Another offline edit' }, 1);
  const thirdGraph = await third.api.getLedgerDocument();
  assert.ok(thirdGraph);
  await first.api.mergeLedgerDocument(thirdGraph);
  const before = await rawState(first.database);
  await assert.rejects(first.api.resolveLedgerConflict(choice), (error: unknown) => error instanceof LedgerSyncError && error.code === 'ledger-stale-heads');
  assert.equal(await rawState(first.database), before);
  const current = (await first.api.getLedgerConflicts())[0];
  assert.ok(current);
  await first.api.resolveLedgerConflict({ ...choice, expectedHeadIds: current.heads.map((head) => head.id) });
  assert.equal((await first.api.getSnapshot('2026-09')).transactions[0]?.notes, 'Offline edit');
  assert.equal((await first.api.getSnapshot('2026-09')).transactions[0]?.revision, 3);
  await assert.rejects(first.api.resolveLedgerConflict(choice), /ledger-stale-heads/);
});

test('budget conflicts disable the limit and reject ordinary edits until a candidate is chosen', async () => {
  const first = fixture();
  const second = fixture();
  await first.api.createWorkspace(setup);
  await first.api.setMonthlyBudget('2026-09', '10000');
  const base = await first.api.getLedgerDocument();
  assert.ok(base);
  await second.api.mergeLedgerDocument(base);
  await first.api.setMonthlyBudget('2026-09', '20000');
  await second.api.setMonthlyBudget('2026-09', null);
  const remote = await second.api.getLedgerDocument();
  assert.ok(remote);
  await first.api.mergeLedgerDocument(remote);
  assert.equal((await first.api.getSnapshot('2026-09')).summary?.budgetMinor, null);
  assert.equal((await first.api.getSnapshot('2026-10')).summary?.budgetMinor, null);
  await assert.rejects(first.api.setMonthlyBudget('2026-09', '30000'), /ledger-conflict/);
  const committed = await first.api.getLedgerDocument();
  await assert.rejects(first.api.setMonthlyBudget('2026-09', '30000', (await first.api.getSnapshot('2026-09')).budgetHeadIds), /ledger-conflict/);
  assert.deepEqual(await first.api.getLedgerDocument(), committed);
  const conflict = (await first.api.getLedgerConflicts())[0];
  assert.ok(conflict?.kind === 'budget');
  const selected = conflict.heads.find((head) => head.value === '20000');
  assert.ok(selected);
  await first.api.resolveLedgerConflict({ kind: 'budget', entityId: conflict.entityId, selectedHeadId: selected.id, expectedHeadIds: conflict.heads.map((head) => head.id) });
  assert.equal((await first.api.getSnapshot('2026-09')).summary?.budgetMinor, '20000');
  assert.deepEqual(await first.api.getLedgerConflicts(), []);
});

test('a cancelled merge rejects before opening IndexedDB or modifying local bytes', async (t) => {
  const { first, remote } = await divergentClients();
  const before = await rawState(first.database);
  const open = t.mock.method(first.database, 'open');
  const controller = new AbortController();
  controller.abort();
  const port: LedgerDataPort = first.api;
  await assert.rejects(Promise.resolve(port.mergeLedgerDocument(remote, controller.signal)),
    (error: unknown) => error instanceof LedgerSessionError && error.code === 'ledger-sync-cancelled');
  assert.equal(open.mock.callCount(), 0);
  open.mock.restore();
  assert.equal(await rawState(first.database), before);
});

test('cancellation during a delayed real IndexedDB open closes its late handle without merging', async (t) => {
  const { first, remote } = await divergentClients();
  const before = await rawState(first.database);
  let releaseOpen: (() => void) | undefined;
  let opened: (() => void) | undefined;
  const reachedOpen = new Promise<void>((resolve) => { opened = resolve; });
  const original = first.database.open;
  const open = t.mock.method(first.database, 'open', function (this: IDBFactory, ...args: Parameters<typeof original>) {
    const request = original.apply(this, args);
    request.addEventListener('success', (event) => {
      event.stopImmediatePropagation();
      releaseOpen = () => request.onsuccess?.call(request, event);
      opened?.();
    }, { once: true });
    return request;
  });
  const controller = new AbortController();
  const port: LedgerDataPort = first.api;
  const rejected = assert.rejects(Promise.resolve(port.mergeLedgerDocument(remote, controller.signal)), /ledger-sync-cancelled/);
  await reachedOpen;
  controller.abort();
  await rejected;
  assert.ok(releaseOpen);
  releaseOpen();
  open.mock.restore();
  assert.equal(await rawState(first.database), before);
  // A late open handle must not remain alive and block future version changes.
  const upgraded = await openDatabase(first.database, 2);
  upgraded.close();
});

test('cancellation aborts an IndexedDB merge queued behind another transaction', async (t) => {
  const { first, remote } = await divergentClients();
  const before = await rawState(first.database);
  const connection = await openDatabase(first.database);
  const blocker = connection.transaction(WEB_DATABASE_STORE, 'readwrite');
  let keepBlocking = true;
  const keepAlive = () => {
    if (keepBlocking) blocker.objectStore(WEB_DATABASE_STORE).get(WEB_DATABASE_RECORD).onsuccess = keepAlive;
  };
  keepAlive();
  const blockerDone = new Promise<void>((resolve, reject) => {
    blocker.oncomplete = () => { connection.close(); resolve(); };
    blocker.onabort = () => { connection.close(); reject(new Error('Test blocker aborted')); };
  });
  let queued: (() => void) | undefined;
  const reachedQueue = new Promise<void>((resolve) => { queued = resolve; });
  const original = FakeIDBDatabase.prototype.transaction;
  const transaction = t.mock.method(FakeIDBDatabase.prototype, 'transaction', function (
    this: IDBDatabase, ...args: Parameters<typeof original>
  ) {
    const result = original.apply(this, args);
    queued?.();
    return result;
  });
  const controller = new AbortController();
  const port: LedgerDataPort = first.api;
  const rejected = assert.rejects(Promise.resolve(port.mergeLedgerDocument(remote, controller.signal)), /ledger-sync-cancelled/);
  await reachedQueue;
  controller.abort();
  keepBlocking = false;
  await blockerDone;
  await rejected;
  transaction.mock.restore();
  assert.equal(await rawState(first.database), before);
  await first.api.mergeLedgerDocument(remote);
  assert.notEqual(await rawState(first.database), before);
});

test('sync cancellation after a successful IndexedDB put rolls back before transaction completion', async (t) => {
  const { first, remote } = await divergentClients();
  const before = await rawState(first.database);
  const controller = new AbortController();
  const add = t.mock.method(controller.signal, 'addEventListener');
  const remove = t.mock.method(controller.signal, 'removeEventListener');
  const original = IDBObjectStore.prototype.put;
  const put = t.mock.method(IDBObjectStore.prototype, 'put', function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
    const request = original.apply(this, args);
    request.addEventListener('success', () => controller.abort());
    return request;
  });
  const port: LedgerDataPort = first.api;
  await assert.rejects(Promise.resolve(port.mergeLedgerDocument(remote, controller.signal)),
    (error: unknown) => error instanceof LedgerSessionError && error.code === 'ledger-sync-cancelled');
  assert.equal(add.mock.callCount(), remove.mock.callCount());
  put.mock.restore();
  assert.equal(await rawState(first.database), before);
  await first.api.mergeLedgerDocument(remote);
  assert.notEqual(await rawState(first.database), before);
});
