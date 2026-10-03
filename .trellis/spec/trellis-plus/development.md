# Development and HTTPS Preview

- ownership: project-shared
- source: project-authored

## 1. Scope / Trigger

Read before changing the development wrapper, preview lifecycle, environment
keys, listener output or preview checks. This preview serves the offline Web
client using the existing `npm run web` Vite command and `Dockerfile` dev stage.
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

`build` explicitly prepares the configured development image from `Dockerfile`
target `dev`. Rebuild after dev-stage/browser/toolchain changes or changing the
image. Dependency changes use `./hako npm install`; ordinary `start` does not
install, build, or run tests. The dev image provisions Google Chrome on amd64;
other architectures need a separately prepared compatible image.

## 3. Configuration and lifecycle contracts

| Root `.env` key | Purpose / constraint |
| --- | --- |
| `HAKO_IMAGE` | Prepared development image; example uses `luna-dev:node22-playwright-1.63.0` |
| `HAKO_BIND_HOST` | Docker published host bind; trusted-LAN preview example uses `0.0.0.0`; choose `127.0.0.1` for loopback |
| `WEB_HOST_PORT` | Published TCP port, `1..65535`, or `0` for Docker assignment; example `4173` |
| `WEB_CONTAINER_HOST` | Vite container listener, `0.0.0.0` for host publishing |
| `WEB_CONTAINER_PORT` | Vite listener port, `1..65535`; example `4173` |
| `WEB_LAN_HOST` | Optional explicit host IP/name for cross-device URLs; empty means no claimed LAN address |
| `PREVIEW_READY_TIMEOUT` | Positive readiness deadline in seconds; an in-flight bounded probe can finish just after it |

Preview uses root `.env` as primary configuration. A recognized exported value
overrides the file; CLI `--port` overrides `WEB_HOST_PORT`. The legacy exported
`LUNA_PREVIEW_PORT` is a CLI-compatibility alias, not a second dotenv key source.
The loader reads dotenv values as data, never `source`/`eval`, and does not
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
  `build` builds without starting. `stop/down` are idempotent and stop only
  exact repository/scope/service-labeled preview containers. Never stop a
  production Compose stack, unrelated `hako` command, or host process by port.
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

Print `System is ready.` only after required probes pass. List every preview
listener with its service, protocol and container endpoint. Report Docker's
effective host mappings separately, including dynamically assigned ports.
Inspect runtime state; do not infer an active listener merely from a mapping.
Label uninspectable listeners as unverified, and never announce a working URL
for a mapping with no active listener.

Print an HTTPS `Website` URL using a reachable specific host (loopback for an
all-interface or loopback bind), never `0.0.0.0` or `[::]` as a browser host.
An explicitly configured `WEB_LAN_HOST` may supply a candidate cross-device
URL; identify it as unverified until tested from that device. Do not select a
Docker bridge, VPN or arbitrary first interface and assert LAN reachability.
If no LAN host is configured, instruct the user to choose the reachable host
address. Preview has no Admin/API-docs service; do not fabricate those routes
or print passwords/tokens. Distinguish HTTPS transport/isolation readiness from
an accepted ledger workflow.

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
