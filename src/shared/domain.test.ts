import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DomainError,
  calculateMonthlySummary,
  createTransaction,
  decimalToMinorUnits,
  filterTransactions,
  formatMinorUnits,
  localMonthFromTimestamp,
  normalizeTransactionDraft,
  parseMinorUnits,
  tombstoneTransaction,
} from './domain';

test('decimal amounts are converted to exact minor units without floating point', () => {
  assert.equal(decimalToMinorUnits('12.34', 2), '1234');
  assert.equal(decimalToMinorUnits('0.1', 2), '10');
  assert.equal(decimalToMinorUnits('1.2300', 2), '123');
  assert.equal(decimalToMinorUnits('100', 0), '100');
  assert.equal(formatMinorUnits('9007199254740993', 0), '9,007,199,254,740,993');
  assert.equal(parseMinorUnits('-9007199254740993'), -9007199254740993n);
  assert.throws(() => decimalToMinorUnits('1.001', 2), DomainError);
});

test('workspace timestamps derive their initial budget month from local calendar time', () => {
  assert.equal(localMonthFromTimestamp('2026-08-30T12:00:00.000Z'), '2026-08');
  assert.throws(() => localMonthFromTimestamp('not-a-timestamp'), /valid date and time/);
});

test('transaction normalization applies type sign and enforces exact split totals', () => {
  const income = normalizeTransactionDraft(
    {
      type: 'income',
      amountMinor: '1500',
      date: '2026-08-30',
      splits: [
        { category: 'Work', amountMinor: '1000' },
        { category: 'Bonus', amountMinor: '500' },
      ],
    },
    2,
  );
  assert.equal(income.amountMinor, '1500');
  assert.deepEqual(income.splits.map((split) => split.amountMinor), ['1000', '500']);

  const expense = normalizeTransactionDraft(
    {
      type: 'expense',
      amountMinor: '1500',
      date: '2026-08-30',
      splits: [{ category: 'Home', amountMinor: '1500' }],
    },
    2,
  );
  assert.equal(expense.amountMinor, '-1500');
  assert.equal(expense.splits[0]?.amountMinor, '-1500');

  assert.throws(
    () =>
      normalizeTransactionDraft(
        {
          type: 'expense',
          amountMinor: '1500',
          date: '2026-08-30',
          splits: [{ category: 'Home', amountMinor: '1499' }],
        },
        2,
      ),
    /add up exactly/,
  );
  assert.throws(
    () =>
      normalizeTransactionDraft(
        {
          type: 'expense',
          amountMinor: '1500',
          date: '2026-02-30',
          splits: [{ category: 'Home', amountMinor: '1500' }],
        },
        2,
      ),
    /valid local date/,
  );
});

test('monthly summary excludes tombstones and counts each split once', () => {
  const income = createTransaction(
    'income-1',
    {
      type: 'income',
      amountMinor: '500000',
      date: '2026-08-01',
      splits: [
        { category: 'Salary', amountMinor: '450000' },
        { category: 'Bonus', amountMinor: '50000' },
      ],
    },
    2,
    '2026-08-01T01:00:00.000Z',
  );
  const expense = createTransaction(
    'expense-1',
    {
      type: 'expense',
      amountMinor: '120000',
      date: '2026-08-15',
      splits: [{ category: 'Home', amountMinor: '120000' }],
    },
    2,
    '2026-08-15T01:00:00.000Z',
  );
  const deleted = tombstoneTransaction(
    createTransaction(
      'deleted-1',
      {
        type: 'expense',
        amountMinor: '900000',
        date: '2026-08-20',
        splits: [{ category: 'Ignored', amountMinor: '900000' }],
      },
      2,
      '2026-08-20T01:00:00.000Z',
    ),
    '2026-08-21T01:00:00.000Z',
  );
  const summary = calculateMonthlySummary([income, expense, deleted], '2026-08', '300000');

  assert.equal(summary.totalIncomeMinor, '500000');
  assert.equal(summary.totalExpenseMinor, '120000');
  assert.equal(summary.netFlowMinor, '380000');
  assert.equal(summary.budgetUsedMinor, '120000');
  assert.equal(summary.budgetRemainingMinor, '180000');
  assert.equal(summary.transactionCount, 2);
  assert.deepEqual(summary.categoryTotals, [
    { category: 'Home', incomeMinor: '0', expenseMinor: '120000' },
    { category: 'Bonus', incomeMinor: '50000', expenseMinor: '0' },
    { category: 'Salary', incomeMinor: '450000', expenseMinor: '0' },
  ]);
});

test('transaction filters are month-aware and searchable', () => {
  const first = createTransaction(
    'first',
    {
      type: 'expense',
      amountMinor: '200',
      date: '2026-08-03',
      splits: [{ category: 'Food', amountMinor: '200' }],
      merchant: 'Corner shop',
      notes: 'Breakfast',
    },
    2,
    '2026-08-03T00:00:00.000Z',
  );
  const second = createTransaction(
    'second',
    {
      type: 'income',
      amountMinor: '1000',
      date: '2026-09-03',
      splits: [{ category: 'Work', amountMinor: '1000' }],
    },
    2,
    '2026-09-03T00:00:00.000Z',
  );
  assert.deepEqual(
    filterTransactions([first, second], {
      month: '2026-08',
      type: 'expense',
      query: 'breakfast',
      category: '',
    }).map((transaction) => transaction.id),
    ['first'],
  );
  assert.deepEqual(
    filterTransactions([first, second], {
      month: '2026-08',
      type: 'all',
      query: '',
      category: 'work',
    }),
    [],
  );
});
