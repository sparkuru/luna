# Task C validation — 2026-09-23

## Delivered behavior

- Web small settings pages expose a Settings return button plus `#settings-section-switcher`, using the existing settings catalog. The full grouped nav remains on desktop; current-page semantics and original paths remain. Preferences has its own heading.
- Bottom navigation stretches three targets to equal widths, at least 44×44. Removed a stale ID-specific fourth-column rule that otherwise defeated the three-column grid.
- Web statistics has a labelled native `#statistics-bucket-select` and 44px previous/next controls. All buckets, including future dates, remain selectable; the chart and text-equivalent detail list use the same selection. Average help explains elapsed-period denominator; no statistics calculation changed.
- Setup says ledger/device, provides a name example, marks budget optional, and defaults precision by currency (JPY 0, others 2). `#setup-advanced` retains custom precision and opens if its hidden value is invalid. Currency changes disclose/reset precision and clear an obsolete precision error.
- Account sign-in precedes connection UI. Technical/session help, sync steps and local-copy management are disclosures. Local profiles remain usable offline. Login device label is optional with existing Luna fallback. Account/ledger/unlock/settings secret fields offer accessible show/hide; reveal resets on server action/account/profile transitions. Explicit data-secret selection clears revealed inputs as well as password inputs, retaining the existing secret lifetime.

## Tests actually run

- Typecheck passed before focused tests and again after all final code/test changes.
- Existing focused settings-interface/accessibility/intuitive-ledger/server-account/workspace-setup-visual-polish: **34 passed**, no skips/failures.
- New bilingual ux-mobile-navigation plus extended server-account: **14 passed, 4 failed**. All four failures were equal-width navigation assertions; investigation found the stale `#open-secondary-menu { grid-column: 4 }` overriding the intended three-column grid. Fixed that original rule to column 3 with full width.
- Final targeted ux-mobile-navigation/workspace-setup-visual-polish/intuitive-ledger selection (`mobile preferences|precision|375px home`): **12 passed**, no skips/failures. Rechecks all failed English/Chinese desktop/narrow navigation cases, plus hidden invalid precision reopening/custom precision persistence and original home first-screen contract.
- The successful portions of the 18-case run cover every day via large date controls, bilingual setup defaults, real synthetic-account login with revealed-secret clearing/logout reset, and real ledger connect → disconnect → revealed password unlock → encrypted restore/offline profiles.
- `git diff --check` passed.

## Acceptance evidence

- C01: real bounding boxes assert language/privacy at 375×800, heading/language at 320×568 (English and Chinese); no scrolling used to manufacture the first-screen result.
- C02: keyboard Enter toggles section disclosure under reduced motion, actual section navigation/back retains URL, current item, desktop grouped nav. Existing accessibility suite passed.
- C03: all 28–31 monthly options exercised; previous/next end bounds and 44px geometry asserted; text details retain one control per day. Bottom nav equal widths/target dimensions now pass.
- C04: defaults, JPY persistence, optional budget, custom three-digit precision, and invalid hidden precision recovery all exercised. Existing name-only setup tests pass.
- C05: true local synthetic server tests cover login/connect/unlock and offline local copy recovery. Password values clear even while revealed, logout returns hidden blank login controls. No session protocol or secret persistence was changed.

## Residual boundaries

Final full production suite, unit tests/build and screenshot review are centralized after D. Physical device soft keyboards, real browser zoom and assistive technology were not simulated. Native hosts retain their existing navigation layout; real native windows not retested here.
