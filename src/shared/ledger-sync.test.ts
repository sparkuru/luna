import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateMonthlySummary, createTransaction, reviseTransaction, tombstoneTransaction,
  type Transaction, type TransactionDraft, type Workspace,
} from './domain';
import {
  appendLedgerRevision, assertBudgetHeads, budgetHeadIds, decodeLedgerDocument, LedgerSyncError, MAX_LEDGER_DOCUMENT_BYTES,
  MAX_LEDGER_REVISIONS, mergeLedgerDocuments, projectLedgerDocument, resolveLedgerConflict,
  seedLedgerDocument, type LedgerDocument, type LedgerRevisionInput, type LedgerSyncErrorCode,
} from './ledger-sync';
import { decodeBudgetUpdate } from './ledger-data';

test('budget preconditions include absence, inherited source and every conflict head', () => {
  const empty = seedLedgerDocument(workspace, [], {});
  assert.deepEqual(budgetHeadIds(empty, '2026-10'), []);
  assertBudgetHeads(empty, '2026-10', []);
  const first = appendLedgerRevision(empty, { id: 'first', kind: 'budget', entityId: '2026-09', value: '100' });
  assert.deepEqual(budgetHeadIds(first, '2026-10'), ['first']);
  assert.throws(() => assertBudgetHeads(first, '2026-10', []), /ledger-stale-budget/);
  const second = appendLedgerRevision(first, { id: 'second', kind: 'budget', entityId: '2026-09', value: '200' });
  assert.throws(() => assertBudgetHeads(second, '2026-10', ['first']), /ledger-stale-budget/);
  const other = appendLedgerRevision(first, { id: 'other', kind: 'budget', entityId: '2026-09', value: null });
  const merged = mergeLedgerDocuments(second, other);
  assert.deepEqual(budgetHeadIds(merged, '2026-10'), ['other', 'second']);
  assertBudgetHeads(merged, '2026-10', ['second', 'other']);
  assert.throws(() => assertBudgetHeads(merged, '2026-10', ['other']), /ledger-stale-budget/);
});

test('budget update decoder validates and detaches observed heads at the API boundary', () => {
  const ids = ['second', 'first'];
  assert.deepEqual(decodeBudgetUpdate({ month: '2026-09', budgetMinor: null, expectedHeadIds: ids }),
    { month: '2026-09', budgetMinor: null, expectedHeadIds: ['first', 'second'] });
  assert.deepEqual(ids, ['second', 'first']);
  for (const invalid of [null, 'first', ['same', 'same'], [''], [12], ['x'.repeat(513)]]) {
    assert.throws(() => decodeBudgetUpdate({ month: '2026-09', budgetMinor: '100', expectedHeadIds: invalid }), LedgerSyncError);
  }
  assert.deepEqual(decodeBudgetUpdate({ month: '2026-09', budgetMinor: '100' }), { month: '2026-09', budgetMinor: '100' });
});

const workspace: Workspace = {
  id: 'household', name: 'Household', currency: 'CNY', precision: 2, createdAt: '2026-09-01T00:00:00.000Z',
};
const draft: TransactionDraft = {
  type: 'expense', amountMinor: '1000', date: '2026-09-05', splits: [{ category: 'Food', amountMinor: '1000' }],
};
const firstTime = '2026-09-05T01:00:00.000Z';
const nextTime = '2026-09-05T02:00:00.000Z';

function transaction(id = 'purchase'): Transaction {
  return createTransaction(id, draft, 2, firstTime);
}

function change(value: Transaction, amount = '2000'): Transaction {
  return reviseTransaction(value, { ...draft, amountMinor: amount, splits: [{ category: 'Food', amountMinor: amount }] }, 2, nextTime);
}

function input(id: string, value: Transaction): LedgerRevisionInput {
  return { id, kind: 'transaction', entityId: value.id, value };
}

function errorCode(code: LedgerSyncErrorCode): (error: unknown) => boolean {
  return (error) => error instanceof LedgerSyncError && error.code === code && error.message === `LUNA_ERROR:${code}`;
}

function conflictingEdits() {
  const original = transaction();
  const base = seedLedgerDocument(workspace, [original], {});
  const edited = change(original);
  const deleted = tombstoneTransaction(original, nextTime);
  const left = appendLedgerRevision(base, input('edit', edited));
  const right = appendLedgerRevision(base, input('delete', deleted));
  return { base, edited, deleted, left, right, merged: mergeLedgerDocuments(left, right) };
}

