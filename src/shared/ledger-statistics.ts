import {
  DomainError,
  isLocalDate,
  parseMinorUnits,
  type Transaction,
  type TransactionType,
} from './domain';

export const STATISTICS_PERIODS = ['week', 'month', 'year'] as const;
export type StatisticsPeriod = (typeof STATISTICS_PERIODS)[number];

export interface LedgerStatisticsInput {
  transactions: readonly Transaction[];
  period: StatisticsPeriod;
  anchor: string;
  today: string;
  type: TransactionType;
}

export interface StatisticsBucket {
  key: string;
  start: string;
  end: string;
  amountMinor: string | null;
  transactionIds: readonly string[];
  isFuture: boolean;
}

export interface CategoryStatistic {
  category: string;
  amountMinor: string;
}

export interface LargestExpense {
  id: string;
  date: string;
  amountMinor: string;
  merchant: string;
  notes: string;
  categories: readonly string[];
}

export interface LedgerStatistics {
  period: StatisticsPeriod;
  anchor: string;
  start: string;
  end: string;
  type: TransactionType;
  totalMinor: string;
  averageMinor: string | null;
  averageDenominator: number | null;
  buckets: readonly StatisticsBucket[];
  categories: readonly CategoryStatistic[];
  largestExpenses: readonly LargestExpense[];
}

/** Derive all chart and ranking data from one immutable transaction snapshot. */
export function calculateLedgerStatistics(input: LedgerStatisticsInput): LedgerStatistics {
  validateInput(input);
  const range = periodRange(input.period, input.anchor);
  const buckets = makeBuckets(input.period, range.start, range.end);
  let total = 0n;
  const categories = new Map<string, bigint>();
  const bucketAmounts = new Map<string, bigint>();
  const bucketIds = new Map<string, string[]>();
  const largestExpenses: LargestExpense[] = [];

  for (const transaction of input.transactions) {
    if (transaction.deletedAt !== null || transaction.date < range.start || transaction.date > range.end) continue;
    const amount = abs(parseMinorUnits(transaction.amountMinor));
    if (transaction.type === input.type) {
      total += amount;
      for (const split of transaction.splits) {
        const splitAmount = abs(parseMinorUnits(split.amountMinor));
        categories.set(split.category, (categories.get(split.category) ?? 0n) + splitAmount);
      }
      const bucket = bucketKey(input.period, transaction.date);
      bucketAmounts.set(bucket, (bucketAmounts.get(bucket) ?? 0n) + amount);
      const ids = bucketIds.get(bucket) ?? [];
      ids.push(transaction.id);
      bucketIds.set(bucket, ids);
    }
    if (transaction.type === 'expense') {
      largestExpenses.push({
        id: transaction.id,
        date: transaction.date,
        amountMinor: amount.toString(),
        merchant: transaction.merchant,
        notes: transaction.notes,
        categories: transaction.splits.map((split) => split.category),
      });
    }
  }

  const denominator = averageDenominator(input.period, range.start, range.end, input.today);
  const averageMinor = denominator === null ? null : roundDivide(total, denominator);
  return {
    period: input.period,
    anchor: input.anchor,
    start: range.start,
    end: range.end,
    type: input.type,
    totalMinor: total.toString(),
    averageMinor,
    averageDenominator: denominator,
    buckets: buckets.map((bucket) => {
      const future = bucket.start > input.today;
      return {
        ...bucket,
        amountMinor: future ? null : (bucketAmounts.get(bucket.key) ?? 0n).toString(),
        transactionIds: future ? [] : [...(bucketIds.get(bucket.key) ?? [])],
        isFuture: future,
      };
    }),
    categories: [...categories.entries()]
      .map(([category, amount]) => ({ category, amountMinor: amount.toString() }))
      .sort(compareCategory),
    largestExpenses: largestExpenses.sort(compareLargestExpense),
  };
}

interface DateRange {
  start: string;
  end: string;
}

interface BucketShape {
  key: string;
  start: string;
  end: string;
}

function validateInput(input: LedgerStatisticsInput): void {
  if (!STATISTICS_PERIODS.includes(input.period)) {
    throw new DomainError('invalid-input', 'Statistics period is invalid.');
  }
  if (!isLocalDate(input.anchor) || !isLocalDate(input.today)) {
    throw new DomainError('invalid-date', 'Statistics dates must be valid local dates.');
  }
  if (input.type !== 'income' && input.type !== 'expense') {
    throw new DomainError('invalid-input', 'Statistics type is invalid.');
  }
}

function periodRange(period: StatisticsPeriod, anchor: string): DateRange {
  const [yearText, monthText, dayText] = anchor.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (period === 'year') return { start: `${yearText}-01-01`, end: `${yearText}-12-31` };
  if (period === 'month') {
    return {
      start: `${yearText}-${monthText}-01`,
      end: formatDate(new Date(Date.UTC(year, month, 0))),
    };
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = addDays(date, mondayOffset);
  const end = addDays(start, 6);
  return { start: formatDate(start), end: formatDate(end) };
}

function makeBuckets(period: StatisticsPeriod, start: string, end: string): BucketShape[] {
  const buckets: BucketShape[] = [];
  if (period === 'year') {
    const year = Number(start.slice(0, 4));
    for (let month = 1; month <= 12; month += 1) {
      const monthText = month.toString().padStart(2, '0');
      buckets.push({
        key: `${year.toString().padStart(4, '0')}-${monthText}`,
        start: `${year.toString().padStart(4, '0')}-${monthText}-01`,
        end: formatDate(new Date(Date.UTC(year, month, 0))),
      });
    }
    return buckets;
  }
  const cursor = parseDate(start);
  const last = parseDate(end);
  while (cursor <= last) {
    const key = formatDate(cursor);
    buckets.push({ key, start: key, end: key });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

function bucketKey(period: StatisticsPeriod, date: string): string {
  return period === 'year' ? date.slice(0, 7) : date;
}

function averageDenominator(period: StatisticsPeriod, start: string, end: string, today: string): number | null {
  if (start > today) return null;
  const effectiveEnd = end < today ? end : today;
  if (period === 'year') return Number(effectiveEnd.slice(5, 7));
  return daysBetween(start, effectiveEnd) + 1;
}

function daysBetween(start: string, end: string): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000);
}

function roundDivide(value: bigint, denominator: number): string {
  if (denominator <= 0) return '0';
  const divisor = BigInt(denominator);
  return ((value + divisor / 2n) / divisor).toString();
}

function compareCategory(left: CategoryStatistic, right: CategoryStatistic): number {
  const difference = parseMinorUnits(right.amountMinor) - parseMinorUnits(left.amountMinor);
  return difference === 0n ? left.category.localeCompare(right.category) : difference > 0n ? 1 : -1;
}

function compareLargestExpense(left: LargestExpense, right: LargestExpense): number {
  const amountDifference = parseMinorUnits(right.amountMinor) - parseMinorUnits(left.amountMinor);
  if (amountDifference !== 0n) return amountDifference > 0n ? 1 : -1;
  return right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function parseDate(value: string): Date {
  const parts = value.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(value: Date, amount: number): Date {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function formatDate(value: Date): string {
  return `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1).toString().padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}`;
}
