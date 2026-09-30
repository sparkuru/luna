# Validation — 2026-09-26

Implemented and installed the changed `.lan` APK on the user-confirmed phone.
The user confirmed the visual review passed on 2026-09-30. The task remains
`in_progress` pending the Phase 3.4 exact-hunk review and code commit; no archive,
journal auto-commit or deployment has been performed.

## Final behavior

- Native header shows brand/workspace/settings; no constant sync, login/unlock,
  or local-ledger picker. Ledger/account/sync tools remain in Settings.
- Mobile core fields precede its single compact calculator. Amount uses
  `inputMode="none"`; text inputs still use IME. Primary entry/category and
  summary controls are48px including landscape and nested category portals.
- Narrow Android has56px summary rows, independent privacy toggles, no duplicate
  hero shortcuts, and the existing central record action. Electron retains its
  entry shortcuts and desktop geometry; shared header/copy also changes there.
- Removed random ledger slogans, repeated recent-ledger help and successful
  offline footer. Production readiness dataset remains; preparation/failure
  feedback remains localized and visible.
- Account/profile transitions now resume the existing remote probe after the
  last transition exits. Saved manual mode and disposed-host guard remain.
- `save()` refuses `imageBusy`, including direct form submission while staging.

## Automated results

| Check | Result / boundary |
| --- | --- |
| `./hako npm run typecheck` | Passed on final product code and again after fixture cleanup |
| `./hako npm test` |214/214 passed; rerun after entry guard and probe repair |
| Focused Playwright |80 unique cases covered: final whole run78/80, two narrow image cases interrupted by concurrent Vite HMR; stable-source targeted image rerun4/4 resolved both. Not a claimed single80/80 run |
| Production offline/router Playwright |12/12 passed: cold offline refresh/create/reload, hidden ready footer, localized service-worker registration failure |
| `./hako npm run test:server-sync` |9/9 passed after lifecycle and fixture cleanup fixes; two connected hosts upload/pull without `sync()` or `checkRemoteNow()` after write |
| Browser connectivity/foreground hooks |2/2 passed (desktop/narrow): real offline local write and online recovery; controlled visible-document visibilitychange recovers failed automatic write, with Settings sync unmounted |
| `./hako npm run web:build` |Passed after final source edits; renderer-DKtN5AwC.js |
| `./hako npm run build` |Typecheck and Electron package passed |
| `./hako npm run make` |Package passed; zip distributable failed `spawn zip ENOENT` (container dependency) |
| `./hako npm run smoke:electron` |Failed before completion, SIGTRAP; isolated diagnostic identified unavailable Chromium sandbox in container |
| Host `npm run smoke:electron` |Failed, SIGSEGV; cause not established. No packaged desktop smoke success claimed |
| Docker JDK21 APK build/export |Passed; `apksigner verify` in build and exported SHA256 sidecar verification passed |
| `git diff --check` |Passed |

Focused files: `android-entry-layout`, `entry-form-polish`, `ux-entry-summary`,
`ux-mobile-navigation`, `intuitive-ledger`; both configured browser projects.
Coverage includes320/375/457px, en/zh, long names/large amounts, two complete
records at375×800, landscape1098×578, unsupported-dvh CSSOM fallback,
independent summary toggles, nested category focus, hardware arithmetic,
validation, drafts, staging guard and preserved Web three-column form.
Production files: `offline-and-storage` and `router-offline`, using
`LUNA_TEST_PRODUCTION=1` through hako.

## Physical phone

- Original port44643 expired; user supplied `192.168.9.11:34971`. Verified same
  `22041216UC` / xagapro Android15. Only this device used; other ADB device untouched.
- Package `majo.im.luna.lan`, synthetic ledger “移动布局测试”; update via
  `adb -s ... install -r`. No uninstall/clear, real account, radio/density/orientation
  preference changes or remote service changes.
- APK `artifacts/android/luna-lan-debug.apk`, SHA256
  `c12f47ce7ee9a9478dbe0a5a7826964a0fc121ee206dccd59839d718c58baf26`.
