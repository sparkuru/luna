# First Usable Checkpoint Validation

Date: 2026-08-30

## Scope

The original 2026-08-30 validation covered the first usable local Electron
checkpoint: workspace setup,
income/expense CRUD, monthly summary/budget, typed preload/IPC, native SQLite
storage under Electron `userData`, and made-artifact close/reopen recovery. It
did not claim browser OPFS, PWA storage, remote sync, production encryption,
conflict resolution, attachments, or assistive-technology automation. The
approved portable-settings extension is covered by the addendum below.

## Environment and artifact

- Package baseline: Electron `44.0.0`, Electron Forge `7.11.2`, Vite `5.4.x`,
  TypeScript `5.9.x`, `better-sqlite3` `13.0.3`.
- Required Node version: `>=22.12.0`; `hako` runs the commands in
  `node:22-bookworm` with the native build toolchain.
- Host made artifact: `out/make/zip/linux/x64/luna-linux-x64-0.1.0.zip`
  (Linux x64, 126,442,205 bytes / about 121 MiB).
- ZIP inspection confirmed `resources/app.asar`, the packaged executable, and
  the unpacked Linux `better-sqlite3` native addon.

## Commands and results

| Command | Result |
|---|---|
| `./hako npm install` | Passed; npm reported existing dependency-audit findings (27 total) and no forced audit fix was applied. |
| `./hako npm run typecheck` | Passed. |
| `./hako npm test` | Passed: 9/9 domain and SQLite tests. |
| `./hako npm run build` | Passed: Vite bundles and Electron package. |
| `npm run make` | Passed on the host: Linux x64 ZIP made successfully. |
| `npm run smoke:electron` | Passed: made executable started, loaded the main content/transaction/budget/month/live-region DOM, wrote through preload/IPC to isolated `userData`, closed, reopened, and recovered both records. |
| `npm audit --omit=dev --audit-level=high` | Passed: 0 production dependency vulnerabilities. The install-time 27 findings are in the development dependency tree; no forced upgrade was applied. |
| `git diff --check` | Passed. |
| `bash -n hako`, ShellCheck, shfmt check | Passed. |

The same `hako` container can build and test the app, but its minimal base
image does not include the system `zip` executable or the host display runtime;
therefore the made ZIP and GUI smoke were run on the host after the reproducible
container build. The product runtime itself is not a network service.

## Cross-layer assertions

- Shared tests prove exact integer minor-unit arithmetic, type sign, split sums,
  date/month validation, summaries, tombstones, and filters.
- SQLite tests prove repeatable migration, atomic invalid-write rejection,
  budget behavior, large integer-string round trips, tombstones, and reopen.
- Packaged smoke proves the narrow `window.lunaLedger` bridge can create a
  signed expense, read the updated snapshot, and recover it after close/reopen;
  it also checks the dashboard's required semantic form and live-region nodes,
  submits a real renderer form event for an income record, and checks the
  success announcement.
- The renderer has semantic forms, explicit loading/setup/empty/error/success
  states, focus-visible controls, reduced-motion CSS, and a human-readable
  local-only sync boundary. No automated visual or screen-reader harness is
  available in this repository.

## Deferred conclusion

The Electron local foundation is usable for recording household income and
expenses offline. Browser OPFS remains an unimplemented spike.

## Approved portable-settings extension addendum (2026-08-31)

The extension adds exact CNY/RMB presentation, complete `zh-CN`/`en` renderer
catalogs, private-by-default amounts, strict versioned settings persistence,
and opt-in encrypted portable-settings synchronization. Automated evidence
covers deterministic two-client merge/idempotency, ETag conditional requests,
bounded retry and stable error classification, zero remote calls while the
master switch is off, secret-free remote/renderer payloads, safeStorage
degradation, and authenticated-envelope limits/tamper/wrong-password behavior.

Final commands:

