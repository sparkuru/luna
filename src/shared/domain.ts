/**
 * Platform-neutral domain types and invariants.
 *
 * Amounts cross process boundaries as canonical decimal strings. The domain
 * parses them to bigint only while validating or calculating derived values,
 * so large minor-unit amounts never pass through a JavaScript Number.
 */

export const TRANSACTION_TYPES = ['income', 'expense'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const FILTER_TRANSACTION_TYPES = ['all', ...TRANSACTION_TYPES] as const;
export type TransactionTypeFilter = (typeof FILTER_TRANSACTION_TYPES)[number];

export interface WorkspaceSetupInput {
  name: string;
  currency: string;
  precision: number;
  monthlyBudgetMinor: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  currency: string;
  precision: number;
  createdAt: string;
}

/** Amounts in drafts are unsigned magnitudes. The normalized Transaction is signed. */
export interface SplitInput {
  category: string;
  amountMinor: string;
}

export interface TransactionDraft {
  type: TransactionType;
  amountMinor: string;
  date: string;
  splits: readonly SplitInput[];
  merchant?: string;
  paymentMethod?: string;
  notes?: string;
}

export interface Split {
  category: string;
  /** Signed to match the parent transaction. */
  amountMinor: string;
}

export interface Transaction {
  id: string;
  revision: number;
  type: TransactionType;
  /** Income is positive; expense is negative. */
  amountMinor: string;
  date: string;
  splits: readonly Split[];
  merchant: string;
  paymentMethod: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TransactionFilters {
  month: string;
  type: TransactionTypeFilter;
  query: string;
  category: string;
}

export interface CategorySummary {
  category: string;
  incomeMinor: string;
  expenseMinor: string;
}

export interface MonthlySummary {
  month: string;
  totalIncomeMinor: string;
  totalExpenseMinor: string;
  netFlowMinor: string;
  budgetMinor: string | null;
  budgetUsedMinor: string;
  budgetRemainingMinor: string | null;
  transactionCount: number;
  categoryTotals: readonly CategorySummary[];
}

export interface SyncStatus {
  mode: 'local-only';
  remoteSyncEnabled: false;
  pendingChanges: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface AppSnapshot {
  conflictCount?: number;
  /** Heads of the effective budget for the requested month, including inherited limits. */
  budgetHeadIds?: string[];
  workspace: Workspace | null;
  transactions: readonly Transaction[];
  summary: MonthlySummary | null;
  sync: SyncStatus;
}

export interface TransactionUpdateInput {
  id: string;
  draft: TransactionDraft;
  expectedRevision?: number;
}

export interface BudgetInput {
  month: string;
  budgetMinor: string | null;
}

export type DomainErrorCode =
  | 'invalid-input'
  | 'invalid-amount'
  | 'invalid-date'
  | 'invalid-month'
  | 'invalid-workspace'
  | 'invalid-transaction'
  | 'not-found'
  | 'stale-revision'
  | 'already-configured';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some((key) => !(key in value))) {
    throw new DomainError('invalid-input', `${label} has unsupported or missing fields.`);
  }
}

function decodeStoredTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 100 ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new DomainError('invalid-input', `${label} must be a valid timestamp.`);
  }
  return value;
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string') {
    throw new DomainError('invalid-input', `${key} must be a string.`);
  }
  return field;
}

function readOptionalString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (field === undefined) return '';
  if (typeof field !== 'string') {
    throw new DomainError('invalid-input', `${key} must be a string when provided.`);
  }
  return field;
}

function readRequiredInteger(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field !== 'number' || !Number.isInteger(field)) {
    throw new DomainError('invalid-input', `${key} must be an integer.`);
  }
  return field;
}

function isTransactionType(value: unknown): value is TransactionType {
  return value === 'income' || value === 'expense';
}

/** Decode untrusted IPC/JSON input once at the shared boundary. */
export function decodeWorkspaceSetup(value: unknown): WorkspaceSetupInput {
  if (!isRecord(value)) {
    throw new DomainError('invalid-input', 'Workspace setup must be an object.');
  }

  const budget = value.monthlyBudgetMinor;
  if (budget !== null && typeof budget !== 'string') {
    throw new DomainError('invalid-input', 'monthlyBudgetMinor must be a string or null.');
  }

  return {
    name: readRequiredString(value, 'name'),
    currency: readRequiredString(value, 'currency'),
    precision: readRequiredInteger(value, 'precision'),
    monthlyBudgetMinor: budget,
  };
}

