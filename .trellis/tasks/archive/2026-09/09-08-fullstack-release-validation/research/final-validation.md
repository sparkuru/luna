# Final D validation — 2026-09-08

Entry authorization: root confirmed A/B/C accepted, including production Web
68/68, strict checking and independent host/API review, before native packaging.
This document records D's actual final artifacts and runtime checks, separately
from foundation evidence and unautomated device/assistive-technology review.

## Web/API and recovery

- Final `docker build -t luna-web:release-validation .` passed:
  `sha256:c9908309209c62a5ea25a6ef89350ed4557040e60e26256e014b8f51f249df46`.
- Final server Docker build passed:
  `sha256:e20570eaed24b2b4056a4ac09442b2988bd2e2c2917eaa23f904104493540094`.
- Final restore/proxy smoke **7/7 passed** against those images. Report:
  `/tmp/luna-server-restore-fRP2Cw/report.json`; console log:
  `/tmp/luna-final-server-restore.log`. Actual PostgreSQL17.11, preserved
  instance/login/ciphertext/ETag/idempotency, two-client graph convergence,
  DB outage/restart, proxy rules and changed-IP API recreation are covered.
- Final Nginx image served on an ephemeral loopback port. Production browser
  offline/deep-link/storage/update tests **8/8 passed**, under the image's real
  CSP headers. Command used `LUNA_TEST_PRODUCTION=1`, its explicit base URL,
  `tests/e2e/router-offline.spec.ts`, `offline-and-storage.spec.ts`,
  `offline-update.spec.ts`, `--project=chrome`. Log:
  `/tmp/luna-final-nginx-browser.log`; output/report directories:
  `/tmp/luna-final-nginx-test-results`, `/tmp/luna-final-nginx-report`.

## Electron Linux x64

- `./hako npm run build` passed after root updated the packaged smoke to
  navigate current routes and use native input setters/events for React.
  The latest committed-write/Query-refresh wait is included in this build.
- `xvfb-run -a npm run smoke:electron` passed against isolated temporary
  userData, including storage/IPC/settings/crypto/backup/import/reopen checks.
  Log: `/tmp/luna-final-electron-smoke.log`.
- `npm run make -- --skip-package` passed. Its first hako attempt failed only
  because Node Bookworm lacks `zip`; final make used a temporary Node22.22.0
  executable extracted from the pinned image and the host's installed zip,
  without a host installation or product dependency change.
- The resulting ZIP was extracted into a new temporary directory and its own
  packaged smoke passed using `LUNA_LEDGER_PACKAGE` and Xvfb. Log:
  `/tmp/luna-final-electron-zip-smoke.log`. The first diagnostic invocation
  assumed a flat executable path; the actual ZIP contains `luna-linux-x64/`.
- Actual packaged runtime: Electron44.0.0, Chromium152.0.7977.54,
  Node24.18.1. These runtime versions differ from the Node22 build toolchain.

Final ZIP: `out/make/zip/linux/x64/luna-linux-x64-0.1.0.zip`
(126673520 bytes), SHA256:
`930b42f03e57ce937f7da47a42c51fe83ebabb6ee6d46005569eb7c3c82b6edc`.
The preexisting `luna-ledger-...zip` was not removed or treated as this release.

## Android build and native investigation

- `./hako npm run android:sync` passed. Android APK image build and Java
  compilation passed, including the fixed trusted-origin hardware-back bridge.
- APK: `artifacts/android/luna-debug.apk` (4439507 bytes), SHA256:
  `e32162ce1830d3b86c49b19d9f8427701f07ca42a42abd60ed25a2bff5453d3b`.
  Sidecar hash matches. This is debug signing, not a store release identity.
- Root statically reviewed `android-offline-restarted.png`: Luna brand, narrow
  controls/month selection and masked summary geometry fit; lower viewport
  clipping is scrollable content. This is separate from native/physical review.
- Initial one-vCPU emulator suffered a System UI ANR intercepting real BACK.
  `dumpsys window` showed `Application Not Responding: com.android.systemui`
  while the WebView still rendered Luna. Fixed JS event navigated correctly;
  counted hardware keys produced no app event while the system overlay owned
  focus. Screenshot `/tmp/luna-final-android-system-anr.png`, failed-run log
  `/tmp/luna-final-android-system-anr-run.log` retain environment evidence.
- A clean one-vCPU restart repeated the system ANR before app launch, with
  guest load33.39 and surfaceflinger consuming50% of the guest CPU. Root approved
  changing only the isolated emulator to2vCPUs, retaining2GiB guest RAM,
  KVM-only device delegation and existing privilege boundaries. Old container
  was removed before recreating the AVD. `sh -n`, ShellCheck and shfmt passed.
  New emulator image:
  `sha256:4fe0eba4122bde38665d95d66bac7904f463c1daf9ce663fdb60a82ecd54d334`.
- Native smoke now checks Luna owns actual native focus before BACK. Tests use
  hidden-dialog visibility semantics, because draft-preserving portal wrappers
  intentionally remain in the DOM. Current IME service `mInputShown` is parsed
  independently of stale `mIsInputViewShown`; a real screenshot confirmed no
  keyboard while the latter remainedtrue. Capacitor's JS confirm is a native
  Android AlertDialog, so the test uses actual native OK/Cancel buttons.
- Cleanup attempts radio restoration and connection close without replacing a
  primary test failure with a cleanup error. Stage markers and APK/runtime
  evidence are emitted by the final smoke source.

Final full Android smoke **18 checks passed, exit0**. Log:
`/tmp/luna-final-android-smoke.log`. Actual Android16, WebView Chromium
133.0.6943.137. Scope includes offline create/process restart, privacy/viewport,
real hardware BACK through menu/category/entry, retained draft and native
Cancel/OK on entry-type replacement, native home fallback, actual SAF
cancel/save/file decrypt, Android↔Node ledger and v1 settings crypto through
explicit HTTPS protocol fixtures, and final offline restart after sync.

The final test keeps a passive Playwright dialog listener during native taps;
otherwise Playwright auto-dismisses JS confirm before the native OK action.
After asserting native home fallback it force-stops/relaunches the disposable
app without clearing data, avoiding AndroidWebView's cached closed Page for an
Activity recreated with the same PID. This is a test connection boundary, with
committed records checked again; no renderer/native product workaround was added.
Focused strict TypeScript checking passed (`/tmp/luna-final-android-typecheck.log`).
The existing native backup/settings helpers required no changes.

## Cleanup

All restore and Compose checkpoint containers/networks/volumes were removed.
Final Web review container and final Android project were label-verified before
removal. Build images, ZIP/APK and diagnostic evidence remain for review. User
port4173 was untouched; root separately stopped its own Web/PG fixtures.

## Unrun assurance boundaries

No physical Android device, macOS/Windows package, screen reader, native desktop
first-run directory dialog, private deployment or real production HTTPS recovery
has been tested. No commit, archive, production deployment, secret migration or
destruction of an existing database was performed. Root owns the final targeted
human-review request and parent completion decision.
