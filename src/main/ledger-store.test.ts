import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { SQLiteLocalStore } from './store';
import { LedgerSyncError, projectLedgerDocument } from '../shared/ledger-sync';

const now = '2026-09-05T12:00:00.000Z';
const draft = { type: 'expense' as const, amountMinor: '100', date: '2026-09-05',
  splits: [{ category: 'expense:0', amountMinor: '100' }] };

function createStore(): SQLiteLocalStore {
  const store = new SQLiteLocalStore(':memory:');
  store.createWorkspace({ name: 'Family', currency: 'CNY', precision: 2, monthlyBudgetMinor: '1000' }, 'workspace', now);
  store.createTransaction(draft, 'transaction', now);
  return store;
}

test('SQLite merges offline branches, excludes conflicts, and guards resolution against stale choices', () => {
  const first = createStore();
  const second = new SQLiteLocalStore(':memory:');
  try {
    const baseline = first.getLedgerDocument();
    assert.ok(baseline);
    second.mergeLedgerDocument(baseline);
    first.updateTransaction('transaction', { ...draft, notes: 'First' }, now, 1);
    second.deleteTransaction('transaction', now, 1);
    const secondDocument = second.getLedgerDocument();
    assert.ok(secondDocument);
    first.mergeLedgerDocument(secondDocument);
    assert.equal(first.getSnapshot('2026-09').summary?.totalExpenseMinor, '0');
    const conflict = first.getLedgerConflicts()[0];
    assert.ok(conflict);
    const selected = conflict.heads.find((head) => head.kind === 'transaction' && head.value.deletedAt === null);
    assert.ok(selected);
    assert.throws(() => first.updateTransaction('transaction', draft, now), /ledger-conflict/);
    const choice = { kind: conflict.kind, entityId: conflict.entityId, selectedHeadId: selected.id,
      expectedHeadIds: conflict.heads.map((head) => head.id) };
    const resolved = first.resolveLedgerConflict(choice);
    assert.equal(first.getLedgerConflicts().length, 0);
    assert.equal(first.getSnapshot('2026-09').transactions[0]?.revision, 3);
    assert.equal(first.getSnapshot('2026-09').summary?.totalExpenseMinor, '100');
    assert.throws(() => first.resolveLedgerConflict(choice), /ledger-stale-heads/);
    assert.deepEqual(first.getLedgerDocument(), resolved);
    second.mergeLedgerDocument(resolved);
    assert.deepEqual(second.getLedgerDocument(), resolved);
    first.mergeLedgerDocument(baseline);
    assert.deepEqual(first.getLedgerDocument(), resolved);
  } finally { first.close(); second.close(); }
});

test('SQLite rejects workspace mismatch and revision collisions without modifying the ledger', () => {
  const store = createStore();
  try {
    const original = store.getLedgerDocument();
    assert.ok(original);
    const foreign = structuredClone(original);
    foreign.workspace.id = 'foreign';
    assert.throws(() => store.mergeLedgerDocument(foreign), /ledger-workspace-mismatch/);
    const collision = structuredClone(original);
    const transaction = collision.revisions.find((item) => item.kind === 'transaction');
    assert.ok(transaction?.kind === 'transaction');
    transaction.value.notes = 'Changed same revision';
    assert.throws(() => store.mergeLedgerDocument(collision), /ledger-revision-collision/);
    assert.deepEqual(store.getLedgerDocument(), original);
  } finally { store.close(); }
});

