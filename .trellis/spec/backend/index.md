# Backend Development Guidelines

These rules describe the Electron main process, local SQLite ledger, versioned
settings, safe local secret handling, and encrypted portable-settings sync.
Ledger/transaction sync implements the 2026-09-05 delivery goal with shared
causal revisions, explicit financial conflicts, tombstones, client encryption
and conditional remote writes. Browser, MinIO, packaged Electron and Android
emulator checks passed; physical-device coverage remains separate.
Independent production security review remains a
separate assurance boundary; never claim an audit from automated tests.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [HTTP API and Generated Client](./http-api-guidelines.md) | Fastify/SQLite account and encrypted-object contracts, CAS, SDK generation | Current |
| [Deployment and Recovery](./deployment-and-recovery.md) | Single Compose, data-folder initialization, MinIO, backup and recovery | Current |
| [Directory Structure](./directory-structure.md) | Main, shared, preload, and persistence boundaries | Current |
| [Database Guidelines](./database-guidelines.md) | Schema, integer money, migrations, and atomic writes | Current |
| [Error Handling](./error-handling.md) | Domain, IPC, and safe renderer errors | Current |
| [Portable Settings and Config Sync](./config-sync-guidelines.md) | Versioned settings, secret isolation, encrypted S3 conditions, merge, and tests | Current |
| [Ledger Sync](./ledger-sync-guidelines.md) | Causal graph, conflicts, tombstones, encrypted session transport | Current |
| [Quality Guidelines](./quality-guidelines.md) | Required checks and forbidden patterns | Current |
| [Logging Guidelines](./logging-guidelines.md) | Sanitized diagnostics and smoke markers | Current |

## Boundary Summary

`src/shared/` owns validation, portable WebCrypto and serializable contracts.
`src/sync/` owns portable ledger transport/orchestration. `src/main/` owns
SQLite, settings files, safeStorage, crypto, and the S3-compatible adapter.
`src/main/ipc.ts` exposes only the operations in `src/shared/api.ts`, and
`src/preload.ts` exposes those operations through `contextBridge`. No renderer
code may access SQL, filesystem primitives, AWS SDK objects, credential
projections, device IDs, ETags, or local paths. User-entered secrets are passed
through narrow configuration/backup APIs, never reflected into attributes or
persisted by the renderer. Ledger history DTOs are permitted for backup and
conflict flows; these contain financial revisions but no secret configuration.