test('seeding is deterministic, detached, and supports full-length domain IDs', () => {
  const long = transaction('x'.repeat(200));
  const first = seedLedgerDocument(workspace, [long, transaction()], { '2026-09': '05000', '2026-10': null });
  const second = seedLedgerDocument(workspace, [transaction(), long], { '2026-10': null, '2026-09': '5000' });
  assert.deepEqual(first, second);
  assert.equal(first.revisions.find((revision) => revision.kind === 'budget' && revision.entityId === '2026-09')?.value, '5000');
  const projected = projectLedgerDocument(first);
  projected.workspace.name = 'External mutation';
  const value = projected.transactions[0];
  assert.ok(value);
  value.notes = 'External mutation';
  assert.equal(first.workspace.name, 'Household');
  assert.equal(projectLedgerDocument(first).transactions[0]?.notes, '');
  assert.equal(long.revision, 1);
});

test('strict decoder rejects unknown fields, invalid amounts, mismatched identities, and unsupported versions', () => {
  const base = seedLedgerDocument(workspace, [transaction()], {});
  const root = base.revisions[0];
  assert.ok(root?.kind === 'transaction');
  const invalid: unknown[] = [
    null, [], { ...base, schemaVersion: 2 }, { ...base, secret: 'unexpected' },
    { ...base, workspace: { ...workspace, deviceId: 'unexpected' } },
    { ...base, revisions: [{ ...root, deviceId: 'unexpected' }] },
    { ...base, revisions: [{ ...root, entityId: 'different' }] },
    { ...base, revisions: [{ ...root, value: { ...root.value, amountMinor: '-9999' } }] },
    { ...base, revisions: [{ id: 'budget', kind: 'budget', entityId: '2026-13', parents: [], value: '10' }] },
    { ...base, revisions: [{ id: 'budget', kind: 'budget', entityId: '2026-09', parents: [], value: '-10' }] },
    { ...base, revisions: [{ ...root, value: { ...root.value, revision: Number.MAX_SAFE_INTEGER + 1 } }] },
  ];
  for (const value of invalid) assert.throws(() => decodeLedgerDocument(value), errorCode('ledger-invalid-document'));
});

test('independent creates and edits merge without conflicts or duplicate statistics', () => {
  const first = transaction('first');
  const second = transaction('second');
  const base = seedLedgerDocument(workspace, [first, second], {});
  const left = appendLedgerRevision(base, input('edit-first', change(first, '2000')));
  const right = appendLedgerRevision(base, input('edit-second', change(second, '3000')));
  const leftWithNew = appendLedgerRevision(left, input('create-third', transaction('third')));
  const projected = projectLedgerDocument(mergeLedgerDocuments(leftWithNew, right));
  assert.equal(projected.conflicts.length, 0);
  assert.equal(projected.transactions.length, 3);
  assert.equal(calculateMonthlySummary(projected.transactions, '2026-09', null).totalExpenseMinor, '6000');
});

test('concurrent edit and delete expose both candidates and exclude the entity from financial totals', () => {
  const { merged, edited, deleted } = conflictingEdits();
  const projected = projectLedgerDocument(merged);
  assert.equal(projected.transactions.length, 0);
  assert.equal(projected.conflicts.length, 1);
  const conflict = projected.conflicts[0];
  assert.ok(conflict?.kind === 'transaction');
  assert.deepEqual(conflict.heads.map((head) => head.id), ['delete', 'edit']);
  assert.deepEqual(conflict.heads.map((head) => head.value), [deleted, edited]);
  assert.equal(calculateMonthlySummary(projected.transactions, '2026-09', null).totalExpenseMinor, '0');
});

test('merges converge across direction, association, repeated uploads, and revision/parent ordering', () => {
  const { base, left, right, merged } = conflictingEdits();
  const third = appendLedgerRevision(base, input('third-edit', change(transaction(), '4000')));
  const expected = mergeLedgerDocuments(merged, third);
  assert.deepEqual(expected, mergeLedgerDocuments(third, mergeLedgerDocuments(right, left)));
  assert.deepEqual(expected, mergeLedgerDocuments(left, mergeLedgerDocuments(right, third)));
  assert.deepEqual(expected, mergeLedgerDocuments(expected, expected));
  assert.deepEqual(expected, mergeLedgerDocuments(expected, base));
  assert.deepEqual(expected, decodeLedgerDocument({ ...expected, revisions: [...expected.revisions].reverse() }));
  const resolved = resolveLedgerConflict(merged, input('resolved', { ...change(transaction()), revision: 3 }), ['edit', 'delete']);
  const reordered = { ...resolved, revisions: resolved.revisions.map((revision) => ({ ...revision, parents: [...revision.parents].reverse() })) };
  assert.deepEqual(resolved, mergeLedgerDocuments(resolved, reordered));
});