/** Decode a workspace restored from a browser-local serialized state. */
export function decodeWorkspace(value: unknown): Workspace {
  if (!isRecord(value)) {
    throw new DomainError('invalid-input', 'Stored workspace must be an object.');
  }
  assertExactKeys(value, ['id', 'name', 'currency', 'precision', 'createdAt'], 'stored workspace');
  const normalized = normalizeWorkspaceSetup({
    name: readRequiredString(value, 'name'),
    currency: readRequiredString(value, 'currency'),
    precision: readRequiredInteger(value, 'precision'),
    monthlyBudgetMinor: null,
  });
  return {
    id: decodeId(value.id, 'workspace id'),
    name: normalized.name,
    currency: normalized.currency,
    precision: normalized.precision,
    createdAt: decodeStoredTimestamp(value.createdAt, 'workspace createdAt'),
  };
}

/** Decode a transaction draft before domain normalization. */
export function decodeTransactionDraft(value: unknown): TransactionDraft {
  if (!isRecord(value)) {
    throw new DomainError('invalid-input', 'Transaction must be an object.');
  }
  if (!isTransactionType(value.type)) {
    throw new DomainError('invalid-input', 'type must be income or expense.');
  }

  const rawSplits = value.splits;
  if (!Array.isArray(rawSplits)) {
    throw new DomainError('invalid-input', 'splits must be an array.');
  }

  const splits = rawSplits.map((rawSplit) => {
    if (!isRecord(rawSplit)) {
      throw new DomainError('invalid-input', 'Each split must be an object.');
    }
    return {
      category: readRequiredString(rawSplit, 'category'),
      amountMinor: readRequiredString(rawSplit, 'amountMinor'),
    };
  });

  return {
    type: value.type,
    amountMinor: readRequiredString(value, 'amountMinor'),
    date: readRequiredString(value, 'date'),
    splits,
    merchant: readOptionalString(value, 'merchant'),
    paymentMethod: readOptionalString(value, 'paymentMethod'),
    notes: readOptionalString(value, 'notes'),
  };
}

/** Decode a normalized transaction restored from a browser-local state. */
export function decodeTransaction(value: unknown, precision: number): Transaction {
  if (!isRecord(value)) {
    throw new DomainError('invalid-input', 'Stored transaction must be an object.');
  }
  assertExactKeys(
    value,
    [
      'id',
      'revision',
      'type',
      'amountMinor',
      'date',
      'splits',
      'merchant',
      'paymentMethod',
      'notes',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ],
    'stored transaction',
  );
  if (!isTransactionType(value.type)) {
    throw new DomainError('invalid-transaction', 'Stored transaction type is invalid.');
  }
  const signedAmount = parseMinorUnits(readRequiredString(value, 'amountMinor'));
  const magnitude = signedAmount < 0n ? -signedAmount : signedAmount;
  const rawSplits = value.splits;
  if (!Array.isArray(rawSplits)) {
    throw new DomainError('invalid-transaction', 'Stored transaction splits are invalid.');
  }
  const expectedSign = value.type === 'income' ? 1n : -1n;
  const unsignedSplits = rawSplits.map((rawSplit) => {
    if (!isRecord(rawSplit)) {
      throw new DomainError('invalid-transaction', 'Stored transaction split is invalid.');
    }
    assertExactKeys(rawSplit, ['category', 'amountMinor'], 'stored transaction split');
    const splitAmount = parseMinorUnits(readRequiredString(rawSplit, 'amountMinor'));
    if (splitAmount * expectedSign <= 0n) {
      throw new DomainError('invalid-transaction', 'Stored transaction split sign is invalid.');
    }
    return {
      category: readRequiredString(rawSplit, 'category'),
      amountMinor: (splitAmount < 0n ? -splitAmount : splitAmount).toString(),
    };
  });
  const normalized = normalizeTransactionDraft(
    {
      type: value.type,
      amountMinor: magnitude.toString(),
      date: readRequiredString(value, 'date'),
      splits: unsignedSplits,
      merchant: readRequiredString(value, 'merchant'),
      paymentMethod: readRequiredString(value, 'paymentMethod'),
      notes: readRequiredString(value, 'notes'),
    },
    precision,
  );
  if (normalized.amountMinor !== canonicalMinorUnits(signedAmount.toString())) {
    throw new DomainError('invalid-transaction', 'Stored transaction amount is inconsistent.');
  }
  for (const [index, split] of normalized.splits.entries()) {
    const rawSplit = rawSplits[index];
    if (!isRecord(rawSplit) || split.amountMinor !== canonicalMinorUnits(readRequiredString(rawSplit, 'amountMinor'))) {
      throw new DomainError('invalid-transaction', 'Stored transaction split is inconsistent.');
    }
  }
  const revision = readRequiredInteger(value, 'revision');
  if (revision < 1) {
    throw new DomainError('invalid-transaction', 'Stored transaction revision is invalid.');
  }
  const deletedAt = value.deletedAt;
  if (deletedAt !== null && typeof deletedAt !== 'string') {
    throw new DomainError('invalid-transaction', 'Stored transaction deletion time is invalid.');
  }
  return {
    ...normalized,
    id: decodeId(value.id, 'transaction id'),
    revision,
    createdAt: decodeStoredTimestamp(value.createdAt, 'transaction createdAt'),
    updatedAt: decodeStoredTimestamp(value.updatedAt, 'transaction updatedAt'),
    deletedAt: deletedAt === null ? null : decodeStoredTimestamp(deletedAt, 'transaction deletedAt'),
  };
}

