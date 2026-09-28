# Research: Acceptance reconciliation

- Query: Map six open tasks to present implementation, reusable validation, superseded decisions, and residual human/device gates.
- Scope: internal; read-only investigation except this report; no git commands, remote actions, secrets, or conversation-history reads.
- Date: 2026-09-12

## Findings

### Task acceptance map and minimal updates

| Task | Supported evidence / current implementation | Precise reconciliation and remaining gate |
| --- | --- | --- |
| `08-30-income-expense-mvp` | PRD lines 20–25 record historical delivery; lines 135–143 record core acceptance. | Keep historical evidence dated. PRD:137 four summary cards is superseded by the three-card UI; PRD:141 localStorage and desktop-only configuration sync are superseded. Append a current-baseline note linking SQLite and UI tasks rather than claiming those old implementation details remain current. PRD:140 native directory selection/cancel/restart explicitly includes human review and remains open without that review. macOS/Windows evidence remains unavailable. |
| `09-06-intuitive-ledger-ui` | `implement.md:14–42` records completed implementation and automated checks. `tests/e2e/intuitive-ledger.spec.ts:18,53,75,97,106` covers entry, keyboard, secondary menu, desktop, and narrow layout. | PRD:55–63 is entirely unchecked despite implementation evidence. Add per-item automated/human evidence distinction; objective behavior can be checked after current tests rerun, while first-use comprehension and visual hierarchy retain human-review qualification. `implement.md:46–47` explicitly leaves visual/native and physical Android gates open. |
| `09-08-frontend-shadcn-migration` | A/B/C children exist under `archive/2026-09/`, and `research/delivery.md` records migration results. PRD review status explicitly authorizes execution. | `task.json:6` planning and its description are stale; root should set in_progress and describe remaining integration. PRD R10 PostgreSQL is superseded by SQLite task; R8 IndexedDB migration is qualified by the later no-development-data-migration decision. Keep archived A/B/C evidence historical. AC8 requires current SQLite restore/native evidence; AC9 still requires human review. Do not archive parent merely because three children are archived. |
| `09-08-fullstack-release-validation` | `research/final-validation.md` records old production browser, Electron ZIP, and 18-check Android emulator gates. | Its recovery result explicitly used PostgreSQL (`final-validation.md:16`), so append new SQLite/current-artifact evidence; never relabel the old result. Three PRD criteria remain dependent on current integration and human/device boundaries. |
| `09-10-sqlite-self-hosted-sync` | Design:3 already says implementation complete but HTTPS/second-device verification pending. Current backend spec/API tests and restore script are SQLite based. PRD:179–201 unchecked list covers startup, restore, two devices, initial download, auto/manual mode, catalog isolation, conflict safety, storage engines, docs/human review. | Mark criteria only with current measured evidence, preserving compound-criterion residuals. AC at PRD:198–200 says no IndexedDB at all, conflicting with current explicit native Android fallback; reconcile as an explicit compatibility decision, not a quiet checkbox change. Design:19,107–125 and implement:49–50 need matching qualification. Design:46–49 still describes instance-init/bucket-init layout; compare current compose before keeping those service/path names. |
| `09-11-repair-generated-sdk-https` | PRD:112–129 identifies AC1–6; PRD:161–162 gives 12/12 real HTTPS browser tests but expressly excludes accounts/second client. | AC1 must be supported by actual tracked source plus clean-checkout validation, not merely local generated files. AC4 still needs true HTTPS account/two-client sync; AC5 current physical APK account/sync; AC6 current SQLite persistence/restore evidence. Preserve existing historical cleanup/rollback success. |

### Reusable tests and exact evidence boundaries