| Command | Result |
|---|---|
| `./hako npm run typecheck` | Passed. |
| `./hako npm test` | Passed: 31/31 tests. |
| `./hako npm exec -- tsx --test src/main/s3-config-store.test.ts` | Passed: 1/1 focused adapter contract test. |
| `./hako npm run build` | Passed: typecheck, Vite bundles, Linux x64 Electron package, and target-native-addon pruning. |
| `npm audit --omit=dev --audit-level=high` | Passed: 0 production vulnerabilities. |
| `npm audit --audit-level=high` | Failed: 27 development/build-tool findings (3 low, 1 moderate, 22 high, 1 critical); npm offered only forced/breaking remediation. |
| `npm run make` | Passed: Linux x64 ZIP produced; target pruning retained only `better-sqlite3/prebuilds/linux-x64.node`. |
| `npm run smoke:electron` | Passed: `LUNA_PACKAGED_STORAGE_SMOKE_OK`; packaged CNY/i18n/privacy/settings/config-crypto/SQLite reopen path verified. |
| `npm run smoke:config-sync:provider` | Passed against MinIO `RELEASE.2025-09-07T16-13-09Z`: two isolated settings clients created/restored/merged portable settings, repeated sync was idempotent, disabled sync made zero remote calls, remote bytes passed secret/plaintext/device/path scans, and the UUID-scoped object was deleted. Evidence output: `get=8`, `put=2`, `cleanup=deleted`. |

Named-provider evidence is deliberately narrow: MinIO
`RELEASE.2025-09-07T16-13-09Z`, official image digest
`sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`,
loopback HTTP, path-style requests, one isolated bucket and UUID-scoped object.
The test bucket and container were removed after an empty-bucket check. This
does not establish broad S3/OSS compatibility. Release validation still
requires real OS keychain/basic_text behavior, visual/responsive/keyboard/
screen-reader review, target-platform packages, and an independent security
review. The encrypted config protocol is not represented as a general ledger-
sync protocol.

## Application identity and local-directory extension addendum (2026-09-04)

- Package/product identity is `luna` / `Luna`; the Linux made artifact is
  `out/luna-linux-x64/luna` and the ZIP is
  `out/make/zip/linux/x64/luna-linux-x64-0.1.0.zip`.
- The current ZIP produced after this extension is 126,445,318 bytes (about
  121 MiB); this measurement applies to the Luna artifact above.
- Linux resolves the default active directory from the home directory as
  `~/.config/luna`. `settings.json`, `luna.sqlite`, and the local encrypted
  config-sync secret file are written directly inside the active directory.
- Before creating a window or opening SQLite, the main process enters any
  existing default directory directly. Only when the default directory is
  missing does first launch use a native dialog to create it, choose another
  local directory, or cancel and quit. A custom directory is retained only in
  a versioned private local pointer; its path is excluded from renderer DTOs,
  portable settings, and logs. The app remains single-workspace; directory
  selection is local isolation/switching, not multi-workspace support.
- `src/main/app-paths.test.ts` covers default resolution, direct entry,
  creation, cancellation, custom-directory restart recovery, malformed/stale
  pointers, file selections, legacy nested-data migration, and exact SQLite
  sidecar cleanup. The test uses temporary directories and synthetic protected
  bytes only; it does not use real user directories or credentials.
- The packaged smoke keeps `--smoke` plus `LUNA_LEDGER_SMOKE_USER_DATA` as an
  explicit isolated bypass for the native first-run dialog. It does not claim
  visual or assistive-technology automation.

Extension verification commands:

| Command | Result |
|---|---|
| `./hako npm run typecheck` | Passed after the application-path and branding changes. |
| `./hako npm test` | Passed: 44/44 unit, SQLite, config-sync, renderer, application-path, and local-calendar tests. |
| `./hako npm run build` | Passed: typecheck, Vite bundles, and Linux x64 Electron package. |
| `npm run make` | Passed: Linux x64 Luna artifact and ZIP produced. |
| `xvfb-run -a npm run smoke:electron` | Passed: `LUNA_PACKAGED_STORAGE_SMOKE_OK`; isolated packaged startup, IPC/storage reopen, CNY/i18n/privacy, and config-crypto checks. |
| `git diff --check` | Passed. |

