import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DomainError } from '../shared/domain';
import { SQLiteLocalStore } from './store';

function withStore(callback: (filePath: string) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), 'luna-store-'));
  const filePath = path.join(directory, 'ledger.sqlite');
  try {
    callback(filePath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('stale edits and deletes reject without changing committed rows or pending operations', () => {
  withStore((filePath) => {
    const first = new SQLiteLocalStore(filePath);
    const second = new SQLiteLocalStore(filePath);
    const now = '2026-09-05T10:00:00.000Z';
    first.createWorkspace({ name: 'Household', currency: 'CNY', precision: 2, monthlyBudgetMinor: null }, 'workspace', now);
    const draft = { type: 'expense' as const, amountMinor: '1234', date: '2026-09-05', splits: [{ category: 'Food', amountMinor: '1234' }] };
    const original = first.createTransaction(draft, 'transaction', now);
    second.updateTransaction(original.id, { ...draft, notes: 'Another window' }, now, original.revision);
    const committed = first.getSnapshot('2026-09');
    const stale = (error: unknown): boolean => error instanceof DomainError && error.code === 'stale-revision';
    assert.throws(() => first.updateTransaction(original.id, { ...draft, notes: 'Stale' }, now, original.revision), stale);
    assert.throws(() => first.deleteTransaction(original.id, now, original.revision), stale);
    assert.deepEqual(second.getSnapshot('2026-09'), committed);
    second.deleteTransaction(original.id, now, 2);
    assert.equal(first.getSnapshot('2026-09').transactions.length, 0);
    first.close();
    second.close();
  });
});

test('SQLite migration is repeatable and local data survives reopen', () => {
  withStore((filePath) => {
    const first = new SQLiteLocalStore(filePath);
    assert.equal(first.getSnapshot('2026-08').workspace, null);
    first.createWorkspace(
      {
        name: 'Household',
        currency: 'USD',
        precision: 2,
        monthlyBudgetMinor: '300000',
      },
      'workspace-1',
      '2026-08-30T10:00:00.000Z',
    );
    first.createTransaction(
      {
        type: 'expense',
        amountMinor: '12345',
        date: '2026-08-30',
        splits: [{ category: 'Groceries', amountMinor: '12345' }],
        merchant: 'Market',
        paymentMethod: 'Card',
        notes: 'Weekly shop',
      },
      'transaction-1',
      '2026-08-30T10:01:00.000Z',
    );
    const beforeClose = first.getSnapshot('2026-08');
    assert.equal(beforeClose.transactions.length, 1);
    assert.equal(beforeClose.summary?.totalExpenseMinor, '12345');
    assert.equal(beforeClose.summary?.budgetRemainingMinor, '287655');
    assert.equal(beforeClose.sync.pendingChanges, 1);
    first.close();

    const reopened = new SQLiteLocalStore(filePath);
    const afterReopen = reopened.getSnapshot('2026-08');
    assert.equal(afterReopen.workspace?.name, 'Household');
    assert.equal(afterReopen.transactions[0]?.merchant, 'Market');
    assert.equal(afterReopen.transactions[0]?.amountMinor, '-12345');
    assert.equal(afterReopen.transactions[0]?.splits[0]?.amountMinor, '-12345');
    reopened.close();
  });
});

test('SQLite preserves integer strings beyond JavaScript safe integers', () => {
  withStore((filePath) => {
    const store = new SQLiteLocalStore(filePath);
    store.createWorkspace(
      {
        name: 'Large values',
        currency: 'JPY',
        precision: 0,
        monthlyBudgetMinor: null,
      },
      'workspace-large',
      '2026-08-30T10:00:00.000Z',
    );
    store.createTransaction(
      {
        type: 'income',
        amountMinor: '9007199254740993',
        date: '2026-08-30',
        splits: [{ category: 'Sale', amountMinor: '9007199254740993' }],
      },
      'transaction-large',
      '2026-08-30T10:01:00.000Z',
    );
    const snapshot = store.getSnapshot('2026-08');
    assert.equal(snapshot.transactions[0]?.amountMinor, '9007199254740993');
    assert.equal(snapshot.summary?.totalIncomeMinor, '9007199254740993');
    store.close();
  });
});

test('delete writes a tombstone, removes the record from totals, and remains local', () => {
  withStore((filePath) => {
    const store = new SQLiteLocalStore(filePath);
    store.createWorkspace(
      {
        name: 'Deletion test',
        currency: 'EUR',
        precision: 2,
        monthlyBudgetMinor: '10000',
      },
      'workspace-delete',
      '2026-08-30T10:00:00.000Z',
    );
    store.createTransaction(
      {
        type: 'expense',
        amountMinor: '2500',
        date: '2026-08-30',
        splits: [{ category: 'Travel', amountMinor: '2500' }],
      },
      'transaction-delete',
      '2026-08-30T10:01:00.000Z',
    );
    const deleted = store.deleteTransaction('transaction-delete', '2026-08-30T10:02:00.000Z');
    assert.equal(deleted.deletedAt, '2026-08-30T10:02:00.000Z');
    const snapshot = store.getSnapshot('2026-08');
    assert.equal(snapshot.transactions.length, 0);
    assert.equal(snapshot.summary?.totalExpenseMinor, '0');
    assert.equal(snapshot.sync.pendingChanges, 2);
    assert.throws(() => store.updateTransaction('transaction-delete', {
      type: 'expense',
      amountMinor: '1',
      date: '2026-08-30',
      splits: [{ category: 'Travel', amountMinor: '1' }],
    }, '2026-08-30T10:03:00.000Z'), DomainError);
    store.close();
  });
});

test('invalid transaction input is rejected before SQLite writes', () => {
  withStore((filePath) => {
    const store = new SQLiteLocalStore(filePath);
    store.createWorkspace(
      {
        name: 'Atomicity test',
        currency: 'GBP',
        precision: 2,
        monthlyBudgetMinor: null,
      },
      'workspace-atomic',
      '2026-08-30T10:00:00.000Z',
    );
    assert.throws(
      () =>
        store.createTransaction(
          {
            type: 'income',
            amountMinor: '100',
            date: '2026-08-30',
            splits: [{ category: 'Work', amountMinor: '99' }],
          },
          'invalid-transaction',
          '2026-08-30T10:01:00.000Z',
        ),
      /add up exactly/,
    );
    const snapshot = store.getSnapshot('2026-08');
    assert.equal(snapshot.transactions.length, 0);
    assert.equal(snapshot.sync.pendingChanges, 0);
    store.close();
  });
});

test('monthly budgets can be overridden for one month and inherited later', () => {
  withStore((filePath) => {
    const store = new SQLiteLocalStore(filePath);
    store.createWorkspace(
      {
        name: 'Budget test',
        currency: 'SGD',
        precision: 2,
        monthlyBudgetMinor: '50000',
      },
      'workspace-budget',
      '2026-08-30T10:00:00.000Z',
    );
    assert.equal(store.getSnapshot('2026-09').summary?.budgetMinor, '50000');
    store.setMonthlyBudget('2026-09', '65000');
    assert.equal(store.getSnapshot('2026-09').summary?.budgetMinor, '65000');
    assert.equal(store.getSnapshot('2026-10').summary?.budgetMinor, '65000');
    store.setMonthlyBudget('2026-09', null);
    assert.equal(store.getSnapshot('2026-09').summary?.budgetMinor, null);
    assert.equal(store.getSnapshot('2026-10').summary?.budgetMinor, null);
    store.close();
  });
});
