# Implementation and Acceptance Plan

## 2026-10-05 A07 resumed acceptance (current)

User resumes `https://luna.majo.im` with updated configuration A VPS access.
This supersedes the 10/04 deferral and archive-ready disposition below;
A01–A06 and the canceled TalkBack scope remain unchanged.

- [x] Inspect VPS route, existing Luna state, Docker/Compose and certificate renewal; record exact deployment/rollback boundary before changes. Existing Sep28 project preserved; fresh `/opt/luna` and loopback18111 ownership/availability checked. Dedicated HTTP-01 challenge externally verified and Luna-only certificate issued; completed service/renewal/client checks are recorded below.
- [x] Prepare current-source persistent Compose deployment under `/opt`, preserving unrelated services and existing data; validate before applying the Luna route.
- [x] Verify trusted public HTTPS, headers, API readiness and no public API/MinIO ports; document renewal and operator commands. Luna-specific certificate and actual successful not-due renewal check verified; future renewal is not claimed.
- [x] Use isolated synthetic account and fresh browsers/physical Android with unmodified system trust for login, transaction and attachment upload/download. Two originally fresh Chrome profiles and actual Android15/WebView134 converged on two transactions/two images; normal reload, cold client/session clearing/reauthentication, and native live-session/server-restart continuity passed. Harness retries preserved; no product-source change.
- [x] Verify coordinated service/client restarts preserve identity, local ledger and remote attachment bytes; review sanitized logs and complete owned device test cleanup. First Chrome-seeded backup/restart and second native-seeded restart-only passed; original native session remains usable. Final all-service/proxy logs expose none of 11 actual client secrets or 4 VPS-only internal keys across 794 API events including failed authentication after revocation; unique account reset, all11 stored sessions revoked, zero active sessions, all9 old bearers and old password401. Owned Android package/forward, client/VPS scratch, raw credentials/profiles/logs and dedicated APK image removed; retained deployment/backup and sanitized diagnostic logs are explicit.
- [x] Independently verify A07 deployment/client evidence and reconcile current PRD/mainline/closeout before commit/archive handling. [Final review](research/a07-quality-check-20261005.md) passed with no unresolved in-scope finding; both 15-entry context manifests validate, with the known oversized component spec fully read directly.

## 2026-10-04 closeout amendment (historical; superseded on 10/05)

User explicitly deferred A07 after confirming durable HTTPS inputs are absent.
Complete and independently verify A01–A06 before archive; preserve A07's
deployment prerequisites in mainline as a follow-up, without reporting a pass or
automatically starting new work. A04 permits the original real-system-IME input
alternative; virtual keyboard injection must stay distinct from physical input.
Historical all-seven archive gates below are superseded by this amendment.
User additionally canceled TalkBack acceptance and retained keyboard/IME/BACK;
stop the temporary reader and restore original accessibility settings. Do not
remove existing semantic controls or claim the canceled scope passed.

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
- [x] A04 — Revised nonvoice scope passed on actual Android 16: virtual arithmetic, real Baidu IME, layered BACK/draft protection, names/focus, save/errors, DocumentsUI cancellation and restart. Detail close lost opener focus before the minimal correction; corrected APK passed BACK/close/Escape and kept editor amount focus. Physical keyboard absent; real IME fulfills the original OR alternative. TalkBack canceled by user; original system settings restored. [Current evidence](research/a04-native-20261004.md), [historical evidence](research/android-a02-a04-20261003.json).
- [x] A05 — Physical Android plus workstation Chrome passed HTTPS upload/download, offline edit/delete pending, manual mode, conflict-head selection and convergence, and a committed PUT with deliberately lost response followed by duplicate-free retry. Followup verified two visible conflict candidates on the actual Android UI, button selection and convergence, then automatic recovery of an offline write without calling sync/probe after mutation. Network interruption was CDP per-client emulation rather than physical radio disconnection. [Client evidence](research/two-device-a05-20261003.json), [service evidence](research/server-a05-https-20261003.json).
- [x] A06 — Final configuration A actual isolated Compose 11/11, original restore smoke 8/8 and backup/initialization tests 13/13 (8+5) passed. New backup command refuses active mounts and preserves source data; stopped copy/new-project restore/restart and missing-runtime/permissions/half-init/missing-bucket negatives passed. Product mc-only proxy correction reproduced and verified. Same-host daemon and maintained stopped window required; raw copies/concurrent writers are not intercepted. No off-host traffic cutover or A07 pass claimed. [Current evidence](research/a06-server-20261004.json), [historical evidence](research/server-a06-20261003.json).
- [x] A07 — Resumed and passed deployment/client/lifecycle scope on 2026-10-05. [VPS evidence](research/a07-vps-20261005.md), [client evidence](research/a07-clients-20261005.md). Preserve the explicitly deferred 10/04 disposition as [historical evidence](research/a07-deferral-20261004.json), not the current outcome.

Run rows in the order above. A02/A03 may share an Android setup; A06/A07 may share an isolated deployment setup. Do not mark a row complete from a neighboring row's evidence.

## Result recording

For every run append date, environment, exact result, sanitized evidence and
remaining technical scope. User-authorized automated acceptance replaces the
old per-row reply gate; subjective satisfaction remains unasserted. Preserve
failed attempts and distinguish harness corrections from product defects.

