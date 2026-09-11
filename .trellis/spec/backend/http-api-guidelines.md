# HTTP API and generated client contracts

## 1. Scope / Trigger

Applies to `src/server`, `contracts/openapi.json`, `src/api-client` and
server/contract tests. This is the authenticated remote control plane used by
all local SQLite hosts. The server never receives a ledger passphrase or
computes plaintext financial totals. Implementation acceptance is recorded in
the active fullstack task, not inferred from this document.

## 2. Signatures

- createApp({database, objectStore?, origins?, sessionTtlSeconds?}) creates a Fastify app without listening.
- migrate(database) performs the versioned transactional SQLite metadata migration.
- createApiClient(baseUrl, tokenProvider?, fetcher?) creates an account-scoped generated HTTP client.
- npm run api:generate exports the route schemas and regenerates the SDK.
- npm run api:check regenerates in a temporary directory and compares complete contract/SDK output, including otherwise untracked files.
- npm run server:test uses isolated in-memory/file SQLite databases and an injected object-store fixture.

API prefix /api/v1: meta, auth/sessions, auth/me, auth/session, ledgers, ledgers/{id}/object and preferences/object. Health paths /healthz and /readyz are outside the version prefix. contracts/openapi.json owns exact HTTP fields and operationIds; authored route schemas are its source.

## 3. Contracts

Server configuration uses `LUNA_DATA_DIR`, `LUNA_DATABASE_FILE`, the server-only
`LUNA_RUNTIME_CONFIG_FILE`, `LUNA_ALLOWED_ORIGINS`, `LUNA_HOST` and `LUNA_PORT`.
Published production API requires HTTPS; local tests only allow exact loopback
exceptions by default. An explicit `LUNA_ALLOW_INSECURE_LAN=true` deployment
flag may additionally allow exact RFC1918 IPv4 HTTP origins for a trusted LAN;
it must not allow public or hostname-based HTTP origins. Credentials must not
appear in logs or committed examples.

Opaque bearer tokens are random and memory-only on clients. Database stores a token digest. Account-password scrypt is independent of existing ledger PBKDF2/AES-GCM. Login outputs must not enter Query/mutation cache. Electron authentication and transport stay in main, not renderer.

All object writes authorize the account inside the same serialized operation
that checks CAS, writes the injected object store and records metadata. The
single-instance implementation uses one async SQLite writer mutex; do not scale
the API horizontally without replacing this concurrency contract. Session
revocation participates in the same ordering.

Evaluate session expiry at authorization time, after waiting for the writer
mutex when a write is serialized. A session can expire while a request waits;
the request must then fail authorization.

First PUT requires If-None-Match: *, updates require If-Match. Idempotency-Key is mandatory for creation and object writes. Its scope includes actor/operation/target; its request hash also includes the original condition and exact body bytes. Same key+same request replays committed status/ETag; different input is rejected. Return success only after COMMIT. New merged/encrypted payload means a new key.

The object store retains exact envelope bytes; SQLite stores only object key,
ETag, SHA-256, byte length and version metadata. The server validates the outer
envelope and actual byte limits; the client still decrypts and validates
financial history. Ledger and portable preferences have separate objects,
crypto schemas, limits and acknowledgements. API data is no-store and never a
service-worker cache entry.

Use a flat base64 alphabet/padding schema check followed by the shared canonical decoder. Repeated-group regexes can exhaust the Node/V8 stack on valid maximum-size ciphertext. Keep an actual maximum-size PUT/GET roundtrip and lock-wait expiry regression, in addition to invalid and oversized input tests.

Generated files are not manually edited. Version-specific generator compatibility belongs in deterministic, tested generation steps and api:check. Keep exactOptionalPropertyTypes and strict checking for authored code. The HTTP runtime must preserve ETag/status/AbortSignal and bound actual response bytes before JSON parsing.

## 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Missing/expired/revoked bearer | 401, no write |
| Another account's ledger | 404, no data disclosure/write |
| Existing authorized space without object | object-not-found 404; not permission to create arbitrary spaces |
| Missing CAS condition | 428 |
| Both conditions or invalid condition shape | 400 |
| Stale ETag or competing initial insert | 412, prior object retained |
| Same idempotency key with different request | 409 |
| Oversized streamed request/response | Reject before applying/parsing beyond bound |
| Unsupported content type/compression | 415 |
| Login/rate capacity exhausted | 429 and bounded retry hint |
| Database failure | Sanitized unavailable response; no SQL/path/stack |

Errors contain code, requestId and retryable; localized user text is owned by the frontend. HTTP errors do not imply local ledger reads/writes failed.

## 5. Good / Base / Bad Cases

- Good: after a lost HTTP response, retry the exact key/body/condition and recover the committed ETag.
- Base: two initial writes compete; exactly one succeeds, the other gets 412.
- Bad: unconditional object upsert, reading owner outside the write transaction, or generating a fresh idempotency key on every network retry.

## 6. Tests Required

SQLite tests must cover two-account isolation, repeated migration, concurrent
first PUT through the writer mutex, same-key replay, stale ETag, raw-byte
roundtrip, invalid/oversized envelopes, session revoke/reset and transaction
failure. Generated SDK must be used against an actual HTTP listener, with the
object-store boundary tested by both memory and MinIO-backed fixtures.

Runtime tests check response size with misleading/missing Content-Length, abort propagation, raw envelope mode, ETag/412 and header forwarding. Generation checks compare all emitted paths and content. Root strict typecheck remains required; a passing server-only build does not prove SDK compatibility with the frontend compiler.

## 7. Wrong vs Correct

Wrong: retry by PUT without If-Match, or set Query retry=true around a sync loop that already retries.

Correct: the sync coordinator owns bounded retry, uses the original condition/idempotency key for response uncertainty, and re-downloads/merges on 412 before encrypting a new candidate. Local SQLite-WASM/native SQLite Query operations use `networkMode: always`; remote HTTP queries have separate online/error rules.
