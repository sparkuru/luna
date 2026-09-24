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

API prefix /api/v1: meta, auth/sessions, auth/me, auth/session, ledgers,
ledgers/{id}/object, ledgers/{id}/attachments/{attachmentId} and
preferences/object. Health paths /healthz and /readyz are outside the version
prefix. contracts/openapi.json owns exact HTTP fields and operationIds; authored
route schemas are its source.

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

Attachment PUT and repair requests must hash the received ciphertext bytes and
compare that digest with `X-Luna-Cipher-SHA256` before creating or changing a
database reservation. The object is published only after the immutable object
write and the database publication both succeed. Attachment GET/HEAD verifies
the physical object's length and digest against SQLite before returning it, and
browser CORS responses expose `X-Luna-Cipher-SHA256` and `Content-Length` while
preflight allows the attachment's conditional, idempotency and digest headers.

Server schema v3 records exact attachment orphan generations. An expired or
canceled reservation must first fence its token, then record the exact physical
key for delayed reconciliation; cleanup retains the tombstone after a delete so
a late upload of the same old generation is removed on a later sweep and can
never affect a newer generation. The admin cleanup command runs this reconcile.
Same actor/scope/key idempotency requests are serialized before object
publication within the single-instance process, while final publish and repair
authorization is rechecked after any writer-mutex wait.

The object store retains exact envelope bytes; SQLite stores only object key,
ETag, SHA-256, byte length and version metadata. The server validates the outer
envelope and actual byte limits; the client still decrypts and validates
financial history. Ledger and portable preferences have separate objects,
crypto schemas, limits and acknowledgements. API data is no-store and never a
service-worker cache entry.

Use a flat base64 alphabet/padding schema check followed by the shared canonical decoder. Repeated-group regexes can exhaust the Node/V8 stack on valid maximum-size ciphertext. Keep an actual maximum-size PUT/GET roundtrip and lock-wait expiry regression, in addition to invalid and oversized input tests.

Generated files are not manually edited. Version-specific generator compatibility belongs in deterministic, tested generation steps and api:check. Keep exactOptionalPropertyTypes and strict checking for authored code. The HTTP runtime must preserve ETag/status/AbortSignal and bound actual response bytes before JSON parsing. If a bounded fetch rebuilds a response after consuming/decompressing it, it must replace `Content-Length` with the decoded byte length rather than deleting it; binary adapters use that header to detect truncation or extra bytes.

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
| Attachment body/digest mismatch | 400, no reservation or repair publication |
| Missing/corrupt published attachment object | Retryable 503, no ciphertext response |
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
roundtrip, invalid/oversized envelopes, attachment digest/reservation/repair
boundaries, session revoke/reset and transaction failure. Generated SDK must be
used against an actual HTTP listener, with the object-store boundary tested by
both memory and MinIO-backed fixtures. At least one browser-origin test must
exercise the generated attachment client through real CORS headers and read
back the decrypted bytes after a second client restores them.

Runtime tests check response size with misleading/missing Content-Length, abort propagation, raw envelope mode, ETag/412 and header forwarding. Generation checks compare all emitted paths and content. Root strict typecheck remains required; a passing server-only build does not prove SDK compatibility with the frontend compiler.

## 7. Wrong vs Correct

Wrong: retry by PUT without If-Match, or set Query retry=true around a sync loop that already retries.

Correct: the sync coordinator owns bounded retry, uses the original condition/idempotency key for response uncertainty, and re-downloads/merges on 412 before encrypting a new candidate. Local SQLite-WASM/native SQLite Query operations use `networkMode: always`; remote HTTP queries have separate online/error rules.

## Scenario: strong ETags through a public TLS edge

### 1. Scope / Trigger

This applies when `/api/v1/ledgers/{id}/object` or
`/api/v1/preferences/object` is served through a reverse proxy or CDN.
Both APIs use an opaque, quoted, **strong** ETag as the compare-and-swap
validator. A physical Android WebView once received a weak ETag after edge
gzip compression; every update then failed with 412 despite successful GETs.

### 2. Signatures

- Object GET: `ETag: "<opaque-version>"` and `Cache-Control: no-store, no-transform`.
- First object PUT: `If-None-Match: *` plus `Idempotency-Key`.
- Update PUT: `If-Match: "<exact-GET-version>"` plus `Idempotency-Key`.
- Both direct Fastify API and `deploy/nginx.conf` Web gateway emit
  `Cache-Control: no-store, no-transform` for API responses.

### 3. Contracts

The edge must not compress or otherwise transform an encrypted object response
in a way that weakens its ETag. Preserve `ETag`, `Cache-Control` and the API's
`Access-Control-Expose-Headers` through TLS termination. The Web gateway
forwards the exact API path and does not cache API data. Android's WebView
origin is `https://localhost`; include it as an exact `LUNA_ALLOWED_ORIGINS`
entry when that package is expected to use the public API. `no-store` still
forbids caching; `no-transform` prevents representation changes at compliant
intermediaries. The two directives serve different purposes.

### 4. Validation & Error Matrix

| Observed condition | Expected result |
| --- | --- |
| GET strong ETag and unchanged representation | Update with that exact `If-Match` may succeed. |
| GET `W/"..."` or missing ETag | Deployment acceptance fails; never strip `W/` or issue unconditional PUT. |
| Genuine concurrent update | 412, then bounded re-download, merge and retry. |
| Repeated 412 caused by a weak ETag | Stop after bounded attempts with pending local state; repair the edge before declaring sync healthy. |

### 5. Good / Base / Bad Cases

- Good: an Android WebView GET through the public domain returns an uncompressed
  ciphertext body and strong ETag; its conditional PUT succeeds, and another
  device restores the new transaction.
- Base: a direct loopback API check also returns the same strong ETag; this
  does not by itself validate the public edge.
- Bad: a gzip response carries `W/"..."`, which the client copies into
  `If-Match` and the server rejects with 412 on every retry.

### 6. Tests Required

Assert direct API and packaged Web gateway `Cache-Control` headers. For a
public-route release, inspect the same encrypted-object GET from the actual
browser and Android WebView, including `ETag` and `Content-Encoding`, then
create a local edit, observe conditional PUT success, and restore it on a
second device. Exercise preferences object CAS over that route when its sync
is in scope. Do not log bearer tokens, passwords, or encrypted bodies.

### 7. Wrong vs Correct

Wrong: remove the `W/` prefix, send `If-Match: *`, or accept a Node request
with `Accept-Encoding: identity` as proof that the WebView path works.

Correct: prevent edge transformation with `no-store, no-transform`, verify
the strong validator in the actual client, and keep the server's strict
conditional write. Cloudflare documents this `no-transform` behavior in its
[compression reference](https://developers.cloudflare.com/speed/optimization/content/compression/).
