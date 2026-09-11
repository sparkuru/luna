# Bug Analysis: Nested dialog focus restoration

## 1. Root Cause Category

- **Category**: B (cross-layer contract), E (implicit ordering assumption), D
  (isolated checks missed an intermittent integration failure).
- **Specific cause**: the installed Radix FocusScope dispatches its unmount
  autofocus event before removing the closing scope from its stack. Source
  evidence: node_modules/@radix-ui/react-focus-scope/dist/index.mjs:94–103.
  Immediately focusing the parent trigger inside that callback assumes the
  parent scope has already resumed; the source ordering contradicts this.

## 2. Why Fixes Failed

1. Explicit React Escape handling addressed a separate early-listener timing
   issue where the category dialog remained open. It did not control focus
   stack teardown after a successful close.
2. Direct focus in onCloseAutoFocus could pass focused and full runs but still
   race the scope lifecycle. Repeating a passing test alone did not establish
   the required ordering.
3. The final callback prevents default then queues parent-trigger focus in a
   microtask. Radix removes the closing scope synchronously after the callback;
   that finishes before the queued microtask runs. This is tied to inspected
   library behavior, not an arbitrary timeout.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Runtime ordering | Restore nested parent focus after scope cleanup | Implemented by UI agent |
| P0 | Regression | Test Escape and category-selection focus under real CSP, both viewport sizes | Existing Escape test; selection assertion requested |
| P1 | Documentation | Record library ordering and preserve the source comment | Spec updated |
| P1 | Integration | Full production regression after the fix; retain failure artifacts | Running; final evidence tracked separately |

## 4. Systematic Expansion

- Review nested close, selection, rapid back and modal remount paths together.
- Preserve form instances independently of modal focus scopes; unmounting a
  form to solve focus can silently discard a financial draft.
- On Radix upgrade re-check the installed scope lifecycle and rerun keyboard,
  native-back and focus-return behavior. Browser layout/DOM visibility alone
  does not prove focus ownership or accessibility.

## 5. Knowledge Capture

- Updated frontend/component-guidelines.md with the executable focus contract.
- Kept analysis and test status in task research. This repository has no
  src/templates/markdown/spec template mirror to synchronize.
- No commit: the approved parent implementation plan explicitly keeps this
  round uncommitted until the final review; the skill's generic commit step
  does not override that scope.
