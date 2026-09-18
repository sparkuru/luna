# Ledger Sync Contract

Status: graph, transactional storage, encryption, transport and shared renderer
implemented; local browser, MinIO, Electron-package and Android-bridge checks
are recorded in the active task validation (2026-09-12). Physical-device,
emulator and independent security review remain separate.
This is independent of the existing portable-settings-only S3 service.

## Shared document and causality

`src/shared/ledger-sync.ts` owns a versioned plaintext document which is encrypted
before remote storage. Document v1 has immutable `workspace` metadata and a set
of revisions. Each revision has an opaque unique ID, entity kind (`transaction`
or `budget`), entity ID, parent revision IDs, and a domain-decoded value.
Transaction values retain deletion tombstones; budget values are minor-unit
strings or null, keyed by local month. No credentials, paths, or local secret
settings may enter this document.

Merge is set union, independent of delivery order and duplicate downloads.
Identical IDs with different content, missing/cyclic/cross-entity parents,
incompatible schemas, invalid financial values, and workspace mismatches reject
the entire candidate before persistence. Inputs and graph sizes are bounded.
One entity head is effective; multiple heads require an explicit conflict.
Timestamp or numeric transaction revision must never choose a financial winner.

Conflicted transactions are excluded from totals until resolution; the UI must
display that exclusion and all candidates in a conflict inbox. A conflicted
budget has no effective limit and is also shown as unresolved. A resolution
adds a revision with all current heads as parents; compare the expected head
set inside the local transaction and reject stale decisions. Never erase losing
history, acknowledge uncommitted state, or resurrect an ancestor tombstone by
replaying an old operation.

Seed migration creates deterministic workspace-scoped revision IDs for local
transactions/budgets. Once a graph exists it is authoritative, and each local
financial mutation commits its graph revision atomically with its projection.
Do not re-seed from a stale snapshot on each sync.

## Transport and verification direction

Persist locally first. Manual sync and a bounded online retry may only run when
the user has explicitly enabled and configured sync. Encrypt/decode outside
the local DB transaction; commit merged document/projection in one transaction
and retry against the latest local state if edits occurred while downloading.
Remote S3 conditional writes guard concurrent clients; after precondition
failure re-download/merge/re-encrypt with bounded retries. No plaintext relay.
Protocol/crypto/provider errors preserve the last valid local state.

Shared graph tests cover order-independent union, concurrent edits/deletes,
workspace boundaries, tombstone replay, stale resolution, and graph validation.
Actual completion additionally requires browser/Android/Electron integration,
two-client S3 encrypted transport, offline edits/reconnect, UI conflicts and
meaningful failure tests. Graph unit tests alone do not prove sync delivery.

## Scenario: encrypted ledger backup and session sync

### 1. Scope / Trigger

Any change to ledger graph schema, local migration, backups, credentials,
remote transport, or renderer-facing sync actions must preserve these contracts.
Portable-settings sync remains a separate protocol and connection.

### 2. Signatures

`LunaLedgerApi` exposes async `getLedgerDocument`, `mergeLedgerDocument`,
`getLedgerConflicts`, `resolveLedgerConflict(LedgerConflictChoice)`,
`getLedgerSyncStatus`, `configureLedgerSync(ConfigureConfigSyncInput)`,
`syncLedgerNow`, `clearLedgerSync`, `exportLedgerBackup(password): string`,
and `importLedgerBackup(raw,password): void` (all results are promises).
`LedgerConflictChoice` contains kind, entityId, selectedHeadId and the complete
expectedHeadIds. The host copies the selected validated candidate and advances
the transaction revision; the UI never supplies an arbitrary replacement value.

`AppSnapshot.budgetHeadIds` contains all heads of the budget source actually
effective for the selected month (exact month or latest inherited month), or
`[]` when no source exists. `setMonthlyBudget(month,budgetMinor,expectedHeadIds?)`
compares this complete set inside the native SQLite or SQLite-WASM write
transaction. The optional
argument preserves internal compatibility only: UI callers always supply the
set captured when the budget value was rendered. Draft-preserving sync/locale/
privacy refreshes retain that original token. Changed heads reject with
`ledger-stale-budget`; a conflicted budget still requires explicit resolution.

