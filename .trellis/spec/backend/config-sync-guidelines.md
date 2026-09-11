# Portable Settings and Config Sync

## Scenario: Encrypted portable-settings sync

### 1. Scope / Trigger

Use this contract whenever changing `src/shared/settings.ts`, settings IPC,
`SettingsStore`, `SecretStore`, config crypto, the S3-compatible adapter, or
the host capability projection consumed by the Web adapter. It covers only
portable application settings. Ledger rows, budgets,
attachments, device identity, local paths, credentials, passphrases, ETags,
and session reveal state are outside the remote payload.

### 2. Signatures

Renderer-facing API:

```typescript
getSettings(): Promise<RendererSettings>;
updateSettings(input: SettingsUpdateInput): Promise<RendererSettings>;
configureConfigSync(input: ConfigureConfigSyncInput): Promise<RendererSettings>;
testConfigSync(): Promise<ConfigSyncActionResult>;
syncConfigNow(): Promise<ConfigSyncActionResult>;
clearConfigSync(): Promise<RendererSettings>;
```

The renderer projection carries `configSyncAvailable: true` on Electron, Web
and Android. Web/Android accept credentials only into explicitly configured
memory-only sessions; secret persistence is not a browser capability.
`src/sync/config-service.ts` owns the shared lifecycle; Electron injects native
crypto/safeStorage, Web injects SQLite-WASM/OPFS and session-only secret ports.

Named-provider conformance command:

```text
npm run smoke:config-sync:provider
```

For the repository-local provider run, use the bounded wrapper instead:

```text
npm run smoke:config-sync:minio
```

It starts the pinned loopback-only MinIO service from `compose.minio.yaml`,
passes safe test credentials only to the child process, creates a random bucket,
runs the production conformance command, and removes the exact test object and
temporary service in `finally`.

Portable object-store contract:

```typescript
get(key: string, signal?: AbortSignal): Promise<{ body: Uint8Array; etag: string }>;
put(
  key: string,
  body: Uint8Array,
  condition: { ifNoneMatch?: true; ifMatch?: string },
  signal?: AbortSignal,
): Promise<{ etag: string }>;
```

Exactly one write condition is required. First creation uses
`ifNoneMatch: true`; replacement uses the ETag returned by the immediately
preceding GET as `ifMatch`.

### 3. Contracts

- Local file: `<active-data-directory>/settings.json`, schema version 1, strict
  fields, private atomic write, stable local `deviceId`, local sync policy,
  connection, internal ETag/status, and revisioned portable settings.
- Remote plaintext: `{ schemaVersion: 1, portable }`; it contains only
  revisioned `locale` and `hideSensitiveAmountsByDefault` plus preserved
  unknown remote fields. Revisions contain `value` and `updatedAt`, never a
  device identifier.
- Renderer projection: locale, privacy default, local sync switch, non-secret
  connection, safe status code/time, secret presence, and persistence class.
  It omits revisions, device ID, ETag, paths, and all plaintext secrets.
- Local secrets: access key, secret key, optional session token, and sync
  passphrase. Persist only through async Electron `safeStorage`; Linux
  `basic_text`, unavailable storage, and encryption failure are session-only.
  Browser/Android sessions never persist credentials, even if an API caller
  supplies `rememberSecrets:true`; UI disables this option unless protected
  host storage is available. Reload/restart clears the session.
- Remote envelope: `luna-config-envelope` v1, strict size/field/base64 limits,
  scrypt parameters bound into AAD, AES-256-GCM with random 16-byte salt,
  12-byte IV, and 16-byte tag.
  The existing `<prefix>/config/v1/settings.enc.json` protocol is preserved.
  Node retains native scrypt; Web/Android use pinned `@noble/hashes` scryptAsync
  and native WebCrypto. Default N131072/r8/p1/maxmem256MiB, approximately128MiB
  working table plus buffers; validate this cost in actual WebView.
  Never silently rewrite old data to the separate ledger encryption format.
