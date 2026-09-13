import {
  DomainError,
  isLocalDate,
  parseMinorUnits,
  type Transaction,
  type TransactionType,
  type TransactionTypeFilter,
} from './domain';

export const MAX_LEDGER_QUERY_LENGTH = 256;

export type LedgerQueryMode = 'text' | 'regex';

export interface LedgerQueryInput {
  dateFrom?: string;
  dateTo?: string;
  type: TransactionTypeFilter;
  categories: readonly string[];
  minimumMinor?: string;
  maximumMinor?: string;
  query: string;
  mode: LedgerQueryMode;
}

export interface LedgerQueryResult {
  transactionIds: readonly string[];
  count: number;
  totalIncomeMinor: string;
  totalExpenseMinor: string;
  netFlowMinor: string;
}

/** Fields needed by the query engine; attachment bytes and host-only data are never required. */
export type LedgerQueryRecord = Pick<
  Transaction,
  | 'id'
  | 'type'
  | 'amountMinor'
  | 'date'
  | 'splits'
  | 'merchant'
  | 'paymentMethod'
  | 'notes'
  | 'deletedAt'
>;

export type LedgerQueryErrorCode =
  | 'ledger-query-invalid'
  | 'ledger-query-date-range'
  | 'ledger-query-amount-range'
  | 'ledger-query-regex-invalid';

export class LedgerQueryError extends Error {
  constructor(readonly code: LedgerQueryErrorCode, message: string) {
    super(message);
    this.name = 'LedgerQueryError';
  }
}

interface NormalizedLedgerQuery {
  dateFrom?: string;
  dateTo?: string;
  type: TransactionTypeFilter;
  categories: readonly string[];
  minimumMinor?: bigint;
  maximumMinor?: bigint;
  query: string;
  mode: LedgerQueryMode;
  matcher: ((value: string) => boolean) | null;
}

/** Validate and normalize a user-facing query before scanning the snapshot. */
export function normalizeLedgerQuery(input: LedgerQueryInput): LedgerQueryInput {
  const normalized = normalizeQuery(input);
  return {
    ...(normalized.dateFrom === undefined ? {} : { dateFrom: normalized.dateFrom }),
    ...(normalized.dateTo === undefined ? {} : { dateTo: normalized.dateTo }),
    type: normalized.type,
    categories: [...normalized.categories],
    ...(normalized.minimumMinor === undefined ? {} : { minimumMinor: normalized.minimumMinor.toString() }),
    ...(normalized.maximumMinor === undefined ? {} : { maximumMinor: normalized.maximumMinor.toString() }),
    query: normalized.query,
    mode: normalized.mode,
  };
}

/**
 * Search the current ledger snapshot. A matching transaction is returned once
 * even when several of its splits match the selected category set.
 */
export function queryLedger(
  transactions: readonly LedgerQueryRecord[],
  input: LedgerQueryInput,
): LedgerQueryResult {
  const query = normalizeQuery(input);
  let totalIncome = 0n;
  let totalExpense = 0n;
  const transactionIds: string[] = [];

  for (const transaction of transactions) {
    if (!matchesTransaction(transaction, query)) continue;
    transactionIds.push(transaction.id);
    const amount = parseMinorUnits(transaction.amountMinor);
    if (transaction.type === 'income') totalIncome += amount;
    else totalExpense += -amount;
  }

  return {
    transactionIds,
    count: transactionIds.length,
    totalIncomeMinor: totalIncome.toString(),
    totalExpenseMinor: totalExpense.toString(),
    netFlowMinor: (totalIncome - totalExpense).toString(),
  };
}

