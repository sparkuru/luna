# 远端部署与浏览器验收证据

日期：2026-09-10（Asia/Singapore）

## Target and isolation

- Target: `wkyuu@192.168.9.3`，Debian 12，Docker Engine
  `20.10.24+dfsg1`，Docker Compose `1.29.2`。
- Remote staging directory: `/tmp/luna-remote-deploy.jzhnoM`。
- Compose project: `luna-web-deploy-20260910`。
- Published endpoint: `127.0.0.1:18080` only；browser validation used a temporary
  local SSH tunnel `18180 -> 127.0.0.1:18080`，验证结束后 tunnel 已关闭。
- Deployment staging audit found no `.env`，credential/key files，`node_modules`，
  `.git`，Trellis metadata or test files. The remote `.env` was generated in place
  with mode 0600 and was not copied back to the local workspace.
- Existing remote containers and non-Luna ports were not restarted or modified.

## Local quality baseline

All commands ran successfully through the repository's `./hako` Docker wrapper unless
noted otherwise:

- `./hako npm run typecheck`
- `./hako npm run server:typecheck`
- `./hako npm test` — 156/156
- `./hako npm run server:test` — 18/18
- `./hako npm run test:server-sync` — 7/7
- `./hako npm run test:contracts` — 4/4
- `./hako npm run api:check` — `LUNA_API_REPRODUCIBLE`
- `./hako npm run web:build`
- Production Vite preview + Playwright route/offline/storage/update suite — 12/12

The production browser run covered both desktop and `375x800` projects. A temporary
remote browser smoke also saved `/tmp/luna-remote-web-smoke.png` for visual inspection;
it showed no horizontal overflow or blocked primary action at the narrow viewport.

The final post-deployment rerun of the full Web command inside `hako` attempted 64
tests but every case stopped before test setup because that disposable image does
not contain the configured Chrome channel at `/opt/google/chrome/chrome`; it did
not produce an application assertion failure. The required production subset was
then rerun with the host-installed Chrome and passed 12/12 across `chrome` and
`chrome-narrow` (offline shell/storage, two-tab writes, deep links, and update
behavior). This environment limitation is retained as evidence rather than
silently treating the 64 launch failures as a product result.

## Remote build and runtime

- `docker-compose -p luna-web-deploy-20260910 config --quiet` passed on the target.
- API and Web images built with the target's classic Docker builder; Compose startup
  completed for `instance-init`, `minio`, `api`, and `web`.
- `/healthz`, internal API `/readyz`, `/api/v1/meta`, the root page, setup/ledger
  deep-links, and all ledger menu routes returned expected success responses.