SQLite schema5 adds singleton `ledger_graph(singleton=1,document_json)`,
attachment/blob staging, per-target remote payload checkpoints and a durable
per-profile migration lease; constructor migration seeds existing
active/deleted records and budget history once. Existing financial tables
become transactional projections. Browser state v4 is
`{schemaVersion:4,settings,ledger,attachments,remotePayloadVersions}`; its
IndexedDB compatibility adapter is database version2. Validated legacy bytes
remain intact until a successful mutation commits the current state. The old
localStorage migration source is never overwritten.

### 3. Contracts

- `src/shared/ledger-crypto.ts` uses native WebCrypto, without Node/SDK imports.
  Envelope format `luna-ledger-envelope`, version1, payloadSchemaVersion1;
  PBKDF2-SHA256 exactly600000 iterations, random16-byte salt, AES256-GCM,
  random12-byte IV,128-bit tag. Strict canonical base64 stores ciphertext with
  tag. All metadata is authenticated in fixed-order UTF8 JSON AAD.
- Passwords: at least12 Unicode codepoints, at most1024 UTF8 bytes; no trim,
  normalization, truncation or unmatched surrogates. Derived keys cannot be
  exported. Temporary byte buffers are cleared best-effort; JavaScript cannot
  guarantee complete secret-memory erasure.
- Plaintext graph <=8MiB, encrypted JSON <=12MiB. Reject unknown envelope
  versions/parameters and oversized content before KDF. Downloads count actual
  streamed bytes and cancel on overflow; Content-Length is not sufficient.
- `src/sync/` owns the portable AWS SDK transport and session orchestration;
  Web/Android use the browser runtime, Electron uses it in main only. The
  renderer never receives an SDK client, credential projection or local path.
- Credentials are session-only; `rememberSecrets` must be false. HTTPS is
  required except exact localhost/127.0.0.1/[::1] test endpoints. Sync requires
  explicit configuration; disabled sync makes zero remote calls. Clearing
  aborts in-flight work and prevents late responses from applying locally.
  `LedgerDataPort.mergeLedgerDocument(input, signal?: AbortSignal)` propagates
  cancellation to the local SQLite commit boundary, including an already queued
  transaction. Check before/after opening the database, attach an abort listener
  to the transaction, and resolve only on `complete`. A check after `await merge`
  alone cannot prevent a late write. SQLite merges synchronously in one turn.
- Remote key is normalized prefix + `/ledger-v1.enc.json` (no leading slash
  for empty prefix). GET retains quoted ETag; PUT always uses `IfNoneMatch:*`
  or fetched `IfMatch`.409/412 and concurrent-delete404 retry read/decrypt/merge
  at most4 rounds. SDK retries are disabled. One operation times out in60s.
- Merge occurs against the latest committed graph inside the local transaction.
  After PUT, compare the committed graph again; edits made during encryption
  or upload trigger another round. Exhaustion returns `pending`, not `synced`.
  Status reads compare the last synchronized document with current local state:
  an offline mutation changes `synced` to `pending` without remote I/O.
- A valid remote graph may commit locally before upload subsequently fails;
  the UI must refresh its snapshot even on a sync failure, preserving drafts.
- Snapshots include conflictCount; unresolved financial conflicts are visibly
  flagged above totals. Backup import is merge/adopt-only, never destructive
  replacement, and cannot combine independently created workspace identities.
- A v2 attachment inventory is the union of every historical transaction
  revision, not only effective heads. Attachment ciphertext is verified by
  exact descriptor, length, SHA-256 and GCM before local promotion or remote
  graph publication. Profile migration copies available source ciphertexts
  into the inactive destination before activation, then re-reads source graph
  state and refuses activation if the source changed or verification failed.
