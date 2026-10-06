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

### 生成与开发命令

从仓库根运行，Node >=22.18；`./hako` 提供 Node 22。`npm run api:generate` 创建
不监听网络的 Fastify app 和内存 SQLite，导出按键排序的 OpenAPI 3.0.3 route schemas，
再用固定 Hey API 0.99.0 生成 SDK 与 TanStack Query options。它们是实际运行时消费者。
`npm run api:check` 在新临时目录生成并比较 contract 和完整 SDK 树，包括未跟踪文件。

```text
./hako npm run api:generate
./hako npm run api:check
./hako npm run test:contracts
./hako npm run server:typecheck
./hako npm run server:build
./hako npm run server:test
./hako npm run db:migrate
./hako npm run server:admin -- create-account
./hako npm run server:admin -- reset-password
./hako npm run server:admin -- cleanup
./hako npm run server:start
```

`db:migrate` 显式初始化/核验所选服务端 SQLite；`server:start` 需要先 build。
账号创建/重置需要 TTY 隐藏输入，cleanup 包括过期会话、幂等记录、30 日前事件及
附件孤儿协调。`server:test` 只使用隔离内存/文件 SQLite 和注入的 object-store fixture。
生产 Compose 的初始化、内部 MinIO 和管理入口见[部署与恢复](deployment-and-recovery.md)。

API prefix /api/v1: meta, auth/sessions, auth/me, auth/session, ledgers,
ledgers/{id}/object, ledgers/{id}/attachments/{attachmentId} and
preferences/object. Health paths /healthz and /readyz are outside the version
prefix. contracts/openapi.json owns exact HTTP fields and operationIds; authored
route schemas are its source.

## 3. Contracts

Server configuration uses `LUNA_DATA_DIR`, `LUNA_DATABASE_FILE`, the server-only
`LUNA_RUNTIME_CONFIG_FILE`, `LUNA_ALLOWED_ORIGINS`, `LUNA_HOST` and `LUNA_PORT`.
非 Compose 的默认 host/port 是 `127.0.0.1:3000`；origin 列表是精确的逗号分隔值。
生产入口只记录 request ID、route template、status、duration 和 bytes；app factory
除非显式注入 logger 否则无日志。账本 envelope 限制 12MiB，preferences 1MiB，
最多四个并行上传、两个活跃 scrypt 作业/八个排队作业、每账号 100 个活跃会话，
默认 token 绝对寿命 12 小时。登录限流按 IP 和规范化账号/IP，仍是单实例边界。
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

### 生成器兼容与客户端运行时

Generated files are not manually edited. Hey 0.99.0 的 bundled fetch runtime 会给可选
字段显式传 `undefined`，不满足 `exactOptionalPropertyTypes`。生成步骤只把 upstream
`client/`、`core/` 以该选项关闭的 strict TypeScript 编译为 JS/declarations，删除其
TS 源并规范化尾随空白。SDK、DTO、Query options 和 application 保留根 strict
设置。输出属于可重复生成树，不手改，也不要求 Vite 前另行 build 或使用陈旧 SDK。
版本兼容只在确定性生成步骤与 `api:check` 中处理。

`src/api-client/runtime/client.ts` 为每个 session 建立独立 bearer client，在生成器
JSON parsing 前限制实际 decoded response bytes。保留完整 ETag/status、条件与
幂等头及 AbortSignal；需要精确 envelope bytes 时用 `parseAs: 'text'`，transport
adapter 必须把仍声明 JSON DTO 的运行时值收窄为 string。重建已消费/解压的 response
时，把 `Content-Length` 改为 decoded bytes 长度，不能删除；binary adapter 据此
识别截断或多余字节。

Financial envelopes、密码和 token 不进入 Query cache。`accountQueries` 只封装安全
账号/session/ledger 元数据并按 instance/user/generation 标记；token 通过 client auth
callback 传递，不放 Query options headers，因为生成的 query key 会包含这些 headers。
API 使用 shared public crypto decoder 验证外层并保存 raw bytes，从不解密。注入的
object-store seam 在生产 Compose 是 pinned 内部 MinIO，在单测是内存 adapter，
不把 S3 凭据给客户端。单实例 writer mutex 的授权/CAS/撤销顺序以上述当前 Contracts
为准。本规范不自行宣称生产安全审计、实体设备或跨设备 HTTPS 验收；证据在对应 task。

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