- CSS viewport457×999, DPR2.3625. Header≈48px versus baseline≈148px;
  recent-ledger heading y≈338 versus baseline≈424.
- Entry amount y≈194, category≈311, date≈428, calculator≈488, save≈881.
  Core controls≈48px; amount focus leaves native IME closed and full viewport.
  Original category/date/save were≈783/904/972 with IME shrinking viewport to709px.
- Actual category search opens IME. `KEYCODE_BACK` dismisses IME, then category,
  retaining entry. Actual notes IME remains available; BACK dismisses it before
  hiding entry. Reopening retains35.00 and notes.
- App keys12+23 evaluate35.00; saved expense reads back as normalized `-3500`.
  Synthetic6.00 record plus two35.00 records remain (second35.00 from repeating
  QA after a script assertion expected unsigned expense). No records removed.
- Chinese/English home and entry, settings→sync automatic mode, no persistent
  footer/status, two full records above navigation and no horizontal overflow
  passed. Force-stop/relaunch reads the saved records, restored Chinese locale
  and default hidden summaries; local bundled readiness=`ready`.
- Mobile QA initially had a too-specific calculator selector and unsigned expense
  expectation; these were script errors, corrected against DOM/domain and rerun.
  Final script passed. Screenshots captured via Android `screencap`, not CDP.
- Exact task-owned tcp9224 forward removed after validation.

Artifacts in `/tmp/luna-mobile-qa-20260926/`: `report.json`, `home-zh.png`,
`home-en.png`, `entry-zh.png`, `entry-en.png`, `notes-ime-zh.png`,
`settings-sync-zh.png`, `home-restart-zh.png`. Parent inspected all screenshots:
no overflow/covering controls found. Browser375px is not a physical375px device;
unsupported-dvh simulation is not old physical WebView evidence. Physical test
did not disable network; actual production offline browser checks are separate.

## Review and root causes

Trellis implement plus independent check completed. Reviewer fixed landscape
and category portal target dimensions and the missing imageBusy submit guard,
then reviewed host scheduler fix and frontend/backend specs. No outstanding code
finding. The continuous probe exposed old tests that only logged out or cleaned
hosts on success; every fixture now disposes in finally, and delayed test gates
release before cleanup. Initial full run was stopped because those leaked hosts
kept Node alive; corrected complete run9/9 exited normally.

The prior remote-probe test explicitly called `checkRemoteNow()` and uploaded via
`sync()`, hiding that transitions cancelled the poll. The revised test attaches
notification transport before login/connect, subscribes before a write and waits
for both automatic publish and periodic committed pull. The old source failed
with automatic remote probe timeout; the two-line lifecycle repair passes.

## Submit-ready gate / remaining evidence

Classification: `human-required`. The user explicitly approved the visual review
on 2026-09-30. Automated geometry, actual IME/BACK and persistence already passed.
TalkBack/assistive technology, real provider/account cross-device sync, and the
Phase 3.4 exact-hunk commit review remain separate gates; no approval is inferred
for those from the visual response.

Desktop Linux package/make and extracted-ZIP smoke now pass on the user-provided
x86 host; see the final evidence section below. TalkBack/assistive technology
and real provider/account cross-device sync were not tested; synchronization
evidence here remains synthetic HTTP. Automatic sync applies during an active
configured/unlocked app session, not an Android service after termination.
Connectivity/foreground runtime checks passed via `./hako npm run test:web -- tests/e2e/server-account.spec.ts --grep 'online and controlled foreground'`.
The visible-document event is controlled browser evidence, not an Android
Activity transition. Both scenarios compare actual encrypted remote objects
and decrypted local state; they call no explicit synchronization API.

## 2026-09-30 Android 11 landscape spot check

Built the current worktree with the isolated application id
`majo.im.luna.archivecheck` (APK SHA-256
`feafd1e3422a6c45a53bb549ab5c0ad3852233d1bc42af02ad8bf4bee38ae524`).
Confirmed the package was absent before install, installed and launched only this
package on the user-provided AIO-3568J / Android 11 board at
`192.168.9.14:5555`, then created one synthetic 0.01 expense and force-stopped
and relaunched the app. The restarted ledger showed exactly one transaction.
The synthetic ledger name contains the literal `%20` produced by ADB text input;
it contains no real financial data. Screenshots are in
`/tmp/luna-archivecheck-saved.png` and
`/tmp/luna-archivecheck-relaunch.png`.

