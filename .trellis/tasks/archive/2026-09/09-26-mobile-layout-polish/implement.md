# Execution plan

## Planning gate

- [x] User consent to task creation.
- [x] Inspect clean worktree, frontend/platform specs and existing mobile regressions.
- [x] Read-only source research plus user-authorized phone diagnostics; record existing APK baseline.
- [x] Write PRD/design/execution plan and curate implement/check context.
- [x] Final summary presented; subsequent user approval: “继续现有技术栈吧；同意刚才你的 task 简报” (2026-09-26).

## Implementation

1. Activate the approved task. Dispatch Trellis implement agent with active task path, bounded ownership and context pull fallback. Main agent owns phone testing and task/spec records; agents are not alone and must preserve others' edits.
2. Target `src/renderer/app/shell.tsx`, `src/renderer/features/entry.tsx`, `src/renderer/styles.css`: compact mobile topbar; core inputs before calculator; one calculator; amount-specific mobile IME suppression; reachable save action. Extend presentation scope to `src/renderer/features/ledger.tsx`, locale catalogs, `src/web/main.ts` and `src/web/index.html` as needed for quiet primary-page copy and absence of a happy-path footer. Keep sync status/recovery under the existing settings module; preserve host automatic scheduling and saved manual mode. Add focused regressions in `tests/e2e/android-entry-layout.spec.ts`, mobile navigation, and production offline tests; use existing synthetic server-sync fixtures to demonstrate automatic scheduling does not depend on settings UI. Read compose-with-llm before editing product wording. Do not change protocols or add native background services.
3. Run `./hako npm run typecheck`, focused `./hako npm run test:web -- tests/e2e/android-entry-layout.spec.ts tests/e2e/entry-form-polish.spec.ts tests/e2e/ux-entry-summary.spec.ts tests/e2e/ux-mobile-navigation.spec.ts`, and `./hako npm run web:build`. Run production offline checks using `LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/offline-and-storage.spec.ts tests/e2e/router-offline.spec.ts` through hako, plus existing relevant automatic-sync regression. Inspect diagnostics and final screenshot geometry. Broaden tests only if failures or shared changes justify it.
4. Build/export with `LUNA_ANDROID_APPLICATION_SUFFIX=.lan docker compose -f compose.android.yaml build android-apk` then the corresponding `run --rm android-apk`; verify sidecar hash. Install-r only into `majo.im.luna.lan` on the exact user target; never clear/uninstall or run the emulator smoke on this physical device.
5. Main agent uses ADB/Playwright Android or CDP noDefaults to check synthetic ledger header without sync decorations/demo footer, two records, settings→sync state/recovery reachability, privacy, category picker, arithmetic input/save, real IME on notes, native BACK, draft reopen and restart readback. Capture screenshots via Android surface, not transient WebView compositor. Phone data stays local/synthetic; actual auto-sync scheduling proof uses synthetic fixtures, not real accounts.
6. Dispatch Trellis check with approved artifacts and real check results. Fix reproducible findings, re-run only impacted checks, then `git diff --check` and path review.
7. Update durable mobile spec only from verified contracts; record validation and pending subjective/user review. Respect project submit-ready gate and existing commit authorization; do not auto-archive unrelated tasks.

## Execution outcome

- [x] Approved implementation, independent Trellis check and fixes.
- [x] Final typecheck,214 unit cases, focused80-case coverage with explicit HMR rerun evidence, production offline12 and automatic server-sync9.
- [x] Additional browser online/controlled foreground recovery2, with sync settings unmounted and no manual synchronization APIs.
- [x] Docker APK build/export/signature/hash, isolated install-r and exact phone IME/BACK/draft/save/restart checks; screenshots reviewed and forward removed.
- [x] Frontend/backend contracts, root cause, context manifests and validation record updated.
- [x] Linux x64 Electron ZIP `make` and final extracted-artifact smoke passed on the supplied x86 host with default sandbox; ZIP integrity and synthetic persistence verified. The earlier safeStorage hang is fixed with a bounded, cached availability probe.
- [x] User visual review confirmed passed on 2026-09-30.
- [ ] Phase 3.4 exact-hunk commit review; no code staged/committed and task remains in progress.

Necessary regression-discovered scope extension: resume existing remote probe
after the last account/profile transition, and finally dispose legacy sync-test
hosts. This closes ML07 behavior without changing protocols, credential policy,
or introducing native background services. Full result: `validation.md`.

## Safety and rollback points

Only exact test device and isolated package. Do not touch the second ADB serial, system density/orientation preferences, real data, remote servers or account credentials. Use `/tmp` for scripts/screenshots. Retain devtools forwards only during testing and remove this task's exact forwarding when done. Product changes stay reviewable in diff; APK update is reversible without data reset.
