# Research: SQLite self-hosted sync acceptance audit

- Query: Which 09-10 PRD acceptance criteria are implemented and evidenced by current source and the 09-08 validation, and what is the smallest next testable task?
- Scope: internal, read-only audit of source, task records and tests; no fresh test or remote run.
- Date: 2026-09-24

Follow-up: this audit was taken before the 2026-09-24 continuation. The
two-stage MinIO credential boundary and normal-reload picker gap identified
below were subsequently addressed; see `../validation.md` for current evidence.

## Files found

- `prd.md` — ten unchecked acceptance criteria and the target local catalog, storage and sync contracts.
- `validation.md` — earlier local test counts and explicit remaining evidence limits.
- `../09-08-fullstack-release-validation/validation.md` — later isolated Compose, physical Android and temporary HTTPS cross-device results, including cleanup and limitations.
- `compose.yaml`, `deploy/instance-init.mjs`, `deploy/README.md`, `scripts/smoke-server-restore.mjs` — single Compose, bootstrap, recovery instructions and disposable restore smoke.
- `src/web/main.ts`, `src/web/profile-host.ts`, `src/web/sqlite-wasm.worker.ts`, `src/main/profile-host.ts`, `src/renderer/app/shell.tsx`, `src/shared/server-api.ts` — host selection, per-profile storage and startup UI.
- `src/sync/server-host.ts`, `src/sync/ledger-service.ts`, `src/shared/ledger-sync.ts`, `src/shared/settings.ts` — session, policies, conditional encrypted graph sync and conflict state.
- `tests/server-sync/profiles.test.ts`, `tests/server-sync/native.test.ts`, `tests/e2e/server-account.spec.ts`, `scripts/smoke-deployed-sync.ts` — fixture and deployed browser evidence.

## Acceptance criteria matrix

“Partial” means a useful subset is implemented or tested; the complete PRD criterion is not proven.

