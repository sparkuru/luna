# State Management

> State ownership and refresh rules for the offline ledger UI.

## Overview

The renderer uses TanStack Query for host-derived snapshots/settings and React
state for drafts, filters, modal state and per-summary visibility. TanStack
Router owns validated month/type and menu paths. Query is a discardable cache;
the committed SQLite graph remains authoritative. Free-text filters,
transaction identifiers and credentials never enter route search parameters.

## State Categories

- **Source-of-truth state**: `AppSnapshot` returned by the typed host API; in
  Electron it comes from native SQLite, Web state comes from SQLite-WASM/OPFS,
  and Android uses SQLite-WASM/OPFS or its explicit IndexedDB compatibility
  store when the embedded WebView lacks OPFS. It contains workspace, active transactions, summary, and
  observed budget heads and legacy local pending status. The ledger tools panel
  obtains actual encrypted sync status through `getLedgerSyncStatus`.
- **View state**: selected month, type/query/category filters, and the editing
  transaction ID; per-summary amount visibility is initialized from the
  persisted default on start and is not persisted itself.
  `editingBaseRevision` and `budgetDraftHeadIds` retain the version actually
  observed by the user; a background refresh must not upgrade these tokens.
- **Form state**: feature-local React state or persistent form controls while
  typing, with the originally observed revision/heads captured separately.
- **Derived state**: totals and category breakdowns come from the snapshot's
  summary, not a second renderer calculation.

## When to Use Global State

Use the existing QueryClient and AppContext rather than a second global
financial store. Local queries and mutations use networkMode: always and
retry: false so offline persistence never waits for internet connectivity.

## Server State

SQLite is local application state, accessed through `window.lunaLedger`. Reads
are explicit and month-scoped. Every create/update/delete/budget action waits
for the API, fetches a fresh snapshot, renders it, and then announces success.
Failed mutations leave the prior snapshot and user input available. If the
write committed but refresh failed, close the successfully saved draft and
announce the distinct saved-refresh-failed state; never replay the write.
Config
sync requires its local master switch and explicit session connection. Ledger
sync requires a separate explicit connection and may retry on return online.
Either sync must preserve financial form controls and original edit tokens;
remote state is committed through host adapters, never owned by the renderer.

## Budget Month Navigation

Web `BudgetEditor` receives the shell month setter and uses `WebMonthPicker`;
the Router selected month remains the single source of truth. Month changes
pass through the existing dirty-form blocker: cancellation leaves both month
and value untouched, confirmation enters a newly keyed month draft. Disable
month controls while a budget write is pending. Background snapshots must not
replace the draft's originally captured `budgetHeadIds`; a stale save still
rejects and preserves the input. Keep the native month-control path unchanged.

## Common Mistakes

- Do not duplicate totals in a mutable renderer variable.
- Do not clear the live status during the render that follows a successful
  mutation; announce afterward.
- Do not treat pending local operations as synced merely because they are in
  SQLite.