- Each local ledger target stores a highest observed remote payload version.
  The checkpoint is scoped by target identity, never decreases, and makes a
  later v1 response fail after v2 has been observed; a new target starts
  independently. HTTP server capabilities and its durable minimum version are
  the stronger server-side gate.
- A profile migration acquires a durable `MigrationLease` in the source
  profile before copying data. Financial graph, attachment, restore and
  checkpoint writes reject an active lease with `LUNA_ERROR:migration-locked`;
  reads remain available. The migration renews the lease during long copies,
  verifies the original source snapshot before activation, and releases the
  lease after the destination has been activated. Expired leases are
  recoverable and may be replaced by a new migration.

### 4. Validation & Error Matrix

| Condition | Result / preserved state |
| --- | --- |
| Invalid graph/parents/cycle/revision collision | reject whole candidate; old graph untouched |
| Workspace mismatch | `ledger-workspace-mismatch`; no replacement |
| Changed expected resolution heads | `ledger-stale-heads`; choice not applied |
| Changed observed budget source heads | `ledger-stale-budget`; no write, financial draft retained |
| Unsupported envelope | `ledger-unsupported-envelope`; no KDF or writes |
| Malformed/oversized envelope | `ledger-invalid-envelope`; no KDF or writes |
| Password/AAD/cipher authentication failure | `ledger-wrong-password-or-tampered`; no plaintext applied |
| HTTP403 | permission failure, never absence/create |
| Missing ETag/oversized stream | invalid response; never unconditional PUT |
| Local disk/IDB failure | entire graph/projection transaction rolls back |
| Active profile migration lease | `LUNA_ERROR:migration-locked`; reads remain available and no local write is committed |
| Disconnect while IDB open/queued/write pending | `ledger-sync-cancelled`; abort before commit, prior state intact |

### 5. Good/Base/Bad Cases

Good: offline edits on two devices form two heads, preserve both and require
an explicit candidate choice. Base: empty device decrypts and adopts an existing
workspace. Bad: treating authentication failure as a missing remote object,
re-seeding each sync, or using updatedAt to choose a financial winner.

### 6. Tests Required

`ledger-sync.test.ts`: graph laws/limits; `ledger-crypto.test.ts`: independent
Node cipher interoperability, malformed-before-KDF and authenticated tamper;
`ledger-store.test.ts`/`web-api.test.ts`: migration/merge/conflict/rollback;
`ledger-service.test.ts`: real encryption with fake CAS contention, edits during
KDF/PUT, abort and failures; `s3-ledger-store.test.ts`: actual signed SDK HTTP
and conditions, streamed limits and forbidden insecure configuration.
Browser Playwright must additionally exercise actual SDK CORS and WebCrypto,
two IDB clients, offline edits, UI choice and retained drafts. Named-provider
and APK runtime evidence are separate from a controlled S3 protocol fixture.
Cancellation regressions must cover pre-aborted input, delayed database open,
queued transactions and cancellation after `put` but before transaction complete.

### 7. Wrong vs Correct

Wrong: `await remote.put(key, encrypt(cachedLocal), {})` followed by marking all
local changes synced. Correct: fetch+decrypt, transactionally union latest local,
encrypt, conditional PUT, then compare local again before reporting synced.

### Design decision: portable native cryptography