export function decodeId(value: unknown, label = 'id'): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new DomainError('invalid-input', `${label} must be a non-empty string.`);
  }
  return value;
}

export function decodeTransactionUpdate(value: unknown): TransactionUpdateInput {
  if (!isRecord(value)) {
    throw new DomainError('invalid-input', 'Transaction update must be an object.');
  }
  const expectedRevision = decodeExpectedRevision(value.expectedRevision);
  return {
    id: decodeId(value.id, 'transaction id'),
    draft: decodeTransactionDraft(value.draft),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  };
}

export function decodeExpectedRevision(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new DomainError('invalid-input', 'Expected revision must be a positive safe integer.');
  }
  return value;
}

export function assertExpectedRevision(current: Transaction, value: unknown): void {
  const expected = decodeExpectedRevision(value);
  if (expected !== undefined && current.revision !== expected) {
    throw new DomainError('stale-revision', 'Transaction has changed since it was read.');
  }
}

export function decodeBudgetInput(value: unknown): BudgetInput {
  if (!isRecord(value)) {
    throw new DomainError('invalid-input', 'Budget update must be an object.');
  }
  const budget = value.budgetMinor;
  if (budget !== null && typeof budget !== 'string') {
    throw new DomainError('invalid-input', 'budgetMinor must be a string or null.');
  }
  return { month: decodeMonth(value.month), budgetMinor: budget };
}

export function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

export function isLocalMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const [yearText, monthText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  return year >= 1900 && year <= 9999 && month >= 1 && month <= 12;
}

export function decodeMonth(value: unknown): string {
  if (typeof value !== 'string' || !isLocalMonth(value)) {
    throw new DomainError('invalid-month', 'Month must use YYYY-MM.');
  }
  return value;
}

function canonicalInteger(value: string, code: DomainErrorCode = 'invalid-amount'): string {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new DomainError(code, 'Amount must be a whole-number minor-unit string.');
  }

  const negative = trimmed.startsWith('-');
  const digits = (negative ? trimmed.slice(1) : trimmed).replace(/^0+(?=\d)/, '');
  if (digits.length === 0) return '0';
  return negative && digits !== '0' ? `-${digits}` : digits;
}

export function parseMinorUnits(value: string): bigint {
  return BigInt(canonicalInteger(value));
}

export function canonicalMinorUnits(value: string): string {
  return canonicalInteger(value);
}

function parseUnsignedMinorUnits(value: string, allowZero: boolean): bigint {
  const normalized = canonicalInteger(value);
  if (normalized.startsWith('-')) {
    throw new DomainError('invalid-amount', 'Amount cannot be negative in an input field.');
  }
  const amount = BigInt(normalized);
  if (!allowZero && amount <= 0n) {
    throw new DomainError('invalid-amount', 'Amount must be greater than zero.');
  }
  return amount;
}

/** Convert a user-entered decimal major-unit amount without using floating point. */
export function decimalToMinorUnits(value: string, precision: number): string {
  validatePrecision(precision);
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new DomainError('invalid-amount', 'Enter a non-negative decimal amount.');
  }

  const [whole, fraction = ''] = trimmed.split('.');
  const extraFraction = fraction.slice(precision);
  if (extraFraction.length > 0 && /[^0]/.test(extraFraction)) {
    throw new DomainError(
      'invalid-amount',
      `This workspace supports at most ${precision} decimal places.`,
    );
  }

  const minorDigits = `${whole}${fraction.slice(0, precision).padEnd(precision, '0')}`;
  return canonicalInteger(minorDigits);
}

