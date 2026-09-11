# Database Guidelines

> Executable persistence contracts for the Electron local checkpoint.

## Overview

`src/main/store.ts` is the only owner of the SQLite schema. It uses
`better-sqlite3` synchronously in the main process and implements the shared
`LocalStore` port. The renderer receives domain DTOs through preload/IPC and
must never see a database handle, SQL statement, file path, or row shape.

The database is created as `luna.sqlite` directly in the resolved active local
data directory. On Linux the default active directory is
`~/.config/luna`; a user-selected local directory can be active instead.
The adapter enables foreign keys and a five-second busy timeout; file-backed
databases use WAL. Amounts are stored as decimal strings representing integer
minor units, never JavaScript floating-point numbers.

The shared persistence contract is `LocalStore`, not a requirement that every
host expose identical physical tables. Electron's native adapter currently
uses normalized domain tables plus `ledger_graph`; Web and Android use the
same domain document, migration/version rules, compare-and-swap semantics, and
SQLite-backed `LocalStore` behavior in the SQLite-WASM/OPFS worker. The
`BrowserStateStore` adapter is test-only compatibility infrastructure and is
never selected by the production Web/Android host.

## Scenario: Local transaction persistence

### 1. Scope / Trigger

- Trigger: a feature changes the local SQLite schema, persistence operation, or
  data crossing the main/preload/renderer boundary.
- Scope: the local SQLite ledger. Portable-settings crypto/object storage is a
  separate main-process path and must not acknowledge or upload ledger pending
  operations.

### 2. Signatures

```typescript
interface LocalStore {
  getSnapshot(month: string): AppSnapshot;
  createWorkspace(input: WorkspaceSetupInput, id: string, now: string): Workspace;
  createTransaction(input: TransactionDraft, id: string, now: string): Transaction;
  updateTransaction(id: string, input: TransactionDraft, now: string): Transaction;
  deleteTransaction(id: string, now: string): Transaction;
  setMonthlyBudget(month: string, budgetMinor: string | null, expectedHeadIds?: string[]): void;
  close(): void;
}
```

The public renderer API is asynchronous, while the native adapter may remain
synchronous internally. The schema currently contains `workspace`,
`monthly_budgets`, `transactions`, `splits`, `revisions`, `tombstones`,
`pending_operations`, `conflicts`, and schema2 `ledger_graph`.
See ledger-sync-guidelines.md for the authoritative graph and v1 migration.

### 3. Contracts

- `month`: exact `YYYY-MM` string; dates are exact `YYYY-MM-DD` strings.
- `amountMinor` and split amounts: canonical integer strings. Input fields use
  non-negative decimal text and are converted exactly according to workspace
  precision before storage.
- A transaction has `type` (`income` or `expense`), one to twenty category
  splits whose sum equals the magnitude, and merchant/payment/notes strings.
- Create/update/delete each write the current transaction, a revision, and a
  pending operation in one database transaction. Delete additionally writes a
  tombstone and sets `deleted_at`.
- UI edits/deletes carry an expected revision; validate and read current state
  inside the same immediate write transaction. A mismatch is `stale-revision`
  and must not change rows, revision history, tombstones, or pending operations.
- Budget edits carry the observed `snapshot.budgetHeadIds` (including inherited
  month heads or an empty set). Compare inside the same write transaction;
  `ledger-stale-budget` rejects without changing history/projections.
- Snapshots exclude tombstones and conflicted transactions from active totals.
  Legacy `sync.remoteSyncEnabled`/pending rows are not the new session status;
  `getLedgerSyncStatus` owns actual encrypted ledger acknowledgement. Settings
  sync must never acknowledge ledger mutations.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Invalid month, date, amount, precision, currency, or split sum | `DomainError`; no write is committed |
| Transaction before workspace creation | `DomainError('invalid-workspace')` |
| Second workspace creation | `DomainError('already-configured')` |
| Missing or already deleted transaction | `DomainError('not-found')` or invalid-transaction error |
| Negative budget | `DomainError('invalid-amount')`; prior value remains |
| Database migration failure or unsupported newer schema | generic persistence error; do not expose SQL/path to renderer |

### 5. Good/Base/Bad Cases

- Good: store `"9007199254740993"` as text and return the identical string;
  use a short transaction for the row, split, revision, and pending operation.
- Base: store one income or expense with one split and read it after reopening
  a new `SQLiteLocalStore` against the same file.
- Bad: call `Number(amountMinor)`, write into the packaged app/resources
  directory, or update `transactions` without its revision/tombstone record.

### 6. Tests Required

- Domain tests assert exact decimal conversion, split equality, date/month
  validation, summary exclusion, and filters without importing SQLite/Electron.
- Store tests assert first/repeated migration, close/reopen recovery, values
  above `Number.MAX_SAFE_INTEGER`, rollback after invalid writes, budget
  inheritance/override, tombstone exclusion, and pending-operation counts.
- Packaged smoke asserts the made executable starts, uses isolated `userData`,
  saves through preload/IPC, closes, and reopens with both records intact.

### 7. Wrong vs Correct

#### Wrong

```typescript
database.prepare('UPDATE transactions SET amount_minor = ?').run(Number(input.amount));
```

#### Correct

```typescript
const transaction = reviseTransaction(current, input, workspace.precision, now);
database.transaction(() => {
  replaceTransaction(transaction);
  insertRevision(transaction, 'update');
  insertPendingOperation(transaction, 'update');
})();
```

## Query Patterns

- Use prepared statements with named parameters and explicit row interfaces.
- Keep writes short and grouped in `database.transaction(...)` when multiple
  tables must change together.
- Convert rows to shared domain objects in the adapter; do not leak SQLite
  `null`, column names, or native types through IPC.

## Migrations

Migration is an idempotent, transactional `CREATE TABLE IF NOT EXISTS` block
guarded by `PRAGMA user_version`. A database with a newer schema version is
rejected. Any migration error is wrapped without returning the database path
or SQL payload. Future schema changes must add a versioned migration and a
reopen/rollback test before changing the schema version.

## Naming Conventions

- Tables and columns use lowercase `snake_case`; TypeScript fields use
  `camelCase`.
- Primary identifiers are `id`; dates/times are named `local_date`,
  `created_at`, `updated_at`, and `deleted_at` at the SQL boundary.
- Indexes use `idx_<table>_<purpose>`, for example
  `idx_transactions_local_date`.

## Common Mistakes

- Do not add browser/OPFS, crypto, or object storage to this adapter;
  those concerns have separate modules. Financial graph/projection writes
  remain atomic here, including remote graph merge and conflict resolution.
- Do not use UTC date slicing for user-visible transaction dates; the renderer
  supplies a local calendar date and the domain validates its shape.
- Do not mark pending operations acknowledged without a sync protocol and a
  tested remote contract.
