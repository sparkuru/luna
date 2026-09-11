# Quality Guidelines

> Quality rules for the main process, native SQLite, and config-sync adapters.

## Overview

The backend is deliberately small: pure domain rules live in `src/shared/`,
the native implementation lives in `src/main/`, and the main process owns
Electron lifecycle and IPC registration. New code must preserve those
boundaries and pass strict TypeScript, unit/integration tests, packaging, and
the packaged smoke before a work commit.

## Forbidden Patterns

- Do not import `electron`, Node built-ins, or `better-sqlite3` from
  `src/shared/`; this keeps domain tests and future browser adapters portable.
- Do not expose `ipcRenderer`, a generic SQL endpoint, a database object, or a
  filesystem path to the renderer.
- Do not convert integer money strings to `number` or use floating-point
  arithmetic for financial values.
- Do not log or return passwords, root keys, credentials, SQL, database paths,
  or plaintext financial payloads.
- Do not silently swallow a failed write or acknowledge ledger pending
  operations; config sync is a separate portable-settings-only capability.
- Do not include credentials, passphrases, local paths, device IDs, ETags, or
  revision internals in remote payloads or renderer-safe projections.

## Required Patterns

- Run all external payloads through shared decoders and domain normalization.
- Use named prepared statements and short `database.transaction(...)` blocks
  for changes spanning a transaction, split, revision, tombstone, or pending
  operation.
- Keep native module packaging verified: Electron ABI rebuild, ASAR unpacking,
  and a real packaged executable smoke.
- Return safe domain-level errors at IPC and generic messages for unexpected
  implementation failures.
- Add a focused regression test for every persistence bug or boundary change.
- Reject oversized encrypted objects before KDF work and, where possible,
  before buffering the complete remote body.
- Treat Linux `basic_text`, unavailable async safeStorage, and encryption
  failures as session-only; never persist new plaintext secrets as fallback.

## Testing Requirements

The required local gate is:

```text
./hako npm run typecheck
./hako npm test
./hako npm run build
npm run make
npm run smoke:electron
```

Domain tests must not import Electron or SQLite. Store tests use isolated
temporary databases and cover migration, rollback, integer round-trip,
tombstones, budgets, and reopen. The smoke runs the packaged artifact and
checks the userData path, preload/IPC/settings round-trip, CNY/i18n, restart,
and summary-only amount mask (all DOM channels for those four values).
Transaction, budget and category details remain visible per current UX scope.
Config crypto/sync has unit and controlled
S3-protocol contract coverage. Browser OPFS, ledger sync, named-provider
conformance, and security review use separate gates and must not be represented
as passing backend unit tests. Named-provider evidence currently covers only
the fixed MinIO version and path recorded in the active task; broad S3/OSS
compatibility and security review remain deferred.

## Code Review Checklist

- [ ] Is the change in the correct layer, with shared code still platform-free?
- [ ] Are all IPC inputs decoded and the sender/frame checked?
- [ ] Are money values strings and split sums exact?
- [ ] Are multi-table writes atomic and tombstones excluded from summaries?
- [ ] Are native packaging and close/reopen paths tested?
- [ ] Do errors and diagnostics avoid secrets and financial payloads?
- [ ] Do typecheck, tests, build, make, and packaged smoke match the report?