function normalizeQuery(input: LedgerQueryInput): NormalizedLedgerQuery {
  if (typeof input !== 'object' || input === null) {
    throw new LedgerQueryError('ledger-query-invalid', 'Search filters are invalid.');
  }
  if (!['all', 'income', 'expense'].includes(input.type)) {
    throw new LedgerQueryError('ledger-query-invalid', 'Transaction type filter is invalid.');
  }
  if (input.mode !== 'text' && input.mode !== 'regex') {
    throw new LedgerQueryError('ledger-query-invalid', 'Search mode is invalid.');
  }
  if (typeof input.query !== 'string' || input.query.length > MAX_LEDGER_QUERY_LENGTH) {
    throw new LedgerQueryError('ledger-query-invalid', 'Search text is too long.');
  }

  const dateFrom = normalizeDate(input.dateFrom, 'start date');
  const dateTo = normalizeDate(input.dateTo, 'end date');
  if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
    throw new LedgerQueryError('ledger-query-date-range', 'The start date must not be after the end date.');
  }

  const minimumMinor = normalizeMinorBound(input.minimumMinor, 'minimum amount');
  const maximumMinor = normalizeMinorBound(input.maximumMinor, 'maximum amount');
  if (minimumMinor !== undefined && maximumMinor !== undefined && minimumMinor > maximumMinor) {
    throw new LedgerQueryError('ledger-query-amount-range', 'The minimum amount must not exceed the maximum amount.');
  }

  if (!Array.isArray(input.categories)) {
    throw new LedgerQueryError('ledger-query-invalid', 'Categories must be a list.');
  }
  const categories = [...new Set(input.categories.map((category) => {
    if (typeof category !== 'string') {
      throw new LedgerQueryError('ledger-query-invalid', 'Category filters must be text.');
    }
    return category.trim();
  }).filter((category) => category.length > 0))];

  const queryText = input.query.trim();
  let matcher: ((value: string) => boolean) | null = null;
  if (queryText.length > 0 && input.mode === 'regex') {
    let expression: RegExp;
    try {
      expression = new RegExp(queryText, 'iu');
    } catch {
      throw new LedgerQueryError('ledger-query-regex-invalid', 'The regular expression is invalid.');
    }
    matcher = (value) => expression.test(value);
  }

  return {
    ...(dateFrom === undefined ? {} : { dateFrom }),
    ...(dateTo === undefined ? {} : { dateTo }),
    type: input.type,
    categories,
    ...(minimumMinor === undefined ? {} : { minimumMinor }),
    ...(maximumMinor === undefined ? {} : { maximumMinor }),
    query: queryText,
    mode: input.mode,
    matcher,
  };
}

function matchesTransaction(transaction: LedgerQueryRecord, query: NormalizedLedgerQuery): boolean {
  if (transaction.deletedAt !== null) return false;
  if (query.dateFrom !== undefined && transaction.date < query.dateFrom) return false;
  if (query.dateTo !== undefined && transaction.date > query.dateTo) return false;
  if (query.type !== 'all' && transaction.type !== query.type) return false;

  if (query.categories.length > 0 && !transaction.splits.some((split) => query.categories.includes(split.category))) {
    return false;
  }

  const magnitude = abs(parseMinorUnits(transaction.amountMinor));
  if (query.minimumMinor !== undefined && magnitude < query.minimumMinor) return false;
  if (query.maximumMinor !== undefined && magnitude > query.maximumMinor) return false;
  if (query.query.length === 0) return true;

  const fields = [
    transaction.merchant,
    transaction.paymentMethod,
    transaction.notes,
    ...transaction.splits.map((split) => split.category),
  ];
  if (query.mode === 'regex') return query.matcher?.(fields[0] ?? '') === true || fields.slice(1).some((field) => query.matcher?.(field) === true);
  const lowerQuery = query.query.toLocaleLowerCase();
  return fields.some((field) => field.toLocaleLowerCase().includes(lowerQuery));
}

function normalizeDate(value: string | undefined, label: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !isLocalDate(value)) {
    throw new DomainError('invalid-date', `${label} must be a valid local date.`);
  }
  return value;
}

function normalizeMinorBound(value: string | undefined, label: string): bigint | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new LedgerQueryError('ledger-query-amount-range', `${label} is invalid.`);
  }
  try {
    const amount = parseMinorUnits(value);
    if (amount < 0n) throw new Error('negative');
    return amount;
  } catch {
    throw new LedgerQueryError('ledger-query-amount-range', `${label} must be a non-negative minor-unit amount.`);
  }
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}