The screen stayed in landscape at 1920×1080; the five-item navigation, masked
summary, record count and entry surface were visible. The test app was then
force-stopped and only `majo.im.luna.archivecheck` was uninstalled. Existing
Luna packages and data were not touched. This adds an Android 11 persistence
and landscape smoke point; it does not replace the target phone's 457×999
portrait/touch-comfort review or prove TalkBack/Electron behavior.

## 2026-09-30 Android 16 integrated smoke

The full current-source Android 16 AVD result, APK hash, 19-check coverage and
exact Compose cleanup are recorded in the [mobile redesign integration
validation](../09-26-mobile-experience-redesign/validation.md#2026-09-30-android-16-当前工作树完整-smoke).
It complements this Android 11 landscape/persistence spot check; it does not
close the task's remaining target-phone visual/touch-comfort review.

## 2026-09-30 Android 11 relaunch check and final x86 distribution smoke

Repeated the isolated Android 11 test with package `majo.im.luna.archivecheck`
on the user-provided AIO-3568J. Created a synthetic ledger and a CNY 0.01
expense, force-stopped/relaunched, and confirmed the single transaction remained.
The test package was removed afterward; pre-existing Luna packages were left
installed. Screenshots: `/tmp/luna-archivecheck-record-saved.png` and
`/tmp/luna-archivecheck-restarted.png`.

The final Linux x64 ZIP was built on the x86 host, passed `unzip -t`, then was
extracted and smoke-tested from the archive under the default Electron sandbox.
The app exited 0; the synthetic database retained all 3 expected transactions,
the UI form record, and 3 pending operations. Chinese locale and hidden-summary
settings survived readback. A `server-status` request arriving after the smoke
intentionally cleared its window reference was rejected as `window-missing`;
the app's data and smoke exit remained successful. Full artifact hash and build
details are in the [parent integration validation](../09-26-mobile-experience-redesign/validation.md#2026-09-30-x86-linux-zip-与最终分发包-smoke).

The safeStorage probe now times out after two seconds and caches an unavailable
result for this process; basic_text skips the async probe. Secrets still remain
session-only when OS encryption is unavailable. This removes the packaged UI
hang seen in earlier x86 runs. The user visual gate is now accepted; remaining
task gates are the exact-hunk commit review and the separately untested
TalkBack/provider scenarios. No code has been staged or archived.

## 2026-09-30 Android 11 board route/layout and native picker recheck

Using the current worktree, the isolated `.lan` APK was rebuilt with SHA-256
`5a0988ed84369890913189b971a69e7e4c0e89510ec9956ab3c43645641c8b62` and updated
with `adb install -r` to the existing synthetic package `majo.im.luna.lan` on
`192.168.9.14:5555` (AIO-3568J, Android 11, 1920×1080, density 280). No clear,
uninstall, account, or non-test package operation was used.

The automated Playwright/ADB check opened the home and entry surfaces, captured
the four settings/statistics routes, and asserted no horizontal overflow at the
reported 1098 CSS-pixel WebView width. The home record/menu actions were at
least 206×56 CSS px; entry controls were 48–64px high. Android DocumentsUI
opened from the backup flow, showed the synthetic `board-check.luna-backup` in
Download, and returned to the app with that filename present on the file input.
This Android 11 grid requires an accessibility focus activation (`TAB`/`ENTER`)
after the first physical card tap; the result records the returned app focus and
filename. The complete report and device screenshots are in
`research/android11-board-layout-20260930/`, including
`native-picker-result.json` and `native-picker-selected-returned.png`.

This is additional Android 11 landscape/layout and chooser-boundary evidence;
it does not replace the target `22041216UC` Android 15 device evidence,
TalkBack review, or exact mixed-hunk commit review. The user visual approval is
recorded above and is not being re-inferred from this automated run.
