# D deployment foundation evidence — 2026-09-08

This is the historical foundation checkpoint. Final completed automated checks
and assurance boundaries are in [final-validation.md](final-validation.md).

## Scope and ownership

Main explicitly dispatched independent D preparation while B/C work. Changed
Dockerfile/Android COPY allowlists, added Dockerfile.server, full Compose,
deploy configuration/secret initializer/operations guide, and isolated restore
smoke. Main later explicitly assigned MainActivity.java hardware-back bridge
and scripts/smoke-android.ts assertions. No final native package gate has run.
No production service, existing C fixture database, or user port4173 was changed.

## Passed checkpoints

- `docker build -f Dockerfile.server -t luna-api:release-validation .` passed.
  API image ID `sha256:e20570eaed24b2b4056a4ac09442b2988bd2e2c2917eaa23f904104493540094`.
  Compiled admin command works in runtime. Runtime prune removed707 packages;
  smoke verifies Electron/SQLite/TypeScript/React/AWS SDK cannot resolve.
- `docker build -t luna-web:release-validation .` passed, including current
  API-client imports and strict external stylesheet. This is a moving-source
  image checkpoint, not final B/C browser acceptance.
- `docker compose config --quiet` and Node syntax checks for
  `scripts/smoke-server-restore.mjs`, `deploy/init-secrets.mjs`, and
  `deploy/restore-fixture.cjs` passed.
- Focused strict Android smoke TypeScript check passed with its existing global
  declaration included:
  `./hako npx tsc --noEmit --strict --exactOptionalPropertyTypes --moduleResolution Bundler --module ESNext --target ES2022 --esModuleInterop --skipLibCheck scripts/smoke-android.ts src/renderer/electron.d.ts`.
  The first narrowed invocation omitted that global declaration and reported
  missing Window.lunaLedger; including the existing declaration fixed the
  invocation without source changes or relaxed typing. Owned source/config
  whitespace checks passed. Java/native compilation still has not run.
- Actual Compose startup in unique project using new file secrets and isolated
  database volume passed. Report `/tmp/luna-compose-validation-uIyxDw/report.json`
  and `compose-state.jsonl` show migration completion before API/Web readiness.
  Secret initializer refuses overwrites, directory0700/files0444; API can read
  mounted file secret. No API/DB host ports, Web loopback ephemeral port only.
  The temporary Compose project and its volume were removed afterward.
- Exact `postgres:17.11-bookworm` tag was pulled and resolved to
  `sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0`,
  matching actual PostgreSQL17.11 used in the test.
- Final label-filtered Docker container/volume/network listings were empty:
  every resource created by restore runs was cleaned; reports/dumps remain
  private under the listed `/tmp` directories.

## Backup/restore smoke

```sh
LUNA_RESTORE_API_IMAGE=luna-api:release-validation LUNA_RESTORE_WEB_IMAGE=luna-web:release-validation node scripts/smoke-server-restore.mjs
```

First successful report: `/tmp/luna-server-restore-pGz2x5/report.json`.
Expanded database-outage report: `/tmp/luna-server-restore-vjG61J/report.json`.
Final foundation report including changed-IP API recreation:
`/tmp/luna-server-restore-BM9BSZ/report.json` (all seven checks passed).
Its Web image ID is `sha256:4b3bb57716afe95e34848294867e83e6239d37955bc15cc61f8ee16bd5353c42`.
Each directory is private and retains only a synthetic dump and report; image IDs,
PostgreSQL version and dump SHA256 are in the report. Containers, volumes and
networks are uniquely labeled and the script validates ownership before removal.

Proved with real HTTP and separate fresh PostgreSQL:

1. Idle API SIGTERM exits0 (not an in-flight graceful-drain claim).
2. pg_dump/custom pg_restore retains stable instance ID, password login, bearer
   session digest, exact ciphertext bytes, ETag and idempotency replay.
3. Portable shared client crypto decrypts restored graph. Two independent
   authenticated HTTP clients race with old ETag: second gets412, downloads,
   decrypts/merges both independent records and conditionally uploads. Both
   records and original history survive.
4. Actual DB stop makes readiness return sanitized503 while liveness remains200;
   DB restart recovers the committed ciphertext.
5. Real Nginx serves declared SPA deep links; unknown routes/missing JS/API
   return404 without app shell. Authenticated object proxy preserves bytes and
   no-store. Oversized session request gets413/no-store.
6. Runtime dependency exclusions are checked inside the actual API image.
7. API is removed/recreated, its released IP is occupied by a fixture container,
   and Nginx re-resolves the new IP without Web restart; original object remains
   authenticated and readable.

This does not use browser profile orchestration or claim private deployment,
physical devices, real TLS, or final UI acceptance.

## Failure found and fixed

A fresh named-volume run exposed `pg_isready` over Unix socket accepting the
PostgreSQL temporary initialization server before TCP was ready. Migration then
returned LUNA_ADMIN_FAILED. Compose and smoke now explicitly probe TCP127.0.0.1;
expanded restore/outage run passed after the fix. Failed disposable resources
were cleaned. Nginx also now re-resolves Docker DNS so replacing an API container
does not permanently strand Web on the old address; a focused recreation check
is included in the final smoke source.

## Android source prepared, final native validation pending

MainActivity installs a lifecycle-owned AndroidX OnBackPressedCallback. Only
bundled `https://localhost` receives the fixed cancellable
`luna:navigate-back` event. preventDefault consumes back; unhandled/untrusted or
not-ready WebView invokes the native dispatcher with this callback temporarily
disabled. No generic JavaScript bridge or new plugin dependency exists.

Android smoke sends actual KEYCODE_BACK, handles a reported open IME first,
checks menu child→menu→home, category→entry, dirty discard cancel/accept/focus,
then native home fallback and reopening saved data. Root owns the shared shell
event listener and its browser tests. Java compilation and emulator assertions
wait for root's final A/B/C and production-Web gate.

## Remaining final gate

Rebuild both images after C source stabilizes, rerun restore smoke and full
production Web suite, then Electron and Android package/smoke gates. Review
actual packaged visuals, native directories/file picker, screen reader and
physical/private deployment behavior separately. Do not mark parent completion
or commit/archive from these foundation checkpoints.
