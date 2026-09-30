# Luna full-stack migration delivery

## Implemented scope

- React 19 and TypeScript renderer uses TanStack Query, TanStack Router,
  Tailwind CSS 4 and project-owned shadcn/ui components with Radix behavior.
  Hey API generates the versioned HTTP SDK and Query options from server
  schemas. User-facing product naming is Luna; existing storage keys and
  internal ledger-domain API names remain compatible.
- Fastify and PostgreSQL provide administrator-created accounts, revocable
  sessions, owned ledger space and encrypted object synchronization. Financial
  records and statistics stay local; account passwords do not decrypt ledgers.
- Explicit copy/restore and server binding preserve original SQLite/IndexedDB
  profiles and causal financial history. Login alone does not upload. S3 remains
  an alternative target. Logout keeps local copies and cancels remote work;
  restarting requires login/unlock and explicitly re-enabling preferences sync.
- Docker Compose includes Web, API, migration and PostgreSQL services, file
  secrets, internal API/DB networking and loopback Web publication. Nginx
  handles known SPA routes and API limits without caching authenticated data.
  Backup and restore procedures live in `deploy/README.md`.

## Accepted automated evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Local/domain/unit regression | 150/150 | `/tmp/luna-final-unit.log` |
| Production browser, desktop and narrow, including real account API | 68/68 | `/tmp/luna-c-final.log` |
| Real PostgreSQL server contracts/auth/CAS | 17/17 | A `research/review.md` |
| Real PostgreSQL client synchronization/profile integration | 5/5, no skips | C `research/review.md` |
| Generated SDK contracts | 4/4 | `/tmp/luna-final-contracts.log` |
| Deterministic generated client | Passed | `/tmp/luna-final-api-check.log` |
| Strict TypeScript and Web/server builds | Passed | A/B/C evidence and final D logs |
| Final Web/API Docker images and isolated recovery | 7/7 | `/tmp/luna-server-restore-fRP2Cw/report.json` |
| Final Nginx image browser checks | 8/8 | `/tmp/luna-final-nginx-browser.log` |
| Electron build, packaged smoke, ZIP make and extracted-ZIP smoke | Passed | D final evidence; `/tmp/luna-final-electron-smoke.log` |
| Android 16 emulator, actual hardware BACK and SAF backup, crypto/restart | 18/18 | `/tmp/luna-final-android-smoke.log` |

Recovery checks include account and session persistence, stable server identity,
exact encrypted bytes and ETag, idempotency replay, client decryption,
concurrent merge, DB outage/recovery and Nginx recovery after API IP change.
The shutdown assertion tests idle SIGTERM, not in-flight drain.

Android runtime evidence is recorded in D's
[`research/final-validation.md`](../../09-08-fullstack-release-validation/research/final-validation.md).
The passing run used Android 16 with WebView Chrome 133.0.6943.137 and the APK
hash below. Hardware BACK hides and retains an entry draft; changing entry type
is the actual native discard-confirmation trigger. The test uses real Cancel/OK
buttons, an IME-aware BACK sequence and native home fallback. A fresh process
boundary before the following crypto stage avoids Playwright's cached closed
WebView Page after Activity recreation. Native SAF cancellation/save/decryption
and offline settings restart passed. The HTTPS S3 protocol transport is an
explicit DevTools fixture, not a private remote-provider deployment.

## Built artifacts

Root independently rehashed both files after the final package build:

- Linux x64 Electron ZIP: `out/make/zip/linux/x64/luna-linux-x64-0.1.0.zip`,
  126673520 bytes, SHA256
  `930b42f03e57ce937f7da47a42c51fe83ebabb6ee6d46005569eb7c3c82b6edc`.
  Packaged runtime: Electron 44.0.0, Chromium 152.0.7977.54, Node 24.18.1.
- Android debug APK: `artifacts/android/luna-debug.apk`, 4439507 bytes, SHA256
  `e32162ce1830d3b86c49b19d9f8427701f07ca42a42abd60ed25a2bff5453d3b`.
  This is a development build, not a signed store release.

Web image: `sha256:c9908309209c62a5ea25a6ef89350ed4557040e60e26256e014b8f51f249df46`.
API image: `sha256:e20570eaed24b2b4056a4ac09442b2988bd2e2c2917eaa23f904104493540094`.

## Review and operational boundaries

Root reviewed desktop and fresh 375px screenshots, including the account view;
browser automation covers keyboard focus, nested dialogs, privacy, route
blockers and offline behavior. Original screenshots and source archive are
preserved in `/tmp/luna-fullstack-baseline`.

Root also inspected `artifacts/android/android-offline-restarted.png` for
branding, narrow layout and privacy masking, and the final Chinese
`android-synced-restarted.png` for the synchronized locale/privacy settings.
This static WebView review does
not by itself prove native input delivery: an isolated emulator System UI ANR
was found to steal BACK input while leaving the WebView screenshot normal.
D records the focused-window check and clean-emulator rerun separately.

Physical Android devices, real screen readers and a private HTTPS production
deployment have not been tested. Android emulator evidence and Chromium checks
do not replace those reviews. No production data was used or deployment made.
Changes remain uncommitted and tasks unarchived as required by this delivery's
implementation plan; the original uncommitted workspace was preserved.

Root-owned Vite 4273, preview 4274 and the label-verified disposable PostgreSQL
`luna-fullstack-pg-0908` were stopped after their gates passed. The user's
existing port 4173 service was left untouched. D owns and cleans its separate
emulator, Compose, restore and packaging test resources; its final evidence
confirms label-verified cleanup is complete. Build images and artifacts remain.
