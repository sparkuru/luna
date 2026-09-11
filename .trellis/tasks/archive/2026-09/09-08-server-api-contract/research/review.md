# A independent review — 2026-09-08

Reviewed the approved parent design and A task/check context against the actual Fastify handlers, PostgreSQL authorization/locking and idempotency operations, envelope schemas, generated-client runtime, CLI/lifecycle, and integration tests. Renderer work was outside this review; no package/lock/root config changes were made.

## Findings fixed

1. `src/server/schemas/http.ts`: the repeated-group base64 regex threw `RangeError` on an 11,000,000-character valid base64 value in the actual Node 22 container. Replaced it with a flat alphabet/padding check; the shared decoder continues to enforce canonical base64 and exact decoded limits. Regenerated OpenAPI/SDK through `api:generate`. Added a real PostgreSQL PUT/GET roundtrip at the maximum 8 MiB + 16-byte ciphertext size.
2. `src/server/auth.ts`: PostgreSQL `now()` reflects transaction start, so a session that expires while the request waits for the user lock could still authorize. Changed the session predicate to `clock_timestamp()`. The regression observes an actual authorization lock wait, expires the session after that wait begins, releases the lock, and asserts 401 with the original object ETag intact. Existing revocation and rollback assertions remain.
3. `tests/contracts/runtime.test.ts`: prior abort coverage only checked signal forwarding, and overflow used a synthetic dishonest Content-Length. Added a listening HTTP fixture with no Content-Length to prove chunked overflow rejection and cancellation after response headers while the body remains unfinished.

## Verification performed by reviewer

- `./hako env LUNA_TEST_DATABASE_URL=<isolated fixture URL> npm run server:test`: **17/17 pass**, actual PostgreSQL 17 task container. Tests use synthetic accounts, not production data.
- `./hako npm run test:contracts`: **4/4 pass**, including real HTTP chunked/abort coverage.
- `./hako npm run api:generate`: pass; generated files were not manually edited.
- `./hako npm run api:check`: pass, `LUNA_API_REPRODUCIBLE`.
- `./hako npm run server:typecheck`: pass.
- `./hako npm run server:build`: pass.
- `./hako npm run typecheck`: pass at this review checkpoint; concurrent frontend implementation will require its own final gate.
- Authored A files pass the installed Prettier `--check` (server, runtime, tests, server tsconfig). The repository has no lint script/config; a lint pass is not claimed.

No unresolved A behavior defect was identified in this review. This does not certify production security or complete C/D integration, deployment, profile migration, native hosts, or user interface acceptance. Main should preserve the clock-after-lock and maximum-valid-size cases in the HTTP spec and future regression gates.
