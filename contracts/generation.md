# Luna HTTP contract and generated client

`npm run api:generate` constructs the Fastify app without listening or connecting
to a network database, exports sorted OpenAPI 3.0.3 from its schemas, and runs pinned
Hey API 0.99.0. The generated SDK and TanStack Query options are actual runtime
consumers, not illustrative interfaces. `npm run api:check` regenerates in a
fresh temporary directory and compares the contract and every generated file,
including files not tracked by Git.

Hey 0.99.0's bundled fetch runtime passes explicit `undefined` to optional fields
and fails `exactOptionalPropertyTypes`. The generation pipeline therefore
compiles only upstream `client/` and `core/` to JavaScript plus declarations,
using strict TypeScript with that one option disabled. These emitted files are
part of the reproducible generated tree. SDK, HTTP DTOs, Query options and all
application source retain the root strict settings. No generated file is edited
by hand; generation rebuilds the runtime from Hey's source every time. No build
step or stale local SDK output is needed before Vite runs.

`src/api-client/runtime/client.ts` supplies a separate bearer client per session
and bounds decoded response bytes before generated parsing. Calls retain the
complete response (ETag/status), conditional and idempotency headers, and abort
signals. Use `parseAs: 'text'` when exact envelope bytes matter; the generator's
static DTO type still describes JSON, so the transport adapter must narrow the
runtime value to string. Financial envelopes, passwords and tokens must not
enter Query cache. `accountQueries` only wraps safe account/session/ledger
metadata with instance/user/generation tags. Pass tokens through the client auth
callback, never headers in Query options (generated keys include supplied
headers).

The API stores raw envelope bytes and validates the existing shared public
crypto decoders; it never decrypts. Write transactions lock the user exclusively
before session/ledger/object checks, while reads use shared authorization locks.
This intentionally serializes writes per account, including first object and
idempotency creates. It trades parallel throughput within an account for a
simple, tested revocation/CAS order. Every response is sent after COMMIT.

Run backend commands with Node >=22.18 (`./hako` uses Node22):

- `npm run server:typecheck`, `npm run server:build`
- `npm run db:migrate` (explicitly initialize or verify the server SQLite file)
- `npm run server:admin -- create-account` or `reset-password` (TTY hidden input)
- `npm run server:admin -- cleanup` (expired sessions/idempotency and 30-day events)
- `npm run server:start` after building
- `npm run server:test` against isolated in-memory/file SQLite databases
- `npm run test:contracts`, `npm run api:check`

Runtime configuration: `LUNA_DATA_DIR` and `LUNA_DATABASE_FILE` select the
server SQLite file; `LUNA_RUNTIME_CONFIG_FILE` supplies the server-only S3
adapter configuration; `LUNA_ALLOWED_ORIGINS` is an exact comma-separated list;
`LUNA_HOST` defaults to loopback and `LUNA_PORT` to 3000. Production entrypoint
logs only request ID, route template, status, duration and bytes. The app factory
has no logger unless provided. Fixed protocol limits are 12MiB ledger envelope,
1MiB preference envelope, four in-flight uploads, two active scrypt jobs/eight
queued jobs, 100 live sessions, and 12-hour absolute token lifetime. Login rate
limits are per IP and normalized account/IP; deployment remains single-instance.

The API factory uses an injected object-store seam. Production Compose injects
the pinned internal MinIO adapter; unit tests use an in-memory adapter and do not
give S3 credentials to a client. This document does not claim a production
security audit, physical-device validation, or cross-device HTTPS evidence.