| PRD AC | Status and evidence | Missing or unproved part |
| --- | --- | --- |
| 1. Clean one-Compose init and repeat identity | **Partial.** `compose.yaml:1-77` defines init, MinIO, SQLite API and Web; `deploy/instance-init.mjs:24-59` creates or reuses runtime files; 09-08 validation lines 67-69 record isolated first boot and restore/restart. | No recorded same-directory second `compose up` proving all identities, credentials, objects and accounts unchanged. More importantly `instance-init.mjs:30-45` gives API the MinIO **root** pair; the required separate limited sync credential is absent. |
| 2. Protected `data/` and safe consistent recovery | **Partial.** `deploy/README.md:147-226` documents complete stopped-service copy and restore; 09-08 validation line 67 and `scripts/smoke-server-restore.mjs:183-387` verify synthetic identity, ciphertext, ETags, sessions and API restart. | Running-copy, partial-init and wrong-permission negative cases have no recorded acceptance run; the initializer calls `chmod/chown` on the root (`deploy/instance-init.mjs:15-22`), so permission handling needs explicit tests. This is not production data recovery. |
| 3. Two devices, encrypted add/edit/delete and failure safety | **Partial.** Two isolated browser contexts and a physical Android exchanged synthetic data over trusted temporary HTTPS (`09-08/validation.md:72-87`); graph/CAS, response-loss and conflict fixtures exist in `tests/server-sync/profiles.test.ts:58-109` and `src/sync/ledger-service.ts:210-304`. | The recorded physical path proves browser-to-Android and Android-to-browser adds; it does not itself cover edit, delete, network-loss retry or simultaneous write on those physical endpoints. Fixture tests do not replace that whole deployed scenario. |
| 4. New device joins with server URL/account/ledger password | **Substantially evidenced for synthetic Web and Android.** `09-08/validation.md:81-84` records second browser restore, Android restore and return sync; device API uses authenticated HTTP (`src/sync/server-host.ts:916-990`), not an S3 client. | Temporary route was rolled back (`09-08/validation.md:85`); no permanent delivery endpoint or fresh-device production handoff is proven. |
| 5. Default automatic and per-ledger manual policy | **Partial.** Default is `automatic` (`src/shared/settings.ts:142`); setting updates and scheduling are in `src/sync/server-host.ts:1254-1265,1369-1400`; Web online/foreground hooks are in `src/web/main.ts:26-35`; account UI has both choices (`src/renderer/features/account.tsx:579-590`). | Existing tests/validation do not collectively demonstrate commit, startup, foreground and network restoration triggers across all three host paths. |
| 6. Manual offline writes and explicit convergence/conflict | **Partial.** `scripts/smoke-deployed-sync.ts:120-144` encodes offline write, reload, no-upload and explicit convergence; fixture profile tests cover response loss, and 09-08 validation line 83 records a failed Android sync preserving its local transaction. `src/sync/server-host.ts:1254-1265,1369-1375` excludes manual mode from automatic scheduling. | No later 09-08 record of the entire deployed manual/offline/conflict sequence; the temporary HTTPS run chiefly proved bidirectional add/restore. |
| 7. Startup local catalog/history/isolation | **Incomplete.** Browser catalog is a separate SQLite-WASM state database with per-ledger names (`src/web/profile-host.ts:20-40,79-100,133-185`); native profile files and history are separate (`src/main/profile-host.ts:39-45,88-116,144-176`); switch/removal fixtures exist (`src/web/profile-host.test.ts:98-121`, `tests/server-sync/native.test.ts:111-145`). | Startup picker appears only if there are >1 profiles **and** active is unknown or empty (`src/renderer/app/shell.tsx:212-225`), so it does not open on normal restart with an existing active ledger. `ProfileSummary` exposes only id/name/binding (`src/shared/server-api.ts:10-14`), and picker displays only name/binding (`src/renderer/app/shell.tsx:1067-1115`): no opened time, storage type, or sync state. `LunaServerApi` has no local create/import operation (`src/shared/server-api.ts:130-141`). Catalog is SQLite-backed on Web but stores an ordered ID JSON array, not the requested structured metadata (`src/web/profile-host.ts:153-193`); Electron history is JSON, not SQLite. |
| 8. Explicit financial conflicts, tombstones, wrong identity/password | **Partial.** Revision graph conflict/tombstone code is in `src/shared/ledger-sync.ts:124-279`; bind mismatch is rejected by `src/sync/server-host.ts:943-950`; invalid passphrase cannot decrypt before local merge (`src/sync/server-host.ts:953-969`). Fixture tests exercise conflict and profile isolation (`tests/server-sync/profiles.test.ts:58-322`). | Complete user-facing conflict resolution, delete non-resurrection and wrong-password no-write acceptance evidence on current physical/deployed endpoints is not recorded. |
| 9. Shared domain; Electron/Web/Android storage paths | **Partial.** Native uses per-profile `better-sqlite3` files (`src/main/profile-host.ts:39-45`); ordinary Web constructs SQLite-WASM stores (`src/web/profile-host.ts:169-185`), with OPFS and SAH pool branches (`src/web/sqlite-wasm.worker.ts:313-331`). Only native without `getDirectory` selects IDB (`src/web/main.ts:15-24`). 09-08 validation lines 63-66 prove an Android 11 WebView's IDB-compatible persistence after force-stop; deployed Web checked OPFS (`scripts/smoke-deployed-sync.ts:85-102`). | No installed Android device with OPFS/SAH pool has a recorded persistence/isolation run. The physical Android result did not disconnect the network (`09-08/validation.md:64`). Per-profile OPFS and catalog isolation is suggested by code, but complete three-host acceptance remains unproved. |
| 10. Actual docs, automated/secret scan and manual evidence | **Partial.** `deploy/README.md:8-45,147-249` covers start/stop/recovery; 09-10 validation lists passing local suites; 09-08 validation records temporary HTTPS, Android and cleanup. | No complete sensitive-information scan, negative initialization/permission gate or production restore evidence is recorded. The documentation describes internal credentials but does not satisfy the PRD's separate limited sync credential requirement. |

## Smallest next independently testable work item

Fix the **startup choice decision** in `src/renderer/app/shell.tsx:212-225` and add one focused browser regression: create two local ledgers, select one with existing records, reload, confirm the startup picker appears with the selected ledger highlighted, choose the other, and verify the first ledger's records never appear there. This narrows AC 7 without changing synchronization or server state. Afterward, extend catalog metadata/schema and the picker UI in a separate slice; the missing root-versus-limited MinIO credential separation is an independent deployment/security work item that must be resolved before AC 1 can be accepted.

## Related specs

- `.trellis/spec/backend/database-guidelines.md` — native local SQLite and server metadata contracts.
- `.trellis/spec/backend/deployment-and-recovery.md` — Compose and recoverability boundary.
- `.trellis/spec/backend/ledger-sync-guidelines.md` — encrypted graph/CAS and conflict semantics.
- `.trellis/spec/frontend/android-runtime.md` — Android OPFS/IDB decision and installed-device proof requirement.
- `.trellis/spec/frontend/state-management.md` and `.trellis/spec/frontend/web-host-and-validation.md` — profile scope and Web validation.

## External references

None; this audit uses only repository source and saved test evidence.

## Caveats / Not Found

- No commands were run against VPS, test host or Android for this audit, and no test suite was rerun. Statuses describe saved evidence and source shape, not new acceptance results.
- The 09-08 temporary `luna.majo.im` route was removed after the synthetic exercise. Its result should not be presented as a durable VPS implementation.
- 09-10's own `validation.md` predates the later 09-08 physical/HTTPS continuation and still says those operations were paused; the later record supersedes that pause for evidence only.