## Validation gates

- [x] `python3 .trellis/scripts/task.py validate 09-30-manual-acceptance-followup` passes; existing component-guidelines context-size warning retained in the quality report.
- [x] A01–A07 each has actual evidence and a dated result under the current approved scope; A01–A06 passed and resumed A07 deployment/client/restart/cleanup acceptance passed on 10/05.
- [x] Record autonomous acceptance authorization without fabricating subjective satisfaction.
- [x] Historical 10/03 independent quality check passed for its code/evidence scope; [historical report](research/quality-check-20261003.md) retained A04/A06/A07 as then open. The [10/04 report](research/quality-check-20261004.md) covers A01–A06/nonvoice and the then-deferred A07. Current A07 review is [10/05 report](research/a07-quality-check-20261005.md).
- [x] Final 2026-10-04 full-scope independent quality gate and complete production coverage passed: full run 326 pass / 2 SAH fixture failures / no skips, corrected catalog production 6/6 and development 6/6 passed; unchanged 326 cases need no duplicate full run after the isolated fixture-only correction. [Final validation](research/validation-closeout-20261004.md).
- [ ] Phase 3.4 commit and archive bookkeeping: the requested testing stops at archive readiness; no commit or archive was executed. Final independent review passed and A01–A07 technical gates are ready under the current scope. No subjective satisfaction fabricated.

## Rollback points

If a result entry is wrong, correct it while retaining the original evidence.
This run includes the authorized minimal SAH discovery fix in
`src/web/profile-host.ts` and `src/web/opfs-sah-exists.ts`. The scanner is
read-only and tied to the pinned SQLite-WASM 3.53 SAH association format:
512-byte virtual path, flags, association digest and SQLite magic at offset
4096. It never initializes a pool during discovery. Package upgrades must
revalidate this format against vendor source and physical-device fixtures.

The 10/04 detail-close focus correction can be reverted independently, which
restores the observed native BODY-focus defect. The mc proxy correction can
be reverted independently, which restores the demonstrated initializer 502
under injected host proxies. Removing the new backup entrypoint removes its
active-writer refusal; historical raw copy instructions still require a
strictly stopped window and cannot be described as an enforced refusal.

## This run's checks and cleanup

### 2026-10-04 welcome layout followup

- [x] Restore viewport-centered no-workspace Web shell without changing workspace navigation or native surfaces.
- [x] Verify fresh-profile wide desktop, narrow Web/native mobile, advanced disclosure keyboard access, and create/restore/connect paths.
- [x] Record current-source checks and independent review; retain A04/A06/A07 gaps and keep the task active.

The 2048px regression failed before the correction with the welcome axis at
720px instead of 1024px. Restoring `margin-inline: auto` on the no-workspace
Web shell centers topbar/copy/card; 1280/1366/2048 tests now assert the actual
viewport axis. Desktop and narrow Web budget visibility remains intentional;
only the native mobile surface includes it inside advanced options.

Validation: focused setup browser tests 12/12, native mobile welcome en/zh-CN
2/2, typecheck and Web production build passed. Fresh Chinese 375px portrait
and 800px landscape had no horizontal overflow. Independent review reproduced
an unrelated October-sensitive budget test failure, froze its September clock
and added explicit future inheritance assertions; the full unit suite then
passed 226/226. Live HTTPS preview on port 6080 serves the corrected CSS.
See [quality review](research/onboarding-layout-check-20261004.md) and
[design decisions](research/onboarding-layout-uupm-20261004.md).

- `./hako node_modules/.bin/tsx --test src/web/opfs-sah-exists.test.ts src/web/profile-host.test.ts`: initial implementation 13/13 passed; quality reviewer expanded regressions and reported 16/16 passed.
- `./hako npm run typecheck`: implementation and final reviewer check passed; reviewer also reran the focused SAH browser regression (1/1).
- `./hako npm run test:web -- tests/e2e/local-ledger-catalog.spec.ts --project=chrome --workers=1`: 3/3 passed, including genuine non-isolated SAH reload and removal of the database backing file while pool directories remain.
- Rebuilt the `.lan` APK from the fixed source. A05 separately rebuilt a temporary `.acceptance` package with a CA scoped only to the test server IP; no product trust policy or global Android trust store changed.
- Uninstalled both packages (both were absent before this run); verified no `majo.im.luna` packages remain. Removed only this run's two synthetic backup files, two `/data/local/tmp` XML files, and ADB forwards 19222/19223. Server/Chrome cleanup is recorded in the paired service evidence.
- A temporary driver TLS error printed a synthetic bearer in transient tool output. No raw headers entered repository evidence; destruction of the isolated service/session database invalidated it. Subsequent diagnostics emitted sanitized stages only.
- Local temporary build context, generated CA APK, raw synthetic backup and UI dumps are removed after evidence capture; only sanitized task records and committed-source regressions are intended to remain.
- Followup used a new CA and newly installed `.acceptance` package after first-round cleanup. It added no saved backup file (SAF save was cancelled). The package was uninstalled, package query was empty, forward 19223 removed, and the second temporary APK image/context/CA copy removed after passing A03/A05 followup. Paired service cleanup remains recorded by the server agent.