- Master switch: `syncAllPortableSettings === false` performs zero object-store
  GET/PUT and never deletes the existing remote object.
  Disable/clear/reconfigure cancel in-flight requests and invalidate late local
  commits. Portable KDF checks AbortSignal cooperatively; Node KDF completion
  is followed by guards before effects. One run times out after60s.
- Persistence port `mutateSettings(change, signal?)` merges fields against the
  latest state inside the IDB transaction or serialized file update. File
  cancellation checks before final rename; IDB cancellation aborts before
  transaction completion. Never replace settings using a pre-GET snapshot.
  Compare latest fields after PUT before reporting synced; intervening edits
  retry. Configure/clear epochs and serialized secret writes prevent late
  credential saves from resurrecting a cleared connection.
- Configure, sync, clear and online retry preserve financial drafts, observed
  transaction/budget versions and the active settings disclosure. Clear only
  submitted secrets, not unrelated financial input.
- Provider-smoke environment: require provider name/version, endpoint, region,
  bucket, access key, secret key, test passphrase, exact `true|false`
  path-style mode, and exact-object-write acknowledgement. Session token and
  base prefix are optional. Values pass the production connection/credential
  decoders; provider labels are bounded printable ASCII. Connection and
  credential values scanned out of ciphertext must each contain at least eight
  characters so a match is meaningful rather than a likely random substring.
- Provider-smoke isolation: create two `SettingsStore` instances under
  separate temporary directories, use the production `ConfigSyncService`,
  config crypto, and S3 adapter, and address only
  `<optional-prefix>/luna-config-conformance/<random-uuid>/config/v1/settings.enc.json`.
  Cleanup may delete and verify absence of that exact key only. It must run in
  `finally`; bucket listing, broad-prefix deletion, and bucket deletion are
  forbidden.

### 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Malformed/future local settings | Preserve corrupt evidence; atomically create safe private defaults |
| Missing connection or secrets | Stable `missing-connection` / `missing-secrets`; no remote request |
| Linux `basic_text` or safeStorage failure | Keep plaintext only in memory; report session-only/unavailable |
| Wrong passphrase, tag/AAD failure, or tamper | `wrong-password-or-tampered`; do not apply partial settings |
| Future/invalid envelope or payload | `unsupported-version` / `invalid-remote-config`; preserve local settings |
| Oversized envelope/body/plaintext | Reject before expensive KDF or unbounded buffering |
| S3 401/signature error | `authentication` |
| S3 403 | `permission` |
| S3 409/412 or concurrent-delete 404 | Re-read, merge, and retry at most three attempts |
| Network/429/5xx | Bounded exponential retry, then stable network/transient status |
| Renderer-visible failure | Reject only as `LUNA_ERROR:<stable-code>`; no SDK/path/payload detail |
| Missing/malformed provider-smoke environment or acknowledgement | Fail before creating a remote client or object; print bounded stage/code only |
| Provider-smoke assertion failure | Run exact-key cleanup in `finally`; do not print credentials, endpoint details, payloads, or raw SDK errors |
| Provider-smoke cleanup failure | Fail the smoke with `cleanup-failed`; never widen cleanup to a prefix or bucket |
| Web/Android reload after configuration | Preferences retained, secrets absent; require session reconnection |
| Local edit during GET/KDF/PUT | Merge latest fields; retry before synced acknowledgement |
| Disable/clear while pending | No late merge/upload/synced result; master switch remains local |

### 5. Good/Base/Bad Cases

- Good: two clients modify different portable fields, decrypt, merge each
  field by monotonic revision, conditionally PUT, and converge idempotently.
- Base: no remote object exists; upload the encrypted local portable payload
  with `If-None-Match: *` and retain the returned ETag only in local main state.
- Bad: upload `settings.json`, include a device ID/credential/ETag in remote
  JSON, persist plaintext because safeStorage is unavailable, or perform a GET
  while the master switch is off.