test('SQLite legacy graph starts fresh with categories and seeds exactly once across reopen', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'luna-graph-migrate-'));
  const file = path.join(directory, 'ledger.sqlite');
  try {
    const current = new SQLiteLocalStore(file);
    current.createWorkspace({ name: 'Legacy', currency: 'CNY', precision: 2, monthlyBudgetMinor: '2000' }, 'workspace', now);
    current.createTransaction(draft, 'deleted', now);
    current.deleteTransaction('deleted', now);
    current.close();
    // Convert this test-only fixture to the exact legacy schema boundary.
    const legacy = new Database(file);
    legacy.exec('DROP TABLE ledger_graph');
    legacy.pragma('user_version = 1');
    legacy.close();
    const migrated = new SQLiteLocalStore(file);
    const document = migrated.getLedgerDocument();
    assert.ok(document);
    const projection = projectLedgerDocument(document);
    assert.equal(document.schemaVersion, 3);
    assert.equal(projection.categories.length > 0, true);
    assert.equal(migrated.getSnapshot('2026-09').transactions.length, 0);
    assert.equal(document.revisions.filter((item) => item.kind === 'transaction').length, 0);
    migrated.close();
    const reopened = new SQLiteLocalStore(file);
    assert.deepEqual(reopened.getLedgerDocument(), document);
    reopened.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('SQLite rolls back graph, projection, revisions, and pending writes together on disk failure', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'luna-graph-rollback-'));
  const file = path.join(directory, 'ledger.sqlite');
  try {
    const store = new SQLiteLocalStore(file);
    store.createWorkspace({ name: 'Atomic', currency: 'CNY', precision: 2, monthlyBudgetMinor: null }, 'workspace', now);
    store.createTransaction(draft, 'transaction', now);
    const before = store.getLedgerDocument();
    const beforeSnapshot = store.getSnapshot('2026-09');
    const injector = new Database(file);
    injector.exec(`CREATE TRIGGER fail_graph BEFORE UPDATE ON ledger_graph
      BEGIN SELECT RAISE(ABORT, 'test write failure'); END`);
    assert.throws(() => store.updateTransaction('transaction', { ...draft, notes: 'Lost' }, now, 1), /test write failure/);
    assert.deepEqual(store.getLedgerDocument(), before);
    assert.deepEqual(store.getSnapshot('2026-09'), beforeSnapshot);
    assert.equal((injector.prepare('SELECT COUNT(*) AS n FROM revisions').get() as {n:number}).n, 1);
    injector.close();
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('SQLite concurrent budget changes require resolution and prevent inherited budget fallback', () => {
  const first = createStore();
  const second = new SQLiteLocalStore(':memory:');
  try {
    const baseline = first.getLedgerDocument();
    assert.ok(baseline);
    second.mergeLedgerDocument(baseline);
    first.setMonthlyBudget('2026-10', '500');
    second.setMonthlyBudget('2026-10', '600');
    const remote = second.getLedgerDocument();
    assert.ok(remote);
    first.mergeLedgerDocument(remote);
    assert.equal(first.getSnapshot('2026-11').summary?.budgetMinor, null);
    assert.throws(() => first.setMonthlyBudget('2026-10', '700'), LedgerSyncError);
    const committed = first.getLedgerDocument();
    assert.throws(() => first.setMonthlyBudget('2026-10', '700', first.getSnapshot('2026-10').budgetHeadIds), /ledger-conflict/);
    assert.deepEqual(first.getLedgerDocument(), committed);
    const conflict = first.getLedgerConflicts()[0];
    assert.ok(conflict?.heads[0]);
    first.resolveLedgerConflict({ kind: conflict.kind, entityId: conflict.entityId,
      selectedHeadId: conflict.heads[0].id, expectedHeadIds: conflict.heads.map((head) => head.id) });
    assert.notEqual(first.getSnapshot('2026-11').summary?.budgetMinor, null);
  } finally { first.close(); second.close(); }
});

test('SQLite rejects stale budget edits and inherited limits without changing any committed state', () => {
  const store = createStore();
  try {
    const observed = store.getSnapshot('2026-10').budgetHeadIds;
    assert.ok(observed);
    store.setMonthlyBudget('2026-09', '2000');
    const committed = store.getLedgerDocument();
    const snapshot = store.getSnapshot('2026-10');
    assert.throws(() => store.setMonthlyBudget('2026-10', '1500', observed), /ledger-stale-budget/);
    assert.deepEqual(store.getLedgerDocument(), committed);
    assert.deepEqual(store.getSnapshot('2026-10'), snapshot);
    store.setMonthlyBudget('2026-10', '1500', snapshot.budgetHeadIds);
    assert.equal(store.getSnapshot('2026-10').summary?.budgetMinor, '1500');
    assert.throws(() => store.setMonthlyBudget('2026-10', null, snapshot.budgetHeadIds), /ledger-stale-budget/);
    const empty = store.getSnapshot('2026-01').budgetHeadIds;
    assert.deepEqual(empty, []);
    store.setMonthlyBudget('2026-01', '100', empty);
    assert.throws(() => store.setMonthlyBudget('2026-01', '200', empty), /ledger-stale-budget/);
  } finally { store.close(); }
});
