# Directory Structure

> Main-process and persistence boundaries in the desktop client.

## Directory Layout

```text
src/
├── main.ts                 # Electron lifecycle and window policy
├── preload.ts              # contextBridge-only renderer API
├── main/
│   ├── ipc.ts              # typed channel handlers and sender checks
│   ├── app-paths.ts        # startup-time local data directory resolution
│   ├── store.ts            # private SQLite schema and LocalStore adapter
│   ├── settings-store.ts   # strict settings decode and atomic private writes
│   ├── secret-store.ts     # safeStorage/session-only secret boundary
│   ├── config-crypto.ts    # versioned authenticated config envelope
│   ├── config-sync.ts      # portable merge and bounded retry coordinator
│   ├── s3-config-store.ts  # conditional S3-compatible GET/PUT adapter
│   └── *.test.ts           # isolated persistence/crypto/sync contracts
├── shared/
│   ├── api.ts              # renderer-facing API shape
│   ├── domain.ts           # platform-free types, decoders, invariants
│   ├── settings.ts         # local/portable schema and safe projection
│   ├── config-crypto.ts    # strict envelope format and size limits
│   ├── ipc.ts              # channel names
│   ├── ports.ts            # adapter seams
│   └── domain.test.ts      # pure domain tests
└── renderer/               # static HTML, DOM renderer, and CSS
scripts/smoke-electron.ts   # made-artifact behavior smoke
```

## Module Organization

- Put business invariants and serializable DTOs in `src/shared/`.
- Put Electron, filesystem, native SQLite, and lifecycle code in `src/main/`
  or `src/main.ts`.
- Keep startup-time local directory selection and legacy migration in
  `src/main/app-paths.ts`; it must resolve the active directory before opening
  SQLite or creating settings/secrets.
- Put the minimal bridge in `src/preload.ts`; keep channel implementations in
  `src/main/ipc.ts`.
- Keep config crypto and object-store code independent from the SQLite ledger;
  config sync must never upload transactions, budgets, paths, device IDs, or
  local secret material.
- Portable ledger/settings orchestration and browser-compatible S3 adapters
  live in `src/sync/`; Web storage lives in `src/web/`. Shared native-WebCrypto
  ledger encryption and portable settings encryption remain free of Node and
  Electron imports. OPFS is not an implemented persistence adapter.

## Naming Conventions

Use `camelCase` for TypeScript symbols and fields, `snake_case` only at the SQL
boundary, and descriptive `*.test.ts` names next to the module they verify.
Name ports after capabilities (`LocalStore`, `CryptoProvider`, `ObjectStore`)
and use use-case-shaped methods rather than generic database verbs.

## Examples

- [src/main/store.ts](/home/wkyuu/cargo/repo/34-luna/src/main/store.ts) owns
  rows and converts them to domain objects.
- [src/main/ipc.ts](/home/wkyuu/cargo/repo/34-luna/src/main/ipc.ts) owns the
  Electron boundary.
- [src/shared/domain.ts](/home/wkyuu/cargo/repo/34-luna/src/shared/domain.ts)
  is safe to exercise without Electron or SQLite.