- Web response headers retained `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, COOP, COEP, CSP, and API cache policy.
- The deployed API returned `apiVersion=1` and a stable installation identity
  `7800b646-121f-4311-8ef3-b49778165d9c`.
- A random temporary account completed production password hashing, login (`201`) and
  authenticated current-user lookup. The browser then created a local workspace and
  record, connected the local ledger, and uploaded/read an encrypted object; no
  financial plaintext was sent to the API.
- After stopping and starting only this project's `api` and `minio` services (without
  `down -v`), both API/Web returned healthy, the installation identity remained stable,
  the account remained present, one authorized ledger remained listed, and its object
  remained readable (`1321` response bytes).
- A byte/file-count comparison of MinIO's internal directory was intentionally not used
  as a persistence invariant: its internal file layout changed from 25 to 13 files
  across restart while the API-level authorized object and metadata remained intact.
- Log scan completed as `logs-secret-scan-ok`; no authorization header, password,
  S3 credential, runtime path, or ciphertext/plaintext pattern appeared in recent
  Compose logs.
- Final container hardening: API and Web are non-root, read-only, `cap_drop=ALL`,
  `no-new-privileges`; MinIO is now also `user=1000:1000`, read-only, `cap_drop=ALL`,
  with writable `/tmp` tmpfs and `/data` bind mount. Host listening state is only
  `127.0.0.1:18080` for this project.

## Fixes discovered during real deployment

1. Removed redundant root-level `name: luna` from `compose.yaml`; Compose v1.29.2
   rejects it, while explicit `-p` preserves deterministic project naming on both
   Compose generations.
2. Expanded the root Docker allowlist for classic builders to include the server
   Dockerfile, `tsconfig.server.json`, `src/server`, and the runtime packaging script.
   The server-specific ignore file remains available for builders that support it.
3. Corrected the remote staging command to preserve `src/`, `deploy/`, and `scripts/`
   directory prefixes; the initial flat staging was repaired inside the isolated temp
   directory before any build succeeded.
4. Made the Web image healthcheck clear inherited HTTP proxy variables before probing
   `127.0.0.1:8080`; the target injects a proxy environment that otherwise caused a
   false `502` health result for a healthy Nginx process.
5. Hardened MinIO with read-only rootfs, a bounded `/tmp` tmpfs, and `cap_drop: ALL`.

The local owner-only synthetic credential and one-shot browser script were removed after
validation. The authorized remote temporary project/data directory was intentionally
left in place for later inspection or manual stop/restart.

## Break-the-loop analysis

### Root cause categories

- **A — Missing spec:** the deployment contract did not state that Compose
  1.29.x rejects a root `name:` field, that the classic builder still applies
  the root `.dockerignore`, or that an inherited HTTP proxy can falsify a
  loopback healthcheck.
- **D — Test coverage gap:** local type/build/test checks did not exercise the
  target's exact Compose binary, classic Docker builder, proxy environment,
  or MinIO read-only startup boundary together.
- **E — Implicit assumption:** the first staging command assumed directory
  prefixes were retained and the first persistence probe treated MinIO's
  internal file count as a stable invariant; both assumptions were invalid.

### Why the first attempts failed

1. The root `name: luna` was valid for newer Compose semantics but blocked the
   target's Compose 1.29.2 parser; explicit `-p` is portable and deterministic.
2. The root Docker ignore rules excluded server build inputs despite the
   server-specific ignore file; the root allowlist was expanded and the exact
   target builder rebuilt successfully.
3. The staging command flattened source directories; the isolated staging tree
   was repaired before build and the evidence now requires prefix-preserving
   transfers.
4. Web was healthy at HTTP level but its container probe inherited the target
   proxy and received 502; the probe now unsets proxy variables before local
   access.
5. MinIO's internal file layout changed across restart, so raw file count was
   rejected as a persistence invariant; authorized API-level metadata and
   encrypted-object readability are the durable assertions.

### Prevention mechanisms

| Priority | Mechanism | Specific action | Status |
|---|---|---|---|
| P0 | Documentation | Keep the Compose-version, build-context, proxy-healthcheck, and MinIO sandbox rules in the deployment spec. | DONE |
| P0 | Integration validation | Run config/build/start with the exact target Compose binary and builder before claiming deployment success. | DONE |
| P0 | Runtime assertions | Check container health, loopback publishing, security options, and API-level object recovery after restart. | DONE |
| P1 | Transfer audit | Audit remote relative paths and exclude secrets, dependencies, tests, and project metadata before `up --build`. | DONE |

### Systematic expansion

- **Similar issues:** any future service with a Dockerfile-specific ignore file,
  localhost healthcheck, or internal storage format needs the same target-level
  validation; raw implementation files are not portable storage proofs.
- **Design improvement:** retain explicit project naming and loopback-only
  publication as the deployment default; make proxy-safe health probes and
  service hardening part of the Compose source rather than an operator tweak.
- **Process improvement:** stage by an allowlist with preserved prefixes,
  validate config before building, and treat remote builder/runtime behavior as
  a separate evidence layer from local tests.

### Knowledge capture

- Updated `.trellis/spec/backend/deployment-and-recovery.md` with the durable
  compatibility, healthcheck, sandbox, and validation contracts.
- No `src/templates/markdown/spec` mirror exists in this repository, so no
  fictitious template copy was created.
