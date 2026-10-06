# Development and HTTPS Preview

- ownership: project-shared
- source: project-authored

## 1. Scope / Trigger

Read before changing the development wrapper, preview lifecycle, environment
keys, listener output or preview checks. This preview serves the offline Web
client using the existing `npm run web` Vite command and `docker/Dockerfile.web` dev stage.
Electron, Android and the production `compose.yaml` API/MinIO stack have their
own validation/deployment commands. Preview success does not accept those paths.

`preview.sh` forwards to `dev.sh`; `hako` owns Docker build/run arguments,
repository mounting, UID mapping and `.devhome` cache. Keep one implementation
of those arguments. Container HTTPS setup and health helpers live in
`scripts/preview-web.sh` and `scripts/preview-health.mjs`; the shared data-only
environment loader is `scripts/preview-config.sh`. Do not replace the production
`npm run web:preview` built-asset command's semantics.

## 2. Signatures and initial setup

Run from the repository root; script invocation also works from another cwd:

```sh
cp .env.example .env       # only when .env is absent
./preview.sh build
./hako npm install         # only when dependencies need installation/update
./preview.sh start         # ./preview.sh is equivalent
./preview.sh status
./preview.sh stop          # ./preview.sh down is equivalent
```

The local file is ignored; `.env.example` is the tracked, secret-free key
reference. Preserve an existing `.env`. Review all keys below during setup;
there are no account/password keys for this unauthenticated offline Web preview.
Remote sync login and production deployment credentials are separate inputs.

`build` explicitly prepares the configured development image from `docker/Dockerfile.web`
target `dev`. Rebuild after dev-stage/browser/toolchain changes or changing the
image. Dependency changes use `./hako npm install`; ordinary `start` does not
install, build, or run tests. The dev image provisions Google Chrome on amd64;
other architectures need a separately prepared compatible image.

### 常用开发与验证命令

项目要求 Node >=22.18，日常命令通过已经准备的 `hako` Node 22 容器执行，避免另设
宿主工具链。先完成上述 image/dependency setup；以下列表按变更范围选取，不能把
未执行的门禁记为通过：

```sh
./hako npm test
./hako npm run typecheck
./hako npm run server:typecheck
./hako npm run server:test
./hako npm run test:server-sync
./hako npm run server:build
./hako npm run api:check
./hako npm run web:build
./hako npm run test:web
```

`npm run web` 是现有 Vite 入口，本机用 `http://localhost:4173`；需要跨设备 LAN
预览时用上述 `./preview.sh` HTTPS lifecycle，按 ready summary 选择实际 URL 并在每台
测试设备接受临时自签名证书。普通 `http://<host-ip>:4173` 不提供 OPFS 安全上下文。
Playwright 需要准备好的 Chrome channel；其配置自管 loopback Vite 测试服务，不先
启动第二个服务器。生产 Web 的 COOP/COEP、Android SAH/旧 WebView IndexedDB
边界与完整浏览器门禁见[Web 规范](../frontend/web-host-and-validation.md)，APK 构建
见[Android 规范](../frontend/android-runtime.md)。本机测试不能替代真实设备、跨设备
证书或生产备份恢复，具体证据保留在对应 task。