export function formatMinorUnits(value: string, precision: number): string {
  validatePrecision(precision);
  const amount = parseMinorUnits(value);
  const negative = amount < 0n;
  const digits = (negative ? -amount : amount).toString().padStart(precision + 1, '0');
  const whole = precision === 0 ? digits : digits.slice(0, -precision);
  const fraction = precision === 0 ? '' : digits.slice(-precision);
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${groupedWhole}${fraction ? `.${fraction}` : ''}`;
}

export function formatMinorMagnitude(value: string, precision: number): string {
  const amount = parseMinorUnits(value);
  return formatMinorUnits((amount < 0n ? -amount : amount).toString(), precision);
}

function validatePrecision(precision: number): void {
  if (!Number.isInteger(precision) || precision < 0 || precision > 4) {
    throw new DomainError('invalid-workspace', 'Precision must be an integer from 0 to 4.');
  }
}

function normalizeText(value: string, label: string, maxLength: number, required: boolean): string {
  const normalized = value.trim();
  if (required && normalized.length === 0) {
    throw new DomainError('invalid-input', `${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new DomainError('invalid-input', `${label} is too long.`);
  }
  return normalized;
}

export function normalizeWorkspaceSetup(input: WorkspaceSetupInput): WorkspaceSetupInput {
  const name = normalizeText(input.name, 'Workspace name', 80, true);
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new DomainError('invalid-workspace', 'Currency must be a three-letter code.');
  }
  validatePrecision(input.precision);

  const monthlyBudgetMinor =
    input.monthlyBudgetMinor === null
      ? null
      : parseUnsignedMinorUnits(input.monthlyBudgetMinor, true).toString();

  return { name, currency, precision: input.precision, monthlyBudgetMinor };
}

export function normalizeTransactionDraft(
  input: TransactionDraft,
  precision: number,
): Omit<Transaction, 'id' | 'revision' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  validatePrecision(precision);
  if (!isTransactionType(input.type)) {
    throw new DomainError('invalid-transaction', 'Transaction type must be income or expense.');
  }
  if (!isLocalDate(input.date)) {
    throw new DomainError('invalid-date', 'Date must be a valid local date in YYYY-MM-DD.');
  }

  const magnitude = parseUnsignedMinorUnits(input.amountMinor, false);
  if (input.splits.length < 1 || input.splits.length > 20) {
    throw new DomainError('invalid-transaction', 'A transaction needs between one and 20 splits.');
  }

  const splitMagnitudeTotal = input.splits.reduce((total, split) => {
    const category = normalizeText(split.category, 'Category', 120, true);
    if (category.length === 0) {
      throw new DomainError('invalid-transaction', 'Category is required.');
    }
    return total + parseUnsignedMinorUnits(split.amountMinor, false);
  }, 0n);

  if (splitMagnitudeTotal !== magnitude) {
    throw new DomainError('invalid-transaction', 'Category splits must add up exactly to the amount.');
  }

  const sign = input.type === 'income' ? 1n : -1n;
  const amountMinor = (magnitude * sign).toString();
  const splits = input.splits.map((split) => ({
    category: normalizeText(split.category, 'Category', 120, true),
    amountMinor: (parseUnsignedMinorUnits(split.amountMinor, false) * sign).toString(),
  }));

  return {
    type: input.type,
    amountMinor,
    date: input.date,
    splits,
    merchant: normalizeText(input.merchant ?? '', 'Merchant', 160, false),
    paymentMethod: normalizeText(input.paymentMethod ?? '', 'Payment method', 120, false),
    notes: normalizeText(input.notes ?? '', 'Notes', 2000, false),
  };
}

