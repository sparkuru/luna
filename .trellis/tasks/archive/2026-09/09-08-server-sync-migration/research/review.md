# C independent host/transport review — 2026-09-08

Scope: sync coordinator/HTTP adapters, Web/SQLite profile repositories, typed
IPC and local cancellation/persistence boundaries. Renderer, deployment and
native packaging remain owned by the main session and their assigned workers.

## Fixed findings

1. `src/sync/server-host.ts`: login previously cleared a configured S3 source
   before connect inspected its status. Login now uses the existing preserve-S3
   transition path. It still freezes/drains accepted calls and does not create
   or select a financial target. Connect can require a successful source sync or
   the explicit local-only choice. The regression now configures failing S3
   behavior **before login**, including realistic clear behavior that would
   otherwise erase its status, and asserts no server ledger is created.
2. `src/sync/server-host.ts`: current-account 401 increments the generation;
   an already committed local mutation was therefore rejected as cancelled.
   Successful captured local mutations now return their actual receipt, while
   stale reads still reject. Deterministic regression delays the receipt after
   settings commit, invalidates the bearer through real HTTP/PG, then verifies
   the receipt succeeds and account is cleared.

Extended `tests/server-sync/transitions.test.ts` and documented the actual
profile/session contracts in backend `ledger-sync-guidelines.md`.

## Independent verification

- `./hako env LUNA_TEST_DATABASE_URL=<isolated-fixture> npm run test:server-sync`:
  **5/5 passed**, zero skips. This includes native durable-copy checks, two IDB
  profile clients, encrypted HTTP/preference lost-response recovery, conflicts,
  restart, expiry, 404 distinctions and transition races.
- `./hako npm run typecheck`: passed with the project's strict options.
- `./hako npm test`: **149/149 passed**, zero skips. Full log retained at
  `/tmp/luna-check-sync-unit.log`; concurrent root UI tests are included by the
  repository's existing test glob.
- No lint script is configured. Changed TypeScript files formatted with the
  installed Prettier; `git diff --check` passed. No new lint tooling installed.

The review also traced signal propagation into IDB transactions, atomic graph
and binding writes, fresh durable reads, native disposal and fixed typed IPC,
immutable HTTP retry bodies/keys, scoped late-401 suppression, and preference
status separation. Existing source tests cover queued/open/commit cancellation.

This is host/transport acceptance only: final production browser account flows,
real cross-tab behavior, packaged Electron/Android integration and human native
visual/device checks remain the main session's release gates. No commit/archive
or task-wide completion was performed.

## Browser follow-up: fetch receiver

The main session isolated a real Chrome failure after the 401 wrapper was added:
calling `holder.fetcher('/')` with native Window fetch throws `Illegal invocation`,
while capturing it in a local variable and calling that variable succeeds. This
is a browser WebIDL receiver contract that Node's fetch did not enforce.

Fixed `loginNow` to capture the injected fetcher and call it as a plain function
inside the scoped 401 wrapper. No blanket binding or custom fetch contract change.
Added a receiver-sensitive profile test exercising both metadata and login.
The UI worker was notified to rerun actual browser account integration after
the fix; that browser result is recorded by its owner/main session separately.

Follow-up checks: focused profile tests **5/5 passed**, strict root typecheck
passed, changed TypeScript Prettier check and `git diff --check` passed. The
earlier 149-test total predates this added regression; it is not a claim of a
new full-suite run.
