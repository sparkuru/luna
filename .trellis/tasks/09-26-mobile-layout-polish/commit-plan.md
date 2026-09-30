# Prepared commit plan

Not executed. The groups below are candidate layout commits, not a final stageable
plan. The 09-26 parent records 21 pre-existing dirty paths, and its saved baseline
patch is now absent. Several paths below overlap those inherited diffs, so whole-file
staging is unsafe; first recover/rebuild the baseline and review exact hunks. The
mobile redesign child changes are not fully represented by this layout-only plan.
Do not archive before the product work is committed, and do not include unrelated
active task directories or generated artifacts.

1. `fix(sync): resume remote probes after profile transitions`

   - `src/sync/server-host.ts`
   - `tests/server-sync/remote-probe.test.ts`
   - `tests/server-sync/profiles.test.ts`
   - `tests/server-sync/transitions.test.ts`
   - `.trellis/spec/backend/ledger-sync-guidelines.md`

   Completion body: Restore the existing five-second probe after the last
   account/profile transition, preserve manual/disposed behavior, and prove
   automatic upload/pull without renderer actions. Dispose all fixture hosts.
   Validation: final214 unit cases and complete server-sync9 cases; browser
   connectivity/controlled foreground2 cases in the next UI commit.

2. `fix(ui): simplify mobile entry and quiet sync status`

   - `src/renderer/app/shell.tsx`
   - `src/renderer/features/entry.tsx`
   - `src/renderer/features/ledger.tsx`
   - `src/renderer/features/settings.tsx`
   - `src/renderer/i18n.ts`
   - `src/renderer/styles.css`
   - `src/web/index.html`
   - `src/web/main.ts`
   - `tests/e2e/android-entry-layout.spec.ts`
   - `tests/e2e/intuitive-ledger.spec.ts`
   - `tests/e2e/offline-and-storage.spec.ts`
   - `tests/e2e/router-offline.spec.ts`
   - `tests/e2e/ux-mobile-navigation.spec.ts`
   - `tests/e2e/server-account.spec.ts`
   - `scripts/smoke-android.ts`
   - `scripts/android-image-picker-smoke.ts`
   - `scripts/android-backup-smoke.ts`
   - `.trellis/spec/frontend/android-runtime.md`
   - `.trellis/spec/frontend/component-guidelines.md`
   - `.trellis/tasks/09-26-mobile-layout-polish/` (ordinary task artifacts only)

   Completion body: Compact Android header/summary and move core inputs above
   the single app keypad; prevent amount IME duplication while preserving text
   input, drafts and image staging guard. Put authoritative sync state in
   Settings, remove demo-like home/ready copy, preserve offline failure states.
   Validation: typecheck,80 unique focused cases with explicit HMR rerun,
   production offline12, connectivity/controlled foreground2, final Web and
   signed/hashed APK builds, exact phone IME/BACK/draft/save/restart readback,
   and current-source Android 16 isolated AVD smoke19 checks.
   The current Electron source was packaged and made as Linux x64 ZIP on the
   supplied x86 host. ZIP integrity passed; smoke from the extracted final
   archive exited0 under the default sandbox and retained the expected UI form,
   settings and pending operations. One `window-missing` IPC rejection occurs
   during the smoke's intentional window teardown and is explained in validation.
   Retain the user's human visual-review outcome.

Both are substantial Codex contributions; include
`Co-authored-by: OpenAI Codex <codex@openai.com>` in each work commit after review.

3. `fix(desktop): bound unavailable OS secure-storage probes`

   - `src/main/secret-store.ts`
   - `src/main/secret-store.test.ts`

   Completion body: Return `session-only` when the Linux backend is `basic_text`,
   and bound/cache an OS availability probe that otherwise may never resolve.
   Never persist credentials in plaintext when OS encryption is unavailable.
   Validation: 214 unit tests, typecheck, default-sandbox smoke from the final
   Linux ZIP.

4. `test(electron): exercise the active entry flow in packaged smoke`

   - `src/main.ts`
   - `src/main/ipc.ts`

   Completion body: Drive the enabled record action and income entry from the
   packaged renderer, then report only fixed failure stages and trust-rejection
   reason codes. These files were clean at this task's start; no inherited hunk
   is included. Validation: packaged Linux x64 ZIP `make`, `unzip -t`, and final
   extracted-artifact smoke. The smoke's `window-missing` status rejection is
   the expected stale request after its deliberate window teardown.

5. `test(ui): cover zoom-equivalent accessibility viewport`

   - `tests/e2e/accessibility.spec.ts`

   Completion body: Add a 457×999 CSS viewport at DPR 2 to cover the responsive
   layout and keyboard paths seen at the effective viewport of 200% zoom.
   Validation: accessibility suite in Chrome and chrome-narrow, 4/4 passed;
   typecheck passed. Actual Chrome 200% browser zoom was subsequently operated
   and visually checked on 2026-09-30; five key routes had no horizontal
   overflow. Evidence is in the [UI redesign validation](../09-12-luna-ui-redesign/validation.md#2026-09-30-实际-chrome-200-浏览器缩放).

Current gates: `human-required` phone density/touch-comfort feedback and
reconstruction/review of the mixed mobile hunks described in the parent
`change-scope.md`. A separate Android 11 landscape smoke passed on
2026-09-30, but it does not replace the target phone portrait judgment. The
final Linux x64 ZIP hash is
`1af59d1c4a282213f1d0084d20d8d8d56e93481a0a24a0082dabf924edae13b4`.
Commit approval is not inferred from task or device-testing authorization.

This file does not contain the complete commit plan for the parent mobile
redesign and its three child tasks. No code is staged or committed. Before
requesting the workflow's one-shot approval, reconcile the candidate paths with
the parent `change-scope.md` and exclude any inherited or unrecognized hunks.