export function createTransaction(
  id: string,
  input: TransactionDraft,
  precision: number,
  now: string,
): Transaction {
  const normalized = normalizeTransactionDraft(input, precision);
  return {
    ...normalized,
    id: decodeId(id),
    revision: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function reviseTransaction(
  current: Transaction,
  input: TransactionDraft,
  precision: number,
  now: string,
): Transaction {
  if (current.deletedAt !== null) {
    throw new DomainError('invalid-transaction', 'A deleted transaction cannot be edited.');
  }
  return {
    ...current,
    ...normalizeTransactionDraft(input, precision),
    revision: current.revision + 1,
    updatedAt: now,
  };
}

export function tombstoneTransaction(current: Transaction, now: string): Transaction {
  if (current.deletedAt !== null) {
    throw new DomainError('invalid-transaction', 'Transaction is already deleted.');
  }
  return { ...current, revision: current.revision + 1, updatedAt: now, deletedAt: now };
}

export function calculateMonthlySummary(
  transactions: readonly Transaction[],
  month: string,
  budgetMinor: string | null,
): MonthlySummary {
  if (!isLocalMonth(month)) {
    throw new DomainError('invalid-month', 'Month must use YYYY-MM.');
  }
  const budget = budgetMinor === null ? null : parseUnsignedMinorUnits(budgetMinor, true);
  let totalIncome = 0n;
  let totalExpense = 0n;
  const categories = new Map<string, { income: bigint; expense: bigint }>();
  let transactionCount = 0;

  for (const transaction of transactions) {
    if (transaction.deletedAt !== null || !transaction.date.startsWith(`${month}-`)) continue;
    const amount = parseMinorUnits(transaction.amountMinor);
    transactionCount += 1;
    if (transaction.type === 'income') totalIncome += amount;
    else totalExpense += -amount;

    for (const split of transaction.splits) {
      const entry = categories.get(split.category) ?? { income: 0n, expense: 0n };
      const splitAmount = parseMinorUnits(split.amountMinor);
      if (transaction.type === 'income') entry.income += splitAmount;
      else entry.expense += -splitAmount;
      categories.set(split.category, entry);
    }
  }

  const categoryTotals = [...categories.entries()]
    .map(([category, totals]) => ({
      category,
      incomeMinor: totals.income.toString(),
      expenseMinor: totals.expense.toString(),
    }))
    .sort((left, right) => {
      const expenseDifference = parseMinorUnits(right.expenseMinor) - parseMinorUnits(left.expenseMinor);
      if (expenseDifference !== 0n) return expenseDifference > 0n ? 1 : -1;
      return left.category.localeCompare(right.category);
    });

  const budgetUsed = totalExpense;
  return {
    month,
    totalIncomeMinor: totalIncome.toString(),
    totalExpenseMinor: totalExpense.toString(),
    netFlowMinor: (totalIncome - totalExpense).toString(),
    budgetMinor: budget?.toString() ?? null,
    budgetUsedMinor: budgetUsed.toString(),
    budgetRemainingMinor: budget === null ? null : (budget - budgetUsed).toString(),
    transactionCount,
    categoryTotals,
  };
}

export function filterTransactions(
  transactions: readonly Transaction[],
  filters: TransactionFilters,
): readonly Transaction[] {
  if (!isLocalMonth(filters.month)) {
    throw new DomainError('invalid-month', 'Month must use YYYY-MM.');
  }
  const query = filters.query.trim().toLocaleLowerCase();
  const category = filters.category.trim().toLocaleLowerCase();

  return transactions.filter((transaction) => {
    if (transaction.deletedAt !== null || !transaction.date.startsWith(`${filters.month}-`)) {
      return false;
    }
    if (filters.type !== 'all' && transaction.type !== filters.type) return false;
    if (
      category.length > 0 &&
      !transaction.splits.some((split) => split.category.toLocaleLowerCase().includes(category))
    ) {
      return false;
    }
    if (query.length === 0) return true;
    const searchable = [
      transaction.merchant,
      transaction.paymentMethod,
      transaction.notes,
      ...transaction.splits.map((split) => split.category),
    ]
      .join(' ')
      .toLocaleLowerCase();
    return searchable.includes(query);
  });
}

export function previousMonth(month: string): string {
  if (!isLocalMonth(month)) throw new DomainError('invalid-month', 'Month must use YYYY-MM.');
  const [yearText, monthText] = month.split('-');
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 2, 1));
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
}

export function nextMonth(month: string): string {
  if (!isLocalMonth(month)) throw new DomainError('invalid-month', 'Month must use YYYY-MM.');
  const [yearText, monthText] = month.split('-');
  const date = new Date(Date.UTC(Number(yearText), Number(monthText), 1));
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
}

export function currentLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear().toString().padStart(4, '0')}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
}

export function currentLocalMonth(): string {
  return currentLocalDate().slice(0, 7);
}

/** Derive the calendar month in the current host timezone from an ISO timestamp. */
export function localMonthFromTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new DomainError('invalid-date', 'Timestamp must be a valid date and time.');
  }
  const month = `${timestamp.getFullYear().toString().padStart(4, '0')}-${(timestamp.getMonth() + 1).toString().padStart(2, '0')}`;
  if (!isLocalMonth(month)) {
    throw new DomainError('invalid-date', 'Timestamp must include a valid local month.');
  }
  return month;
}