test('identical revision IDs deduplicate but collisions reject regardless of delivery order', () => {
  const first = seedLedgerDocument(workspace, [transaction()], {});
  assert.deepEqual(first, decodeLedgerDocument({ ...first, revisions: [...first.revisions, ...first.revisions] }));
  const different = seedLedgerDocument(workspace, [change(transaction())], {});
  assert.throws(() => mergeLedgerDocuments(first, different), errorCode('ledger-revision-collision'));
  assert.throws(() => mergeLedgerDocuments(different, first), errorCode('ledger-revision-collision'));
});

test('replaying an ancestor never resurrects an effective tombstone', () => {
  const original = transaction();
  const base = seedLedgerDocument(workspace, [original], {});
  const deleted = appendLedgerRevision(base, input('deleted', tombstoneTransaction(original, nextTime)));
  const projected = projectLedgerDocument(mergeLedgerDocuments(base, deleted));
  assert.equal(projected.conflicts.length, 0);
  assert.equal(projected.transactions.length, 1);
  assert.ok(projected.transactions[0]?.deletedAt);
  assert.equal(calculateMonthlySummary(projected.transactions, '2026-09', null).transactionCount, 0);
});

test('budget conflicts explicitly suppress the limit until all heads are resolved', () => {
  const base = seedLedgerDocument(workspace, [], { '2026-08': '1000', '2026-09': '2000' });
  const left = appendLedgerRevision(base, { id: 'budget-left', kind: 'budget', entityId: '2026-09', value: '3000' });
  const right = appendLedgerRevision(base, { id: 'budget-right', kind: 'budget', entityId: '2026-09', value: null });
  const merged = mergeLedgerDocuments(left, right);
  const projected = projectLedgerDocument(merged);
  assert.equal(projected.budgets['2026-08'], '1000');
  assert.ok(Object.prototype.hasOwnProperty.call(projected.budgets, '2026-09'));
  assert.equal(projected.budgets['2026-09'], null);
  assert.equal(projected.conflicts[0]?.kind, 'budget');
  const resolved = resolveLedgerConflict(merged, { id: 'budget-resolve', kind: 'budget', entityId: '2026-09', value: '4000' }, ['budget-left', 'budget-right']);
  assert.equal(projectLedgerDocument(resolved).budgets['2026-09'], '4000');
  assert.equal(projectLedgerDocument(resolved).conflicts.length, 0);
});

test('explicit resolution consumes every head, accepts a selected tombstone, and survives ancestor replay', () => {
  const { merged, left, right, deleted } = conflictingEdits();
  const resolved = resolveLedgerConflict(merged, input('resolve-deletion', { ...deleted, revision: 3 }), ['edit', 'delete']);
  assert.deepEqual(resolved.revisions.find((revision) => revision.id === 'resolve-deletion')?.parents, ['delete', 'edit']);
  const replayed = mergeLedgerDocuments(mergeLedgerDocuments(resolved, left), right);
  const projected = projectLedgerDocument(replayed);
  assert.equal(projected.conflicts.length, 0);
  assert.equal(projected.transactions[0]?.revision, 3);
  assert.ok(projected.transactions[0]?.deletedAt);
});

test('stale resolution and editing a conflicted entity fail without mutating input documents', () => {
  const { base, merged, edited } = conflictingEdits();
  const before = JSON.stringify(merged);
  const resolvedInput = input('resolve', { ...edited, revision: 3 });
  assert.throws(() => appendLedgerRevision(merged, resolvedInput), errorCode('ledger-conflict'));
  assert.throws(() => resolveLedgerConflict(merged, resolvedInput, ['edit']), errorCode('ledger-stale-heads'));
  assert.throws(() => resolveLedgerConflict(merged, resolvedInput, ['edit', 'edit']), errorCode('ledger-invalid-parent'));
  const third = appendLedgerRevision(base, input('new-concurrent', change(transaction(), '4000')));
  const changed = mergeLedgerDocuments(merged, third);
  assert.throws(() => resolveLedgerConflict(changed, resolvedInput, ['edit', 'delete']), errorCode('ledger-stale-heads'));
  assert.equal(JSON.stringify(merged), before);
});

