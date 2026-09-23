# Task B validation — 2026-09-23

## Implementation and ownership

- `features/tools.tsx`, `ledger-tools-i18n.ts`: independent backup/sync/conflict titles and help; backup explicitly works without sign-in/network; initial restore and existing-ledger merge have distinct buttons/help/confirmation. Conflict queries expose loading, failure with retry, zero-success, and candidates separately. Unrelated sync queries no longer drive backup/conflict pages.
- `features/settings-navigation.ts`, `features/settings.tsx`, `i18n.ts`: dedicated card help; zero conflicts is a normal state rather than “0 unresolved conflicts”.
- `features/entry.tsx`, `features/setup.tsx`, `data/local.tsx`: reuse stable error-code extraction; identify the amount/category/date/name/budget/precision field, focus it, associate error using aria-describedby/aria-invalid, and clear only that field's outdated error. General mutation errors focus the alert and preserve input. Existing committed-write/refresh guard unchanged.
- Backup password validation reuses `validateLedgerPassword`; short, excessive encoded length, and unsupported-character presentation is separate. No crypto constraints/schema/protocol changed. Wrong-password failures associate/focus their password field after busy state clears. Input correction clears its old error. Password help avoids implementation jargon.
- `tests/e2e/ux-feedback.spec.ts` supplied independently by b_regressions; read and executed by implementer. `ledger-tools.spec.ts` extended with real offline unsigned-in image-bearing restore and two independent conflicts.

## Executed checks

1. `./hako npm run typecheck` — passed, including after final changes.
2. `./hako npm run test:web -- tests/e2e/ledger-tools.spec.ts tests/e2e/react-state.spec.ts tests/e2e/settings-interface.spec.ts tests/e2e/intuitive-ledger.spec.ts tests/e2e/config-sync.spec.ts tests/e2e/entry-form-polish.spec.ts --workers=4` — **84 passed**, no skips/failures.
3. `./hako npm run test:web -- tests/e2e/ux-feedback.spec.ts --workers=4` — **16 passed**, no skips/failures. English/Chinese × desktop/narrow cover name, amount, category, date, short password, oversized multibyte password, error clearing/focus/ARIA, conflict loading/failure/retry/zero.
4. `./hako npm run test:web -- tests/e2e/ledger-tools.spec.ts --workers=4` after extending offline/multiple-conflict cases — **8 passed**, no skips/failures. Real encrypted graph flows verify zero/one/two conflict transitions and preserve remaining unresolved candidates.
5. `git diff --check` — passed.

## Acceptance mapping

- B01: actual unsigned-in export and fresh restore while contexts are offline; image decodes after reload; distinct restore/merge copy and confirmation remain.
- B02: new controlled read failures/loading recover via real Retry UI; no zero-state shown during pending/failure. Existing real conflict test plus new two-conflict test verify one/multiple/zero candidates.
- B03: bilingual new tests assert focused correct field, aria-invalid and aria-describedby, draft retention, and clearing after correction. Short and encoded-length limit password cases both covered.
- B04: `react-state` committed-write refresh failure and `ledger-tools` stale edit tests pass; `config-sync` wrong-password and permission rejection preserves local settings/ciphertext/financial draft. Existing revision tokens, useLocalWrite and host behavior remain unchanged.

## Remaining centralized gates

Shared unit tests, final build and full production Playwright are owned by coordinator after C/D. No native-host, physical mobile keyboard, or assistive-technology claim. Final screenshot review is centralized. Initial restoration retains the established backup route; the restored original ledger is reachable through the brand navigation and verified by the restoration test.
