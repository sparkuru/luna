# Validation

## Automated checks

- `./hako npm run typecheck` — passed.
- `./hako npm test` — passed, 214/214 unit tests.
- `./hako npm run test:web -- tests/e2e/android-entry-layout.spec.ts tests/e2e/intuitive-ledger.spec.ts` — passed, 44/44. Covers native-surface and narrow-Web date projection visibility/order, ISO value and save behavior, localized icon-only close action and draft retention, desktop Web date surface, selected-month empty state, filtered-empty state and page-level record action.
- `./hako npm run test:web -- tests/e2e/narrow-web-statistics-gutter.spec.ts` — passed, 4/4 across English/Chinese and Chrome/narrow Chrome projects. Asserts aligned 24px viewport gutters and no horizontal overflow at 320/375/457px.
- `./hako npm run test:web -- tests/e2e/entry-form-polish.spec.ts` — passed, 16/16. The date-field regression checks whole-surface `showPicker()` activation and saved ISO values.
- `./hako npm run web:build` — passed.
- `docker compose -f compose.android.yaml run --build --rm android-apk` — passed; rebuilt the isolated debug APK used by the focused smoke.
- `docker compose -f compose.android.yaml --profile smoke run --build --rm -e LUNA_ANDROID_DATE_PICKER_ONLY=true android-smoke` — passed on the disposable Android 36 `luna-smoke` AVD. Opened the system date dialog, selected `2026-09-29`, checked input ISO value and projection text, saved the record, force-stopped the app, and verified the saved ISO date after restart. The smoke also asserted `data-client-surface="mobile"`, projection `display: flex`, projection z-index `2` above input z-index `1`, and non-zero projection geometry.
- `python3 .trellis/scripts/task.py validate .trellis/tasks/09-28-entry-date-close-empty-month` — passed; both context manifests are valid. It reports that `component-guidelines.md` exceeds the context injection size limit.
- `git diff --check` — passed.
- No lint script is configured.

## Visual review

Reviewed the 457px Chinese narrow-Web entry screenshot: the date reads `2026/09/28`, the calendar affordance remains visible, and the 48×48 X button is vertically centered with the title. The real AVD compositor screenshot after native picker selection shows `2026/09/29`; it was captured from the rebuilt APK and reviewed separately from DOM assertions.

Reviewed the 457px Chinese narrow-Web statistics screenshot. The heading, period/filter controls and cards share at least 24px left/right viewport gutters. Automated assertions cover all three target widths in both locales.

- `captures/narrow-web-entry-date-and-close-zh-CN.png`
- `captures/narrow-web-statistics-zh-CN.png`
- `artifacts/android/android-entry-date-projection.png`

## Platform coverage note

The Android picker and persistence path was exercised on the disposable Android 36 AVD. No physical handset was used. Browser `showPicker()` tests remain a separate check for browser activation wiring; the AVD smoke proves the actual system dialog path.

The focused date-only Android smoke passes. A broader Android smoke run continued beyond this date check but later stopped in its existing settings-navigation coverage: it expects a direct `Preferences` button in `.settings-navigation`, which the current mobile settings surface no longer exposes. That unrelated failure is recorded without treating it as date-picker coverage.