PBKDF2 is chosen for native WebCrypto support across Node/browser/WebView, not
because it is memory-hard or preferable to Argon2id. The fixed work factor is
grounded in [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html);
AES-GCM byte/tag behavior follows [WebCrypto](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/#aes-gcm-operations).
Conditional writes follow [AWS S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).
Authenticated encryption cannot detect server rollback for a brand-new client;
existing clients retain and union known history. Independent security review
and durable trusted anti-rollback checkpoints remain separate assurances.

## Scenario: account profiles and encrypted HTTP sync

### 1. Scope / Trigger

Changes to `ServerHost`, profile repositories, HTTP transport or account IPC.

### 2. Signatures

`LunaLedgerApi.server` exposes the typed `LunaServerApi` contract in
`src/shared/server-api.ts`. `LocalProfile.bind(document,binding,signal)` commits
graph and binding together; `readDurable()` independently reads committed state.
`ServerHost.dispose()` drains operations and closes all opened native profiles.

### 3. Contracts

`legacy-local` remains the original database. New profile IDs derive from
validated server instance and user UUIDs. New browser profiles disable legacy
import explicitly; new native profiles create separate SQLite/settings files.
Bindings contain only origin and opaque IDs. Tokens and encryption passphrases
remain in memory and never cross Electron IPC in returned projections.

Login does not create a ledger, upload data or change the active profile. It
retains an explicitly configured S3 ledger source so subsequent migration can
confirm that source. Connect checks the returned S3 status; anything other than
`synced` requires the explicit local-only migration choice. Profile switching
and logout cancel sessions and keep local copies accessible.

Transitions freeze new local dispatch and drain accepted calls before swapping
profiles. Current-session 401 clears authentication and remote sessions; a late
401 from an older account cannot clear its replacement. Account identity, not
the generation captured when its client was created, is the validity boundary.
A successful
captured local mutation still returns its committed receipt after authentication
changes. Stale read projections must be rejected, never presented as current.

Migration acquires a durable source-profile lease, preserves revision graphs,
verifies a downloaded/decrypted upload, atomically binds, rereads durable
destination state and checks source stability before activation. The lease has
a bounded TTL and is renewed during long attachment copies; expiry is fail-safe
because the next write clears only an expired lease before proceeding. Failure
retains the source and recoverable destination.
Cross-tab notifications contain a profile ID only and invalidate matching views.
HTTP preference sessions keep their enabled/status state separate from legacy
S3 settings acknowledgements and from ledger synchronization.

Injected browser fetch must be invoked as a plain function. Capture it from
the host into a local variable before adding response/401 handling; calling
`this.fetcher(...)` supplies a `ServerHost` receiver that native Window fetch
rejects with `Illegal invocation`, even though Node tests may pass.

### 4. Validation / Error Matrix

| Condition | Required outcome |
|---|---|
| S3 configured before account login, source sync fails | Migration rejects `server-source-unconfirmed` unless explicit local-only choice |
| Current bearer expires during successful local commit | Clear remote session; preserve successful local receipt |
| Superseded login/401 or cancelled binding | No activation or replacement-account invalidation |
| Binding write fails | Graph and metadata transaction rolls back together |
| Wrong workspace/passphrase | Source and active profile remain unchanged |
| Restart | Active local profile opens; account and remote sessions are absent |

### 5. Good / Base / Bad Cases

Good: copy the original causal graph, verify durable data, then activate. Base:
continue local editing while logged out. Bad: clearing S3 before login and then
mistaking its disabled status for proof that migration has no remote source.

### 6. Tests Required

`tests/server-sync/*.test.ts` uses SQLite API listeners, injected object stores and
generated HTTP clients for two-client conflict/merge, lost-response idempotency,
revocation, migration and transition regressions. Migration tests exercise a
second browser adapter attempting a source write while attachment ciphertext is
being copied. `src/web/profile-host.test.ts` and native profile tests exercise
atomic binding, independent reads and late-import cancellation. Real browser
profile/UI tests and packaged native gates remain separate requirements.

### 7. Wrong vs Correct

Wrong: reject every completed local call solely because auth generation changed.
Correct: preserve the committed mutation receipt while invalidating stale reads
and requiring renewed authentication before any further remote operation.

## Scenario: active-session refresh and remote-change notification

### 1. Scope / Trigger

This contract applies when the Web/Android renderer must survive a normal reload,
notice another device's upload, or update a stale snapshot after an explicit
sync. It is a cross-layer contract because the browser host, API marker route,
sync service and renderer all participate.

### 2. Signatures

`GET /api/v1/ledgers/{id}/object/status` requires the bearer session and ledger
authorization and returns `{ etag: string, version: number, updatedAt: string }`.
Missing objects return the existing `object-not-found` 404. The endpoint never
returns the encrypted body, S3 credentials or a renderer-facing write token.

`SessionVault` exposes `load()`, `save(record)` and `clear()`. The Web
implementation prefers a same-origin `SharedWorker` memory bridge and mirrors
the record to tab-scoped `sessionStorage` so a normal page reload survives the
worker's lifetime gap. The record may contain the active account token, ledger
passphrase and host-only remote marker; it must never use `localStorage`,
IndexedDB, SQLite or a file, and it must not survive closing the browser tab.

`ServerHost.checkRemoteNow()` performs one marker probe. While a Web host is
alive it schedules a five-second foreground-friendly probe; `setNotifications`
may add cross-tab invalidation but is not required for the probe to run.

### 3. Contracts

- A normal Web reload may restore the account and bound ledger session from the
  tab-scoped session vault, so login and unlock are not repeated. Closing the
  browser tab, an unavailable/blocked session store, an expired/revoked token,
  or a runtime that cannot keep either session transport must fall back to
  login/unlock. This tab-scoped convenience must not become an app-data or
  long-term credential store.
- A marker change in `automatic` mode schedules the normal encrypted
  GET/decrypt/merge/conditional-write flow. A marker change in `manual` mode
  updates only the host marker and exposes `sync.remoteChangeAvailable = true`;
  it must not download or merge the remote body until the user clicks sync.
- An explicit sync clears `remoteChangeAvailable` only when the ledger session
  returns `code: "synced"`. `pending`, failure and cancellation retain the
  warning and local data.
- After any successful sync or committed local mutation, the renderer refreshes
  its current profile snapshot/settings/status. Refreshing must not replay a
  committed write or replace an active form draft.
- The sync status and an action that opens `/settings/sync` are visible from
  the main shell. Mobile layout must keep these controls within the viewport,
  with touch targets of at least 44 CSS pixels and accessible labels.
- WebSocket is optional, not a correctness dependency. The server marker poll
  is the baseline because it works through ordinary HTTPS/API deployments and
  keeps server push state out of the encrypted ledger protocol.

### 4. Validation & Error Matrix

| Condition | Required outcome |
|---|---|
| SharedWorker unavailable or closed | Use tab-scoped session storage when available; otherwise require explicit re-login/re-unlock and never persist the secret in durable app data |
| Marker endpoint returns authorized marker | Compare host-only marker; never expose ETag/version to renderer |
| Marker changes in automatic mode | Schedule one coalesced encrypted sync and refresh after completion |
| Marker changes in manual mode | Set `remoteChangeAvailable`; do not call body GET until explicit sync |
| Sync returns `pending`/failure/cancelled | Keep local graph and pending warning; do not acknowledge the marker as synced |
| Host disposed | Cancel probe/sync timers and do not reschedule them |
| Current account receives 401 after profile transitions | Invalidate that account by object identity; an older account response cannot invalidate its replacement |

### 5. Good/Base/Bad Cases

Good: Android uploads a revision, Web's marker probe notices it, automatic mode
pulls and merges it, then the renderer refreshes the list. Base: manual mode
shows “remote changes available” until the user explicitly synchronizes. Bad:
reporting “sync succeeded” while keeping a stale React snapshot, or making a
WebSocket connection the only way to discover a changed object.

### 6. Tests Required

`src/web/profile-host.test.ts` must cover volatile session restoration and a
manual marker change. Server API tests must assert the status response fields,
authorization and no encrypted body. `tests/server-sync/*.test.ts` must retain
the post-transition 401 invalidation regression. Browser Playwright must cover
normal reload without a second login/unlock and narrow-viewport overflow. A
manual two-device check should record the Android upload, Web marker/sync status,
and the resulting refreshed transaction list.

### 7. Wrong vs Correct

#### Wrong

```typescript
await server.sync();
// React keeps the old snapshot until the next unrelated navigation.
```

#### Correct

```typescript
const result = await server.sync();
if (result.sync.code === "synced") await refreshCurrentProfile();
```

The host may use a marker poll for discovery, but only the normal encrypted
sync path may acknowledge the marker and publish the new local projection.
