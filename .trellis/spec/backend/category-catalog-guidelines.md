# Category Catalog and Ledger v3 Guidelines

The transaction `category` field is a stable workspace-local category ID, not a
user-entered label. The catalog is part of the encrypted causal ledger graph so
rename, enable/disable, deletion tombstones, sync, backup, native SQLite and
Web state all observe the same definitions. The renderer receives only the
safe `AppSnapshot` projection and uses the typed category API.

## Scenario: managed categories and safe reassignment

### 1. Scope / Trigger

- Trigger: adding or changing category settings, transaction category
  validation, category usage/delete flows, or ledger graph schema.
- Scope: shared decoders, native/Web hosts, preload/API, sync/backup and
  renderer settings/entry surfaces.
- The current graph contract is schema v3. v1/v2 local development data is
  handled by the explicit fresh-reset path; it is not guessed into new names.

### 2. Signatures

```typescript
interface CategoryDefinition {
  id: string; type: 'income' | 'expense'; name: string;
  enabled: boolean; position: number; deletedAt: string | null;
}

interface LocalStore {
  createCategory(input: CategoryCreateInput, expectedHeadIds?: string[]): CategoryDefinition;
  updateCategory(id: string, input: CategoryUpdateInput, expectedHeadIds?: string[]): CategoryDefinition;
  deleteCategory(id: string, expectedHeadIds?: string[]): void;
  getCategoryUsage(id: string): CategoryUsage[];
  reassignCategory(input: CategoryReassignmentInput): void;
}
```

`LunaLedgerApi` exposes the same operations asynchronously. A v3 graph has
one `category-catalog` revision for the workspace, with `CategoryCatalog` as
its value. `categoryHeadIds(document)` is the complete optimistic-lock token.
Transactions keep category IDs in their splits; renaming a definition never
rewrites transaction history.

### 3. Contracts

- `AppSnapshot.categories` contains the validated, conflict-free safe catalog;
  `categoryHeadIds` contains all current catalog heads. A category conflict
  suppresses category writes until explicitly resolved.
- Names are trimmed, non-empty, at most 120 characters, and unique among
  non-deleted categories of the same transaction type. IDs are stable and
  opaque after creation. A deleted definition is disabled and remains as a
  tombstone in graph history.
- New transactions must reference an existing, enabled, non-deleted category
  whose type matches the transaction. Editing an existing transaction may
  retain its disabled category so history remains readable; unknown or
  cross-type references are always rejected.
- New workspaces seed the default catalog using the settings locale at
  creation time. Changing locale later does not rename existing definitions.
- `deleteCategory` rechecks active effective transaction usage in the same
  write boundary. It never silently replaces references. The UI obtains the
  usage list, then offers one-by-one, selected, or all-selected replacement.
- `reassignCategory` requires a same-type enabled target, the current catalog
  heads, every selected transaction's expected revision, and a non-empty
  unique selection. All transaction revisions and pending graph operations
  commit atomically; source/target splits are merged without changing the
  transaction total.
- Native and Web v1/v2 local ledgers reset old transactions, splits, revisions,
  tombstones, pending operations, conflicts and attachments when the new v3
  catalog is initialized. Existing monthly budget values are retained. A
  legacy source byte is preserved until its host's normal successful migration
  boundary.
- Backup/crypto/remote version handling accepts v3 while retaining explicit
  v1/v2 decoder compatibility. No category label is taken from a remote
  renderer payload or free-text transaction form.

### 4. Validation & Error Matrix

| Condition | Result and preserved state |
|---|---|
| malformed catalog/name/type/ID/duplicate active name | `invalid-input`; graph unchanged |
| new transaction has unknown, disabled, deleted, or cross-type category | `invalid-category`; transaction unchanged |
| category catalog has multiple heads | `category-conflict`; category write unchanged |
| supplied catalog heads differ from current heads | `category-stale`; no catalog or transaction write |
| delete finds active references | `category-in-use`; no tombstone, usage list remains queryable |
| reassignment target is disabled, deleted, different type, or same source | `invalid-category`; every selected transaction unchanged |
| selected transaction revision/head is stale or missing | `stale-revision`/`category-stale`; batch rolls back completely |
| v1/v2 local graph is opened during development reset | fresh v3 catalog and empty transaction history; budgets preserved |

### 5. Good/Base/Bad Cases

- Good: store `expense:0`, rename its label from “Food” to “Groceries”, and
  display “Groceries” everywhere through the current catalog map while the
  transaction revision keeps the same ID.
- Base: select three usage rows, provide `categoryHeadIds` and three expected
  revisions, then commit all replacements in one host transaction before
  retrying deletion.
- Bad: save `"Food"` as a transaction category, accept a disabled category for
  a new record, or delete a referenced category and repair rows afterward.

### 6. Tests Required

- Shared graph tests assert v3 seed/projection, category-head merge/conflict,
  catalog validation, tombstones, ID stability, and v1/v2 fresh-reset shape.
- Native/Web host tests assert locale-aware seeding, type/enabled checks,
  rename/disable/delete, usage lookup, batch reassignment, source/target
  merging, stale rollback and backup/sync round trips.
- Renderer Playwright asserts search/scroll category selection, no free-text
  bypass, settings CRUD, usage dialog select-all and per-row replacement, safe
  delete retry, and label propagation to list/statistics/detail/filter views.
- Every category write test must assert both the committed snapshot and the
  unchanged graph/revision state after an expected validation or stale failure.

### 7. Wrong vs Correct

#### Wrong

```typescript
// A label is mutable and cannot safely identify a historical split.
split.category = categoryNameInput;
await deleteCategory(categoryId);
```

#### Correct

```typescript
const usage = await getCategoryUsage(sourceId);
await reassignCategory({
  sourceCategoryId: sourceId,
  targetCategoryId: targetId,
  transactionIds: usage.map((row) => row.transactionId),
  expectedRevisions: Object.fromEntries(usage.map((row) => [row.transactionId, row.revision])),
  expectedHeadIds: snapshot.categoryHeadIds,
});
await deleteCategory(sourceId, snapshot.categoryHeadIds);
```

The UI must refresh the snapshot after each successful mutation and preserve
the selection/draft on a stale or failed mutation.

## Related UI rule

The entry dialog uses a readonly category field and a searchable, scrollable
same-type picker. Settings owns catalog CRUD and usage repair. The calculator
may display an additional repeating-decimal digit (for example `3.333(3)`),
but the submitted amount remains the exact integer minor-unit value rounded by
workspace precision.