test('ordinary edit guards observed heads and requires one-step numeric revision progress', () => {
  const original = transaction();
  const base = seedLedgerDocument(workspace, [original], {});
  const root = base.revisions[0];
  assert.ok(root);
  assert.throws(() => appendLedgerRevision(base, input('new', change(original)), []), errorCode('ledger-stale-heads'));
  assert.throws(() => appendLedgerRevision(base, input('reused', original)), errorCode('ledger-invalid-document'));
  assert.throws(() => appendLedgerRevision(base, input('skipped', { ...original, revision: 3 })), errorCode('ledger-invalid-document'));
  const result = appendLedgerRevision(base, input('new', change(original)), [root.id]);
  assert.equal(projectLedgerDocument(result).transactions[0]?.revision, 2);
  const { merged, edited } = conflictingEdits();
  assert.throws(() => resolveLedgerConflict(merged, input('resolve', edited), ['edit', 'delete']), errorCode('ledger-invalid-document'));
});

test('decoder rejects missing, duplicate, cross-kind, and cross-entity parents', () => {
  const base = seedLedgerDocument(workspace, [transaction('first'), transaction('second')], { '2026-09': '100' });
  const original = transaction('first');
  const child = { ...input('child', change(original)), parents: ['missing'] };
  for (const parents of [
    ['missing'], ['seed:transaction:first', 'seed:transaction:first'],
    ['seed:transaction:second'], ['seed:budget:2026-09'],
  ]) {
    assert.throws(() => decodeLedgerDocument({ ...base, revisions: [...base.revisions, { ...child, parents }] }), errorCode('ledger-invalid-parent'));
  }
  const incomplete = { ...base, revisions: [{ ...child, parents: ['seed:transaction:first'] }] };
  assert.throws(() => mergeLedgerDocuments(base, incomplete), errorCode('ledger-invalid-parent'));
});

test('decoder rejects cycles without recursion and rejects backward or reused numeric revisions', () => {
  const base = seedLedgerDocument(workspace, [transaction()], {});
  const first = base.revisions[0];
  assert.ok(first?.kind === 'transaction');
  for (const revisions of [
    [{ ...first, parents: [first.id] }],
    [{ ...first, parents: ['cycle'] }, { ...first, id: 'cycle', parents: [first.id] }],
  ]) assert.throws(() => decodeLedgerDocument({ ...base, revisions }), errorCode('ledger-cycle'));
  for (const revision of [1, 2]) {
    const parent = { ...first, value: { ...first.value, revision: 2 } };
    const child = { ...first, id: 'child', parents: [first.id], value: { ...first.value, revision } };
    assert.throws(() => decodeLedgerDocument({ ...base, revisions: [parent, child] }), errorCode('ledger-invalid-document'));
  }
});

test('workspace differences never merge even if transaction identifiers coincide', () => {
  const base = seedLedgerDocument(workspace, [transaction()], {});
  for (const changed of [{ ...workspace, id: 'different' }, { ...workspace, currency: 'USD' }, { ...workspace, name: 'Different name' }]) {
    const other = seedLedgerDocument(changed, [transaction()], {});
    assert.throws(() => mergeLedgerDocuments(base, other), errorCode('ledger-workspace-mismatch'));
  }
});

test('document byte, revision-count, and aggregate parent-link limits fail explicitly', () => {
  const base = seedLedgerDocument(workspace, [], {});
  const root = { id: 'root', kind: 'budget', entityId: '2026-09', parents: [], value: '100' };
  assert.throws(() => decodeLedgerDocument({ ...base, revisions: Array(MAX_LEDGER_REVISIONS + 1).fill(root) }), errorCode('ledger-too-large'));
  assert.throws(() => decodeLedgerDocument({ ...base, workspace: { ...workspace, name: 'x'.repeat(MAX_LEDGER_DOCUMENT_BYTES) } }), errorCode('ledger-too-large'));
  const roots = Array.from({ length: 101 }, (_, index) => ({ ...root, id: `root-${index}` }));
  const children = Array.from({ length: 1000 }, (_, index) => ({ ...root, id: `child-${index}`, parents: roots.map((revision) => revision.id) }));
  assert.throws(() => decodeLedgerDocument({ ...base, revisions: [...roots, ...children] }), errorCode('ledger-too-large'));
});

test('long causal histories validate iteratively and project only their single current head', () => {
  const revisions = Array.from({ length: 3000 }, (_, index) => ({
    id: `budget-${index}`, kind: 'budget', entityId: '2026-09', parents: index === 0 ? [] : [`budget-${index - 1}`], value: String(index),
  }));
  const decoded = decodeLedgerDocument({ schemaVersion: 1, workspace, revisions });
  assert.equal(projectLedgerDocument(decoded).budgets['2026-09'], '2999');
});