Running the GUI smoke without Xvfb on this headless host failed with the
exact runtime condition `Missing X server or $DISPLAY`; the Xvfb invocation
above is the successful packaged smoke evidence. No automated visual,
keyboard, or assistive-technology result is claimed.

## Web-first and MinIO validation addendum (2026-09-04)

The approved follow-up changes the browser target from a deferred OPFS product
implementation to a design/acceptance Web host. It keeps OPFS/PWA research
separate: the browser MVP uses origin-local `localStorage`, while Electron
continues to use native SQLite and the desktop-only config-sync boundary.

### Browser evidence

| Command | Result |
|---|---|
| `npm run web:build` | Passed: Vite 5.4.21 produced the Web entry and shared renderer bundles in `dist-web`. |
| `npm run test:web -- tests/e2e/privacy-and-web.spec.ts --project=chrome` | Passed: 3/3 focused tests. |
| `npm run test:web` | Passed: 6/6 tests across installed Google Chrome and `chrome-narrow` at `375x800`. |

The first visual browser pass found that functionality could pass while the
page remained unstyled: Vite's development-time inline CSS injection was
blocked by the Web CSP. The Web and Electron HTML entries now load the shared
stylesheet externally, and the Playwright suite asserts the designed page
background and summary-grid layout so this regression is observable. A fresh
synthetic-data screenshot pass confirmed the setup and ledger layouts; it is
not a replacement for human visual, keyboard, or assistive-technology review.

The Playwright tests use fresh contexts and no credentials. They create a CNY
workspace and records, verify only the four top aggregate values are masked,
verify the summary grid is collapsed while hidden, verify budget details,
category totals, transaction amounts, transaction editing, and budget editing
remain available, reveal values for the session, confirm reload resets the
reveal, and check the narrow page has no horizontal overflow. Web settings
report `configSyncAvailable: false`; sync controls are disabled and explain the
desktop-only boundary. The generated Playwright report is diagnostic and no
pixel snapshot is used as a release contract.

The shared `localMonthFromTimestamp` rule is also covered by the Node suite so
the initial budget month follows the host's local calendar on both Electron and
Web hosts rather than slicing a UTC timestamp.

### Packaged Electron privacy regression evidence

`xvfb-run -a npm run smoke:electron` passed after updating the packaged bridge
smoke to the same summary-only contract. It verified the made Luna executable
can persist/reopen the CNY SQLite ledger, mask income/spending/net/remaining
budget in the top summary without putting aggregate values in summary
attributes or text, keep detail amounts visible, keep transaction and budget
edit controls enabled, and complete the Chinese settings/IPC/config-crypto
checks. The helper still does not claim visual or screen-reader coverage.

### Repository-local MinIO evidence

`npm run smoke:config-sync:minio` passed using the pinned
`minio/minio:RELEASE.2025-09-07T16-13-09Z` image with digest
`sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`.
The wrapper bound only `127.0.0.1:19000/19001`, used safe test credentials, a
random bucket, a `/data` tmpfs, production `smoke:config-sync:provider`, and
finally teardown. Bounded output was:

```text
LUNA_CONFIG_SYNC_MINIO_OK provider=MinIO version=RELEASE.2025-09-07T16-13-09Z get=8 put=2 cleanup=deleted
```

This is evidence for the fixed MinIO version and current conformance path only;
it is not a general S3/OSS compatibility claim. Browser OPFS, PWA behavior,
real OS keychain/basic_text behavior, visual review, assistive technology,
target-platform matrices, and independent security review remain outside this
automated result.