服务端使用单实例 SQLite 元数据与服务端内部 AWS SDK/MinIO，设备只访问认证 HTTP
API，不新增明文财务 CRUD。生成/运行时细节见[HTTP API](../backend/http-api-guidelines.md#生成与开发命令)，
生产 `reset-password`/`cleanup` 和恢复步骤见[部署规范](../backend/deployment-and-recovery.md#管理与升级)。

## 3. Configuration and lifecycle contracts

| Root `.env` key | Purpose / constraint |
| --- | --- |
| `HAKO_IMAGE` | Prepared development image; example uses `luna-dev:node22-playwright-1.63.0` |
| `HAKO_BIND_HOST` | Docker published host bind; trusted-LAN preview example uses `0.0.0.0`; choose `127.0.0.1` for loopback |
| `WEB_HOST_PORT` | Published TCP port, `1..65535`, or `0` for Docker assignment; example `4173` |
| `WEB_CONTAINER_HOST` | Vite container listener, `0.0.0.0` for host publishing |
| `WEB_CONTAINER_PORT` | Vite listener port, `1..65535`; example `4173` |
| `WEB_LAN_HOST` | Optional explicit host IP/name for cross-device URLs; empty still enumerates host addresses |
| `PREVIEW_READY_TIMEOUT` | Positive readiness deadline in seconds; an in-flight bounded probe can finish just after it |

Preview uses root `.env` as primary configuration. A recognized exported value
overrides the file; CLI `--port` overrides `WEB_HOST_PORT`. The loader reads dotenv values as data, never `source`/`eval`, and does not
inject unrelated production keys into the container environment. The existing
development wrapper still mounts the repository at `/app`. `start/build`
require initial setup; `stop/status` inspect owned runtime state even without
`.env`. Keep `hako` usable for one-shot development commands without `.env`.
The supported syntax is single-line `KEY=value`, optional `export`, plain or
single/double-quoted values, comments and CRLF/LF line endings. Values are not
shell-expanded or interpolated; use literal preview settings.

- Run `start` detached, wait for HTTPS and required isolation evidence, report
  readiness, then return to the caller. Repeated start reuses the owned service.
  To apply changed configuration, stop then start; do not advertise new file
  values as the running container's configuration.
- Fail with an actionable prerequisite message when configuration, Docker,
  image or dependencies are unavailable. Never fall back to a host Vite process.
- `status` reports actual running/stopped state and health without starting;
  a healthy status uses the same unified summary as start;
  `build` builds without starting. `stop/down` are idempotent and stop only
  exact repository/scope/service-labeled preview containers. Never stop a
  production Compose stack, unrelated `hako` command, or host process by port.
  After `docker stop`, wait up to five seconds for each stopped `--rm` container
  to disappear before reporting success, so immediate restart cannot reuse an
  exited container still being removed. A timeout is an actionable failure.
- Shutdown preserves repository dependencies, `.devhome`, browser-origin OPFS
  data and production data volumes. Temporary container TLS material may be
  discarded. Signal/failure cleanup must respect the same ownership filters.
- Temporary self-signed HTTPS preserves the secure-context requirement for
  browser OPFS over LAN. Each test device must accept/trust the certificate.
  Browser data belongs to its scheme/host/port origin; changing that origin
  shows a different local store even though shutdown has not deleted data.
- Trusted-LAN all-interface publishing is intentional for preview. Honor a
  known loopback/network restriction; never modify firewalls or add listeners.
  Production Compose remains loopback-first with external TLS termination.

### Listener and access summary

The mandatory [preview console contract](preview-console.md) defines fixed
sections and service-grouped complete URLs, host-side `ip -br a` enumeration
on every ready start/status, local/internal separation and failure behavior.
It supersedes the previous configured-LAN-only output. Every eligible address
is a candidate, including secondary, bridge and tunnel addresses; physical
device reachability remains unverified until tested. `WEB_LAN_HOST` is an
optional additional candidate, never a replacement for enumeration. Default
startup hides wrapper chatter; `--verbose` exposes safe diagnostics.

### Incremental environment changes

Update the example, actual consumer and this table together. For an existing
local `.env`, compare recognized key presence without printing values; append
only missing keys, preserving comments, quoting, newline style and user values.
An existing empty value stays untouched and is reported if required. Report
duplicate keys rather than guessing the user's preferred value. A second run
must append nothing. If the file is absent, retain the full first-setup command
instead of creating a partial file. Report renamed/removed key migrations;
never silently delete old local values. Restart for binding/port/config changes;
rebuild only for image/toolchain changes.

## 4. Validation and error matrix

| Condition | Observable result |
| --- | --- |
| Missing `.env` on start/build | Nonzero with `cp .env.example .env` setup guidance |
| Required empty/invalid/duplicate configuration | Nonzero without printing sensitive values or starting |
| Missing Docker/image/dependencies | Actionable failure; no implicit install/build/host fallback |
| HTTPS/isolation readiness fails | Nonzero; no success banner or usable-URL claim |
| Already running | Reuse owned service; output its actual settings |
| Changed host port, including `0` | Runtime mapping and printed URL match effective published port |
| Status/build | Inspect/build only; never implicitly start |
| Stop/down twice, `.env` absent | Only owned preview services considered; data preserved |
| LAN/device inaccessible | Record limitation; local readiness does not prove cross-device access |

## 5. Good / Base / Bad cases

Good: prepare the image once, start from `.env`, verify HTTPS and browser OPFS,
then stop the precisely labeled container while retaining data. Base: run
loopback HTTPS and use its reported URL for local review. Bad: show a ready
banner before Vite binds, run builds on every start, or kill a process by port.

## 6. Required checks and execution boundary

Run `bash -n`, ShellCheck and `shfmt -d` on changed shell scripts. Behavior
regressions run with `./hako node --test tests/preview.test.mjs` (or
`node --test tests/preview.test.mjs` on an available Node runtime). Test
fixtures belong under `/tmp`: absent/custom/empty/duplicate dotenv, missing
keys added once, executable dotenv text treated as data, readiness failure
without a banner, repeat start/stop, status/build isolation and exact ownership.
With Docker available, use a free loopback port and an isolated fixture `.env`:
build/start, inspect listeners/mappings, fetch every printed local URL, repeat
start, status, stop/down twice, and confirm only owned services stopped. Change
host/port settings and verify actual mappings/output. Run a focused browser
secure-context/isolation/OPFS check when browser execution is available.

Retain precise validation evidence and limitations in the session handoff or
normal task evidence when a task exists. Do not leave preview running unless
requested. Docker needs the active execution environment's authorization;
scripts/specs grant no permission. Use scoped execution approval when needed,
without adding broad Docker/shell allow rules or editing personal policy.
Syntax/mock checks, real-container readiness, browser workflow and physical
device access are separate claims. This enhancement creates no task and
does not close unrelated acceptance rows or archive an existing task. Task
creation remains governed by the user's instruction and normal Trellis flow.

## 7. Wrong vs correct

Wrong: `source .env`, foreground host `npm run web`, print a wildcard URL,
then announce ready without checking it.

Correct: data-only configuration loading → shared Docker runtime → detached
Vite HTTPS → bounded real readiness → actual listener/publish/URL summary →
explicit `stop/down` using exact ownership labels.

Policy loading and context-registration steps are in [index.md](./index.md).
These project-authored files are outside Trellis template targets; future
`trellis update` must revalidate them without modifying protected runtime files.

## Current console dependency and loading contract

Read `preview-console.md` before preview changes or checks. Wildcard publication
requires host `ip` (iproute2) and a discoverable local Docker endpoint; dependency
or enumeration failures are actionable failures, never a localhost-only success.
Specific/loopback bindings retain their narrower access boundary. `--verbose`
controls safe startup diagnostics. Root `AGENTS.md` directs policy loading from
a project-owned section outside the unchanged Trellis-managed block. This
reconciliation requires no new task and changes no product acceptance state.
