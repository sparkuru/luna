import assert from 'node:assert/strict';
import test from 'node:test';
import { createTransaction } from './domain';
import { calculateLedgerStatistics } from './ledger-statistics';

function tx(id: string, date: string, amountMinor: string, category = 'Food') {
  return createTransaction(id, {
    type: 'expense', amountMinor, date,
    splits: [{ category, amountMinor }],
  }, 2, `${date}T00:00:00.000Z`);
}

test('week statistics start on Monday and fill cross-month buckets', () => {
  const result = calculateLedgerStatistics({
    transactions: [tx('sun', '2026-08-30', '1000'), tx('mon', '2026-08-31', '2000', 'Travel')],
    period: 'week', anchor: '2026-08-30', today: '2026-08-31', type: 'expense',
  });
  assert.equal(result.start, '2026-08-24');
  assert.equal(result.end, '2026-08-30');
  assert.equal(result.buckets.length, 7);
  assert.equal(result.totalMinor, '1000');
  assert.equal(result.averageDenominator, 7);
  assert.equal(result.averageMinor, '143');
});

test('month and year statistics use local date strings and exact integer averages', () => {
  const transactions = [tx('leap', '2028-02-29', '100'), tx('march', '2028-03-01', '201', 'Travel')];
  const month = calculateLedgerStatistics({
    transactions, period: 'month', anchor: '2028-02-20', today: '2028-03-01', type: 'expense',
  });
  assert.equal(month.end, '2028-02-29');
  assert.equal(month.totalMinor, '100');
  assert.equal(month.buckets.length, 29);
  assert.equal(month.averageDenominator, 29);
  assert.equal(month.averageMinor, '3');

  const year = calculateLedgerStatistics({
    transactions, period: 'year', anchor: '2028-01-02', today: '2028-03-15', type: 'expense',
  });
  assert.equal(year.buckets.length, 12);
  assert.equal(year.averageDenominator, 3);
  assert.equal(year.averageMinor, '100');
  assert.equal(year.buckets[1]?.key, '2028-02');
  assert.equal(year.buckets[2]?.key, '2028-03');
});

test('category totals and largest expenses are deterministic and exclude deleted records', () => {
  const result = calculateLedgerStatistics({
    transactions: [tx('a', '2026-09-01', '1000', 'Food'), tx('b', '2026-09-01', '1000', 'Travel'), tx('c', '2026-09-02', '2000', 'Food')],
    period: 'month', anchor: '2026-09-04', today: '2026-09-04', type: 'expense',
  });
  assert.deepEqual(result.categories, [
    { category: 'Food', amountMinor: '3000' },
    { category: 'Travel', amountMinor: '1000' },
  ]);
  assert.deepEqual(result.largestExpenses.map((item) => item.id), ['c', 'a', 'b']);
});

test('largest expenses keep the complete deterministic ranking for the UI to page', () => {
  const result = calculateLedgerStatistics({
    transactions: [
      tx('a', '2026-09-01', '1000'),
      tx('b', '2026-09-02', '2000'),
      tx('c', '2026-09-03', '3000'),
      tx('d', '2026-09-04', '4000'),
      tx('e', '2026-09-05', '5000'),
      tx('f', '2026-09-06', '6000'),
    ],
    period: 'month', anchor: '2026-09-06', today: '2026-09-06', type: 'expense',
  });
  assert.deepEqual(result.largestExpenses.map((item) => item.id), ['f', 'e', 'd', 'c', 'b', 'a']);
});
