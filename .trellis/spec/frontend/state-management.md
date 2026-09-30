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

## Transaction Entry Drafts

`TransactionDialog` owns the editable `TransactionDraft`; closing it with BACK
retains the draft for the next open. Changing income/expense type updates that
draft in place. If its selected category is invalid for the requested type,
ask for confirmation: cancel leaves the draft unchanged; accept changes only
`type` and clears `category`, preserving amount, date, merchant, payment method,
notes, and staged attachments. Do not treat a type change as a new transaction
or clear fields that apply to both types.

The regression must assert both outcomes: confirmation cancel retains type and
category, while acceptance selects the requested type, clears the incompatible
category, and preserves the amount.

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

`BudgetEditor` receives the shell month setter. Web uses `WebMonthPicker`;
mobile uses labelled `#month-picker[type=month]` and `#previous-month` /
`#next-month` in the budget page. Electron keeps its existing shell month input.
The Router selected month remains the single source of truth. Month changes
pass through the existing dirty-form blocker: cancellation leaves both month
and value untouched, confirmation enters a newly keyed month draft. Disable
month controls while a budget write is pending. Background snapshots must not
replace the draft's originally captured `budgetHeadIds`; a stale save still
rejects and preserves the input. Opening a new mobile edit observes the budget
currently displayed; refreshes during that edit must not replace its heads.
An unset budget shows actual spending and the setup action without progress;
blank input still removes the selected month's budget.

Every failed save requests input focus after pending releases, including
consecutive synchronous validation failures with identical messages. Use a new
error request object (for example `{ message }`) for each failure; clearing and
resetting the same string in one event can be batched into no state change.
Do not depend on snapshot changes for this effect: an unrelated refresh must
not steal focus from the month control. Verify repeated validation and a stale
head rejection after a real background refresh in both locales.

## Category Usage Drafts

A usage dialog owns the selected category, a read-request generation, observed
catalog heads, and the transaction revisions returned in its usage rows.
Closing or unmounting invalidates the generation. A late successful or failed
`getCategoryUsage(id)` response must not change another category's rows,
loading state or error. BACK while loading closes only this dialog; a new
category may be opened immediately without inheriting the old request.

Background snapshots must not upgrade the dialog's observed catalog heads or
selected transaction revisions. Reassignment supplies those tokens and keeps
selection/drafts after a stale rejection. After a successful write and explicit
snapshot refresh, observe the fresh query-cache heads before further usage
operations; do not read the prior render's AppContext snapshot for that step.
Verify a late read/error, close/reopen, catalog-head stale and transaction-
revision stale, with the encrypted graph unchanged after rejection.

Direct View usage has not confirmed deletion and must confirm a later delete.
The existing protected-delete flow already confirms before entering usage;
remember that entry intent so its final delete does not ask the same question
twice. Both flows name the category and preserve it when confirmation cancels.

## Common Mistakes

- Do not duplicate totals in a mutable renderer variable.
- Do not clear the live status during the render that follows a successful
  mutation; announce afterward.
- Do not treat pending local operations as synced merely because they are in
  SQLite.