- Provider good: an externally prepared, dedicated test bucket yields two
  isolated-client restore/merge, no rewrite on repeated sync, zero GET/PUT
  while disabled, forbidden-value-free ciphertext, exact operation counts,
  and `cleanup=deleted`.
- Provider bad: embed test credentials in source or shell history, reuse one
  settings directory for both clients, print a raw exception, or clean up with
  bucket/prefix deletion.
- Web good: preferences commit in SQLite-WASM/OPFS; an explicit session exchanges
  compatible ciphertext without storing credentials in browser state.
- Web bad: import Node/safeStorage in the bundle, cache a secret-bearing DTO,
  or claim the master switch alone provisions a connection.

### 6. Tests Required

- Shared: strict defaults/decoder, secret-free renderer projection, remote
  field set, unknown-field round trip, deterministic/monotonic merge, CNY and
  locale precision.
- Persistence: `0o600`, temporary-file rename, reopen, corrupt evidence, and
  stable replacement identity.
- Secret store: protected bytes only, re-encryption, unavailable and thrown
  safeStorage paths, Linux `basic_text`, and clear.
- Crypto: round trip, fixed limits/KDF/AAD/salt/IV/tag, wrong passphrase,
  bit-flip tamper, malformed base64, future version, and oversized inputs.
- Sync: two independent stores, repeated restore/merge, zero calls when off,
  conditional-create race, ETag conflict, transient retry, and local retention
  on failure.
- Runtime adapter: signed GET plus conditional PUT against a controlled
  protocol endpoint.
- Named provider: run `npm run smoke:config-sync:provider` only against an
  externally prepared isolated endpoint. Assert every portable field and
  revision restores, merge order is deterministic, repeated sync preserves
  bytes/ETag without PUT, disabled sync and connection test add zero GET/PUT,
  remote bytes omit credentials/passphrase/connection/local paths/device IDs/
  portable plaintext, counts are `get=8` and `put=2`, and exact UUID-scoped
  cleanup reports `deleted` on success and is still attempted from `finally`
  after an earlier assertion fails.
- Web host: production Playwright proves Node v1→browser restore, browser
  v1→Node decode, a second browser, actual signed CORS/conditional PUT,
  disabled zero I/O, no persisted credentials and financial drafts retained.
- Race regressions: delayed GET, local edit during PUT, disable/clear before
  late response, protected secret save racing clear, abort before file rename.
- Packaged smoke: settings IPC/restart, CNY/zh-CN, summary-only masking with
  detail amounts intentionally visible, CSP/navigation/permission denial and
  real default crypto. Android default-KDF interoperability is a separate
  installed-APK gate, not inferred from desktop Chrome.

### 7. Wrong vs Correct

#### Wrong

```typescript
await s3.put('settings.json', Buffer.from(JSON.stringify(localSettings)));
```

This leaks device-local state and secrets, has no authenticated encryption,
and silently overwrites concurrent changes.

#### Correct

```typescript
if (!settings.syncAllPortableSettings) return disabledResult;
const latest = await settingsStore.mutateSettings(current => ({ ...current,
  portable: mergePortableSettings(current.portable, remote.portable) }), signal);
const encrypted = await encryptRemoteConfig({ ...remote, portable: latest.portable }, passphrase);
await store.put(key, encrypted, { ifMatch: remoteEtag });
```

Decode and size-check every boundary around this flow; on conflict, re-read and
retry within the bounded sync service rather than issuing an unconditional PUT.
The abbreviated example also requires disable/connection guards and a latest-
state comparison after PUT before acknowledging synchronization.

For provider cleanup, the corresponding correct boundary is one exact
`DeleteObjectCommand({ Bucket, Key: uuidScopedKey })` guarded by UUID/suffix
validation and followed by an exact-key absence check. Never substitute a
bucket listing or recursive/prefix deletion.
