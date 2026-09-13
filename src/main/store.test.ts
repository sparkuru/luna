import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DomainError } from '../shared/domain';
import { FullBackupSessionManager } from '../shared/full-backup-session';
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

test('SQLite remote payload checkpoints persist per target and never downgrade', () => {
  withStore((filePath) => {
    const first = new SQLiteLocalStore(filePath);
    assert.equal(first.getRemotePayloadVersion('s3:first'), null);
    first.setRemotePayloadVersion('s3:first', 1);
    first.setRemotePayloadVersion('s3:first', 2);
    first.setRemotePayloadVersion('s3:first', 1);
    first.setRemotePayloadVersion('s3:second', 1);
    assert.equal(first.getRemotePayloadVersion('s3:first'), 2);
    assert.equal(first.getRemotePayloadVersion('s3:second'), 1);
    assert.throws(
      () => first.getRemotePayloadVersion(''),
      /LUNA_ERROR:invalid-input/,
    );
    first.close();

    const reopened = new SQLiteLocalStore(filePath);
    assert.equal(reopened.getRemotePayloadVersion('s3:first'), 2);
    assert.equal(reopened.getRemotePayloadVersion('s3:second'), 1);
    reopened.close();
  });
});

test('SQLite migration leases are durable, block writes across connections, and expire safely', () => {
  withStore((filePath) => {
    const first = new SQLiteLocalStore(filePath);
    const second = new SQLiteLocalStore(filePath);
    const lease = {
      id: 'migration-first',
      snapshotVersion: '2:workspace:1:head',
      acquiredAt: '2026-09-12T00:00:00.000Z',
      expiresAt: '2099-09-12T00:00:00.000Z',
    };
    first.acquireMigrationLease(lease);
    assert.deepEqual(second.getMigrationLease(), lease);
    assert.throws(
      () => second.createWorkspace(
        {
          name: 'Blocked',
          currency: 'CNY',
          precision: 2,
          monthlyBudgetMinor: null,
        },
        'blocked-workspace',
        '2026-09-12T00:01:00.000Z',
      ),
      /LUNA_ERROR:migration-locked/,
    );
    assert.equal(second.getSnapshot('2026-09').workspace, null);
    assert.throws(
      () => second.acquireMigrationLease({ ...lease, id: 'migration-second' }),
      /LUNA_ERROR:migration-busy/,
    );
    first.releaseMigrationLease(lease.id);
    second.createWorkspace(
      {
        name: 'Unblocked',
        currency: 'CNY',
        precision: 2,
        monthlyBudgetMinor: null,
      },
      'unblocked-workspace',
      '2026-09-12T00:02:00.000Z',
    );
    const expired = {
      ...lease,
      id: 'migration-expired',
      acquiredAt: '2020-09-12T00:00:00.000Z',
      expiresAt: '2021-09-12T00:00:00.000Z',
    };
    second.acquireMigrationLease(expired);
    second.setRemotePayloadVersion('s3:after-expiry', 1);
    assert.equal(second.getMigrationLease(), null);
    first.close();
    second.close();
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

test('SQLite complete backup restores ciphertext through bounded staging', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'luna-backup-store-'));
  const sourcePath = path.join(directory, 'source.sqlite');
  const targetPath = path.join(directory, 'target.sqlite');
  const source = new SQLiteLocalStore(sourcePath);
  const target = new SQLiteLocalStore(targetPath);
  const image = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const password = 'sqlite complete backup passphrase';
  const managerFor = (store: SQLiteLocalStore) =>
    new FullBackupSessionManager({
      getLedgerDocument: () => store.getLedgerDocument(),
      readAttachmentCiphertext: (id) => store.readAttachmentCiphertext(id),
      beginFullBackupRestore: (graph) => store.beginFullBackupRestore(graph),
      restoreFullBackup: (archive) => store.restoreFullBackup(archive),
    });
  try {
    source.createWorkspace(
      { name: 'Source', currency: 'CNY', precision: 2, monthlyBudgetMinor: null },
      'workspace-backup-source',
      '2026-09-12T00:00:00.000Z',
    );
    const staged = await source.stageTransactionImage(
      'draft-backup',
      image,
      'image/png',
      1,
      1,
    );
    source.createTransaction(
      {
        type: 'expense',
        amountMinor: '123',
        date: '2026-09-12',
        splits: [{ category: 'Food', amountMinor: '123' }],
        attachments: [{ draftToken: staged.draftToken }],
      },
      'transaction-backup-image',
      '2026-09-12T00:01:00.000Z',
    );

    const exporter = managerFor(source);
    const exportStart = await exporter.beginBackupExport(password);
    const chunks: Uint8Array[] = [];
    for (let sequence = 0; ; sequence += 1) {
      const chunk = await exporter.readBackupChunk(exportStart.jobId, sequence);
      chunks.push(chunk.bytes);
      if (chunk.eof) break;
    }
    exporter.finishBackupExport(exportStart.jobId);

    const importer = managerFor(target);
    const importStart = await importer.beginBackupImport(null, password);
    for (let sequence = 0; sequence < chunks.length; sequence += 1) {
      await importer.appendBackupChunk(importStart.jobId, sequence, chunks[sequence]!);
    }
    await importer.finishBackupImport(importStart.jobId);
    assert.equal(target.getSnapshot('2026-09').transactions.length, 1);
    const restored = await target.readTransactionImage(
      'transaction-backup-image',
      staged.metadata.id,
    );
    assert.deepEqual(restored.bytes, image);
    restored.bytes.fill(0);
  } finally {
    source.close();
    target.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
