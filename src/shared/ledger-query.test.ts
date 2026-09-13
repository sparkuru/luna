import assert from 'node:assert/strict';
import test from 'node:test';
import { createTransaction, type Transaction } from './domain';
import {
  LedgerQueryError,
  normalizeLedgerQuery,
  queryLedger,
} from './ledger-query';

function transaction(
  id: string,
  type: 'income' | 'expense',
  amountMinor: string,
  date: string,
  splits: { category: string; amountMinor: string }[],
  extra: { merchant?: string; notes?: string } = {},
): Transaction {
  return createTransaction(id, {
    type,
    amountMinor,
    date,
    splits,
    ...extra,
  }, 2, `${date}T00:00:00.000Z`);
}

const transactions = [
  transaction('food', 'expense', '2000', '2026-09-03', [
    { category: '餐饮', amountMinor: '1200' },
    { category: '交通', amountMinor: '800' },
  ], { merchant: '咖啡店', notes: '早餐外卖' }),
  transaction('train', 'expense', '10000', '2026-09-04', [
    { category: '交通', amountMinor: '10000' },
  ], { merchant: '地铁站' }),
  transaction('salary', 'income', '100000', '2026-09-05', [
    { category: '工资', amountMinor: '100000' },
  ], { merchant: '公司' }),
];

test('amount bounds are inclusive and category filters are OR within an AND query', () => {
  const result = queryLedger(transactions, {
    type: 'expense',
    categories: ['餐饮', '交通'],
    minimumMinor: '2000',
    maximumMinor: '10000',
    query: '',
    mode: 'text',
  });
  assert.deepEqual(result.transactionIds, ['food', 'train']);
  assert.equal(result.count, 2);
  assert.equal(result.totalExpenseMinor, '12000');
  assert.equal(result.netFlowMinor, '-12000');
});

test('a split matching several categories still returns one transaction', () => {
  const result = queryLedger(transactions, {
    type: 'all',
    categories: ['餐饮', '交通', '交通'],
    query: '',
    mode: 'text',
  });
  assert.deepEqual(result.transactionIds, ['food', 'train']);
});

test('text and explicit regex search each match fields separately', () => {
  assert.deepEqual(queryLedger(transactions, {
    type: 'all', categories: [], query: '咖啡店', mode: 'text',
  }).transactionIds, ['food']);
  assert.deepEqual(queryLedger(transactions, {
    type: 'all', categories: [], query: '^地铁', mode: 'regex',
  }).transactionIds, ['train']);
  assert.deepEqual(queryLedger(transactions, {
    type: 'all', categories: [], query: '早餐|工资', mode: 'regex',
  }).transactionIds, ['food', 'salary']);
  assert.deepEqual(queryLedger(transactions, {
    type: 'all', categories: [], query: '.', mode: 'text',
  }).transactionIds, []);
});

test('invalid ranges and regular expressions remain recoverable errors', () => {
  assert.throws(() => normalizeLedgerQuery({
    type: 'all', categories: [], dateFrom: '2026-09-05', dateTo: '2026-09-01', query: '', mode: 'text',
  }), (error: unknown) => error instanceof LedgerQueryError && error.code === 'ledger-query-date-range');
  assert.throws(() => normalizeLedgerQuery({
    type: 'all', categories: [], minimumMinor: '101', maximumMinor: '100', query: '', mode: 'text',
  }), (error: unknown) => error instanceof LedgerQueryError && error.code === 'ledger-query-amount-range');
  assert.throws(() => normalizeLedgerQuery({
    type: 'all', categories: [], query: '(', mode: 'regex',
  }), (error: unknown) => error instanceof LedgerQueryError && error.code === 'ledger-query-regex-invalid');
});
