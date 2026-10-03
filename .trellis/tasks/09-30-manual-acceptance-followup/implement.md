# Implementation and Acceptance Plan

## Bookkeeping already completed

- [x] Archive every active task from before 2026-09-28 under `.trellis/tasks/archive/2026-09/`.
- [x] Create the A01–A07 manual acceptance table in `prd.md`.
- [x] Keep the implementation closeout in `e11c2da` and retain all archived research as the evidence baseline.
- [x] Probe the physical AIO-3568J Android 11 storage capability; record the HTTPS and IndexedDB fallback scope.
- [x] Run the physical Android A03 SAF/DocumentsUI export, cancellation, wrong-password, and fresh-profile restore harness; record sanitized evidence.
- [x] Preserve the physical Android A04 route geometry, touch-target, and DocumentsUI/BACK baseline; keep TalkBack and hardware keyboard claims manual.
- [x] Run serial local browser acceptance for encrypted sync, offline storage, keyboard/focus, and mobile layout; record the browser-only scope.
- [x] Run production Chrome OPFS local-profile isolation and missing-profile recovery; retain Android WebView scope as manual.
- [x] Run the complete configured production Chrome Playwright suite serially; record the 159/159 result and keep device/deployment scope manual.
- [x] Run the complete unit/integration suite under the required Node 22 runtime and record the 221/221 result.
- [x] Rebuild the production Web/Electron artifacts and pass both packaged Electron smoke gates; record their scope.

## Configuration A acceptance sequence (2026-10-03)

The user authorized autonomous execution and acceptance. Do not require a new
per-row satisfaction reply, or invent subjective satisfaction. The historical
checks above remain historical; the following results describe this run.

- [x] A01 — Current-source packaged Electron path-privacy check passed; combine only with the dated native chooser baseline. [Evidence](research/electron-path-a01-20261003.json).
- [x] A02 — Physical Android 16 / WebView 143 exposes OPFS. Reproduced and fixed SAH profile discovery, verified two isolated ledgers, force-stop/reopen, and missing inactive directory rejection without recreation. Local-only writes used no configured remote; radio disconnection was not tested. [Evidence](research/android-a02-a04-20261003.json).
- [x] A03 — Real DocumentsUI export and selection; wrong-password complete-backup session preserves an empty profile; correct restore creates a separate profile; UI merge finishes successfully; original/restored profiles both survive force-stop. Followup verified corrupted full-backup rejection with the original snapshot unchanged, and real DocumentsUI cancellation retaining the original data. [Evidence](research/android-a02-a04-20261003.json).
- [ ] A04 — Actual Baidu IME and BACK ordering passed; amount input suppresses duplicate system keypad. TalkBack traversal and physical keyboard remain unverified. [Evidence](research/android-a02-a04-20261003.json).
- [x] A05 — Physical Android plus workstation Chrome passed HTTPS upload/download, offline edit/delete pending, manual mode, conflict-head selection and convergence, and a committed PUT with deliberately lost response followed by duplicate-free retry. Followup verified two visible conflict candidates on the actual Android UI, button selection and convergence, then automatic recovery of an offline write without calling sync/probe after mutation. Network interruption was CDP per-client emulation rather than physical radio disconnection. [Client evidence](research/two-device-a05-20261003.json), [service evidence](research/server-a05-https-20261003.json).
- [ ] A06 — Configuration A server passed current-source restore 8/8 and initialization negatives 5/5. Runtime running-copy refusal and existing Compose deployment lifecycle remain uncovered. [Evidence](research/server-a06-20261003.json).
- [ ] A07 — Temporary CA HTTPS onboarding passed as part of A05. No authorized long-lived domain/certificate-renewal deployment was supplied or established; do not treat the disposable endpoint as durable deployment.

Run rows in the order above. A02/A03 may share an Android setup; A06/A07 may share an isolated deployment setup. Do not mark a row complete from a neighboring row's evidence.

## Result recording

For every run append date, environment, exact result, sanitized evidence and
remaining technical scope. User-authorized automated acceptance replaces the
old per-row reply gate; subjective satisfaction remains unasserted. Preserve
failed attempts and distinguish harness corrections from product defects.

## Validation gates

- [x] `python3 .trellis/scripts/task.py validate 09-30-manual-acceptance-followup` passes; existing component-guidelines context-size warning retained in the quality report.
- [ ] A01–A07 each has real evidence and a dated result.
- [x] Record autonomous acceptance authorization without fabricating subjective satisfaction.
- [x] Independent Trellis quality check passed for the code and recorded evidence scope; see [final report](research/quality-check-20261003.md). A04/A06/A07 remain open, so this does not satisfy the archive gate.
- [ ] Archive this task only after the preceding gates; otherwise keep it as the sole active follow-up.

## Rollback points

If a result entry is wrong, correct it while retaining the original evidence.
This run includes the authorized minimal SAH discovery fix in
`src/web/profile-host.ts` and `src/web/opfs-sah-exists.ts`. The scanner is
read-only and tied to the pinned SQLite-WASM 3.53 SAH association format:
512-byte virtual path, flags, association digest and SQLite magic at offset
4096. It never initializes a pool during discovery. Package upgrades must
revalidate this format against vendor source and physical-device fixtures.

## This run's checks and cleanup

- `./hako node_modules/.bin/tsx --test src/web/opfs-sah-exists.test.ts src/web/profile-host.test.ts`: initial implementation 13/13 passed; quality reviewer expanded regressions and reported 16/16 passed.
- `./hako npm run typecheck`: implementation and final reviewer check passed; reviewer also reran the focused SAH browser regression (1/1).
- `./hako npm run test:web -- tests/e2e/local-ledger-catalog.spec.ts --project=chrome --workers=1`: 3/3 passed, including genuine non-isolated SAH reload and removal of the database backing file while pool directories remain.
- Rebuilt the `.lan` APK from the fixed source. A05 separately rebuilt a temporary `.acceptance` package with a CA scoped only to the test server IP; no product trust policy or global Android trust store changed.
- Uninstalled both packages (both were absent before this run); verified no `majo.im.luna` packages remain. Removed only this run's two synthetic backup files, two `/data/local/tmp` XML files, and ADB forwards 19222/19223. Server/Chrome cleanup is recorded in the paired service evidence.
- A temporary driver TLS error printed a synthetic bearer in transient tool output. No raw headers entered repository evidence; destruction of the isolated service/session database invalidated it. Subsequent diagnostics emitted sanitized stages only.
- Local temporary build context, generated CA APK, raw synthetic backup and UI dumps are removed after evidence capture; only sanitized task records and committed-source regressions are intended to remain.
- Followup used a new CA and newly installed `.acceptance` package after first-round cleanup. It added no saved backup file (SAF save was cancelled). The package was uninstalled, package query was empty, forward 19223 removed, and the second temporary APK image/context/CA copy removed after passing A03/A05 followup. Paired service cleanup remains recorded by the server agent.
