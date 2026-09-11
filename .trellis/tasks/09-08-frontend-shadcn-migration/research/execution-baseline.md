# Execution baseline — 2026-09-08

User explicitly approved implementation: “明确开始实施”. A is active; A/B/C/D work is authorized. Planning-era pending language does not require repeated approval unless a material product change arises.

## Preserved workspace

Original status, source path list, sha256 manifest, source archive and package/lock/tsconfig/Vite copies are in /tmp/luna-fullstack-baseline. Original application source is mostly untracked, so git diff alone is not a valid implementation diff. Preserve unrelated source/spec/task changes.

## Actual validation

- Implement agent reported ./hako npm test: 143/143 passed before mutations; retain its final command evidence.
- Root ran focused existing Web baseline against task-owned http://127.0.0.1:4273: 10/10 passed (intuitive-ledger, privacy-and-web, accessibility, chrome project).
- Baseline screenshots: /tmp/luna-fullstack-baseline/home-desktop.png, entry-desktop.png, home-narrow.png; synthetic new browser profile only.
- Port 4173 already had a service. It was not stopped/reused. Task preview uses 4273.
- Host Node 20.19.2 is below project Node22 requirement. Builds use existing hako Node22 container.
- Host file-watcher limit is exhausted. CHOKIDAR_USEPOLLING=true runs Vite successfully without changing system limits.

## Test infrastructure

Docker works with task-specific escalated calls; ordinary sandbox cannot connect to the daemon. No permissions/configuration were loosened.

Task test container luna-fullstack-pg-0908: PostgreSQL17.11, image digest sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0. Data is tmpfs, no published ports, labels luna.task=frontend-shadcn-migration and luna.scope=integration-test, disposable --rm. Runtime internal IP is temporary and must be discovered, not committed as configuration. Credentials are synthetic fixtures, no production account/data. Root owns cleanup after all integration/restore checks.

hako does not currently pass host env variables into container or select a Docker network. For current tests use ./hako env NAME=value command, with fixture database URL inside the default Docker bridge. Production restore tests and final wrapper changes belong to D.

- Root ran ./hako npm run web:build: passed, Vite6.4.3,623 modules, initial main JS311.09kB (gzip101.66kB), renderer62.58kB (gzip18.67kB), CSS21.38kB.
- Root ran LUNA_TEST_PRODUCTION=1 LUNA_TEST_BASE_URL=http://127.0.0.1:4274 npm run test:web -- tests/e2e/offline-and-storage.spec.ts tests/e2e/offline-update.spec.ts --project=chrome:7/7 passed, including offline cold start, quota, corrupt state, stale draft, legacy import, simultaneous tabs and deferred SW updates.

## A/B implementation coordination

- A installed pinned backend and UI dependencies, then handed package.json/package-lock.json/root tsconfig ownership to B. A owns server/generated SDK/server configs/tests, B owns renderer/front-end build configs/tests. No concurrent shared-file edits permitted.
- B task activated after A0 SDK3/3 and initial real PG8/8 passed. Operational dependency was refined: B local UI can overlap A remaining verification; C integration still requires accepted A+B behavior.
- Root independently ran ./hako npm run test:contracts:3/3 passed. A concurrent api:check saw OpenAPI differs while A was changing route schemas; A must regenerate and recheck at stable handoff. Do not cite this intermediate check as passing.
- A reports later real PG10/10 including revocation lock ordering and induced database-trigger rollback. Independent check agent will verify the final state.
# Root integration checkpoint — React shell / A review

- A independent review accepted: PostgreSQL17/17, generated runtime4/4, root/server typecheck, server build and api:check. Fixed maximum-valid-base64 stack overflow and session expiry after lock wait; actual fixes inspected by root and recorded in backend/http-api-guidelines.md.
- Root captured React desktop/narrow home screenshots under /tmp/luna-fullstack-baseline/react-home-{desktop,narrow}.png; inspected narrow image, width375 has scrollWidth375. Original blue/light ledger-first hierarchy retained. This is an intermediate visual checkpoint, not final device review.
- Root added known-route offline shell mapping and tests/e2e/router-offline.spec.ts. Production web:build passed; new test1/1 passed against task preview4274 with LUNA_TEST_PRODUCTION=1. Direct budget route cold-open/reload works offline; API and missing asset requests fail rather than receiving cached shell. No API cache entries.
- Task-owned dev4273 restarted for Tailwind plugin; current exec session57928 (old13709 terminated). Preview4274 remains task-owned. Do not stop user4173.
- C activated after A acceptance for independent host/transport implementation while B completes behavior regression. Renderer integration remains gated on B acceptance; parent/C execution docs updated. No scope/product change.