- `scripts/smoke-server-restore.mjs` is now a SQLite + real MinIO disposable fixture, despite older reports describing a PostgreSQL version. Lines 214–219 stop API and MinIO then copy the entire data directory; 226–240 verify instance ID, existing session, exact encrypted object, ETag and idempotency; 242–268 verify two authenticated clients, stale CAS rejection, decrypt/merge/conditional retry; 270–276 restart API and recheck committed object. Lines 287–288 write a report and success marker; teardown checks ownership labels at 304/312.
- This restore script does not itself prove production Nginx/TLS, two UI clients, full Compose startup dependency behavior, or all invalid-permission/partial-init negative cases. Do not reuse the historical “7/7 proxy” claim for the current script, whose `checks.push` list contains five groups.
- `tests/e2e/server-account.spec.ts:31–55` starts a real Fastify listener with SQLite, but uses `MemoryServerObjectStore` and a separate loopback HTTP endpoint. It creates two browser contexts, verifies encrypted copy/restoration, account revocation, preferences, and offline original-profile recovery. Setting only `LUNA_TEST_BASE_URL=https://luna.majo.im` does **not** turn this into real same-origin HTTPS API/MinIO validation.
- `tests/server/api.test.ts:26` covers SQLite authentication, account isolation, CAS, replay, quotas and revocation; `:237` concurrent first-write CAS; `:447` precise CORS/no-store. `tests/server/sdk.test.ts:36` tests actual generated SDK + Query options through HTTP and SQLite.
- `tests/server-sync/` has its own package command and is not included by default `npm test` or `server:test`. Run `test:server-sync` and `test:contracts` explicitly when assessing cross-layer completion. `src/web/profile-host.test.ts:117` guards late decrypt during profile switch; `:247` stable catalog reads; `:267` volatile session/manual mode.
- `scripts/smoke-android.ts:223` deliberately rejects physical devices (`/^emulator-\d+$/`). Do not remove this guard merely to drive the real board. Existing settings/backup helpers change Wi-Fi and perform native file operations, so a physical-device driver must scope actions to the authorized device/app and preserve user state. `LUNA_ADB_HOST`, `LUNA_ADB_PORT`, `LUNA_APK_PATH`, and `LUNA_ANDROID_ARTIFACT_DIR` exist at lines 213–229.
- Current physical-device historical gaps are explicit at SDK PRD:145–146; current APK origin/provenance, account login, write/sync, second-client receipt, offline restart and hardware BACK need measured evidence. Record SHA256, Android/WebView version and real trust result; browser fixtures cannot stand in for those checks.

### Feasible commands for root to execute

These are suggested commands; this research did not execute validation.

```sh
./hako npm run api:check
./hako npm run test:contracts
./hako npm run test:server-sync
./hako npm run server:test
node scripts/smoke-server-restore.mjs --help
# Requires the current-source luna-api:local image and Docker access:
npm run smoke:server-restore
# Requires current production Web output and the project-supported browser toolchain:
LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/server-account.spec.ts --project=chrome
```

For public HTTPS, a separate driver/fixture must use the deployed same-origin API with a disposable administrator-created account and real storage; the existing account test is a useful UI-selector reference, not an external-server harness. For physical Android, use a dedicated bounded driver; the emulator smoke's safety refusal is intentional.

### Related specs and code patterns

- `.trellis/spec/frontend/android-runtime.md:36–40,83–84,107`: SQLite OPFS when available; explicit native IndexedDB adapter when unavailable; actual APK regression required.
- `.trellis/spec/frontend/web-host-and-validation.md`: strict ordinary Web OPFS, native-only compatibility selection, production offline and residual human gates.
- `src/web/main.ts:17–20`: native Android capability check chooses `safeIndexedDB()` only when OPFS is missing.
- `.trellis/spec/backend/http-api-guidelines.md:14,18,36`: transactional SQLite metadata, isolated test databases, single-instance writer mutex.
- `.trellis/spec/backend/deployment-and-recovery.md`: complete data boundary, stopped/consistent snapshot, restored login/decryption/two-device merge, exact-label cleanup.
- `.trellis/workflow.md`: parent owns final cross-child integration; child archives do not imply parent acceptance.

### External references / versions

No external sources needed or consulted. Repository `package.json` pins Electron 44.0.0, Playwright 1.63.0, SQLite-WASM 3.53.0-build1, better-sqlite3 13.0.3, Fastify 5.12.3, and Node >=22.18.0. These are declared versions, not runtime measurements from this research.

## Caveats / Not Found

- This report establishes evidence locations and contradictions, not fresh test success. Concurrent implementation/check work may change line numbers or expand coverage.
- No reviewed code can establish human visual approval, screen-reader usability, macOS/Windows operation, or physical-device success without actual corresponding verification.
- Do not weaken the literal SQLite-only acceptance silently. Existing current specs already document Android compatibility; root should record its relationship to the older stricter PRD explicitly and preserve any unresolved user requirement.
- No project code, specs, task metadata, archived reports, remote services, or devices were changed by this investigation.
