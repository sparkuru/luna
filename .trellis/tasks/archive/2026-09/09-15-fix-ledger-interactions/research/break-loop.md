# Bug Analysis: 月份切换闪烁仍然复现

### 1. Root Cause Category

- **Category**: C/D — Change propagation failure and test coverage gap.
- **Specific Cause**: Previous work isolated the route-selected snapshot from
  the previous month's financial data, but the shell still replaced the full
  ready ledger with a small standalone `LedgerMonthLoading` panel. That branch
  changed the hero, summary, and transaction-panel geometry, and its animated
  shimmer added another visible change. The data-safety fix therefore did not
  cover the presentation path shown in the recording.
- **Evidence**: `src/renderer/app/shell.tsx` switches from `LedgerHome` to
  `LedgerMonthLoading` while `snapshotReady` is false; the recorded transition
  shows both a blank/layout jump and a later loading panel. The new delayed
  `getSnapshot` browser test observes the actual branch and verifies its major
  regions keep their positions while old-month sentinels remain absent.

### 2. Why Fixes Failed

1. The earlier loading/isolation fix addressed cached snapshot reuse, but did
   not make the loading branch structurally compatible with the ready page.
2. The earlier visual check did not hold a real host read open long enough to
   assert the intermediate DOM and geometry, so the remaining branch-specific
   flash was not covered.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Keep the month loading branch in the same hero, controls, summary, and transaction-panel frame; render no previous financial values. | DONE |
| P0 | Test coverage | Delay the real `getSnapshot` call and assert old-data isolation plus stable major-region positions before releasing it. | DONE |
| P1 | Styling contract | Use static loading placeholders for this transition; do not add a shimmer animation to a layout-flash fix. | DONE |
| P1 | Cross-platform review | Check Web CTA placement and narrow fixed-navigation geometry separately from native entry shortcuts. | DONE |

### 4. Systematic Expansion

- **Similar Issues**: Other `!snapshotReady` branches and route-specific
  loading panels should be checked for geometry changes; a privacy-safe empty
  snapshot can still cause a visual regression if its frame differs.
- **Design Improvement**: Treat cached-data isolation and loading-frame
  stability as two separate acceptance criteria in frontend tasks.
- **Process Improvement**: Add an intermediate-state browser test whenever a
  route change intentionally blocks a host read, instead of testing only the
  final loaded month.

### 5. Knowledge Capture

- [x] Updated `frontend/component-guidelines.md` with the stable Web loading
  frame, static-placeholder, CTA-order, and date-initialization contracts.
- [x] Updated `guides/cross-platform-thinking-guide.md` with the async
  page-transition checklist.
- [x] Added delayed-loading, geometry, isolation, and date regression tests.
- [x] Checked for the documented `src/templates/markdown/spec` mirror; this
  repository has no such directory, so there is no template copy to sync.
