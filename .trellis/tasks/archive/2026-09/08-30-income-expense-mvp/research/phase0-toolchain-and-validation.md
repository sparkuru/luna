# Research: Phase 0 toolchain and validation

- Query: Determine a minimal Electron desktop foundation that shares platform-independent Web UI/domain logic, persists with native SQLite, and supports a separate browser SQLite WASM/OPFS spike. Compare practical current Electron packaging/build options, TypeScript, native SQLite bindings, browser persistence constraints, and validation implications.
- Scope: mixed
- Date: 2026-08-30

## Findings

### Executive recommendation

**Recommendation / inference:** For the first desktop boundary, use the stable Electron Forge `vite-typescript` template, keep the desktop Vite integration on the Vite major version supported by the selected stable Forge plugin, and pin the complete dependency set in a lockfile. At the time of this research the practical baseline is:

| Concern | Phase 0 recommendation | Reason / constraint |
| --- | --- | --- |
| Desktop shell | Electron `44.x` stable, with an exact patch selected at implementation time | Electron `44.0.0` was the observed stable release on 2026-08-30; it embeds Node `24.18.1` and Chromium `152.0.7977.54`. Electron maintains only the latest three stable major lines, so the exact version must be rechecked before scaffolding. |
| Desktop orchestration | Electron Forge `7.11.2` stable, `vite-typescript` template | Forge combines development, packaging, making distributables, and native-module rebuilding. Its Vite plugin is documented as experimental, so pin it and do not silently float versions. |
| Desktop bundler | The Vite version compatible with Forge `7.11.2` (the template/plugin source points to Vite `5.0.12` range) | Do not force Vite 8 into the stable Forge 7 plugin. A separate browser spike may use current Vite 8. |
| Language | TypeScript with `strict: true`, explicit `tsc --noEmit` type checking, and runtime decoders at IPC/remote boundaries | Vite transpiles TypeScript but does not type-check it; TypeScript types are erased and cannot validate runtime data. |
| Native SQLite | `better-sqlite3` `13.0.3`, exact-pinned, behind a desktop-only persistence port | It provides synchronous prepared statements and transactions and ships common prebuilds, while the current `node-sqlite3` project is marked deprecated/unmaintained. Electron ABI rebuilding and packaged-app smoke tests remain mandatory. |
| SQLite location | A database file under `app.getPath('userData')` in an app-specific subdirectory | Electron documents `userData` as the per-user application data location; a database must not be placed in resources/ASAR. |
| Browser spike | A separate Vite browser app/module worker using `@sqlite.org/sqlite-wasm` `3.53.0-build1` and the standard OPFS VFS first | OPFS SQLite is worker-only, subject to secure-context and cross-origin-isolation requirements, browser quotas, and file-lock behavior. It is a technical validation, not a second production persistence implementation yet. |
| Host development runtime | Node `>=22.12.0` (prefer a current supported Node 24 LTS line if available when implementation starts) | This satisfies current Vite/electron-vite-era tooling and `better-sqlite3`'s Node `>=22` package requirement. The host Node version is separate from Electron's embedded Node runtime. |

The important boundary is:

```text
shared TypeScript model/use cases/ports/DTO decoders
                 │
       ┌─────────┴─────────┐
       │                   │
Electron renderer      browser spike UI
       │                   │
typed preload + IPC    worker + SQLite WASM/OPFS
       │
Electron main (or later utility process)
       │
better-sqlite3 file under userData
```

**Recommendation / inference:** Shared code should contain pure Web-compatible domain logic, model types, use-case interfaces, and serialization/validation contracts. It should not import `electron`, Node built-ins, `better-sqlite3`, or SQLite WASM. The renderer should depend on a narrow asynchronous application API exposed through preload/context isolation. The desktop adapter can be synchronous internally, but its renderer-facing port should be asynchronous so the UI contract is not coupled to the native binding and can be reused by the browser spike.

### Repository and product constraints confirmed internally

The repository is intentionally empty of product/toolchain code. The following files are the current evidence base:

| File | Confirmed content |
| --- | --- |
| [`prd.md`](../../../../prd.md) | Product baseline: offline-first income/expense recording, local-first data, encrypted remote synchronization, conflict handling, and Electron desktop first. |
| [`../prd.md`](../prd.md) | Task PRD: Phase 0 must validate the simplified domain, Electron native SQLite save/migration/offline restart, browser WASM/OPFS behavior, encryption boundary, two-client change/conflict behavior, and one S3 adapter. It explicitly excludes product code and dependency/config/CI work before the boundary is approved. |
| [`../../../workflow.md`](../../../workflow.md) | Trellis planning workflow; research findings must be persisted and implementation follows boundary/acceptance decisions. |
| [`../../../spec/guides/cross-layer-thinking-guide.md`](../../../spec/guides/cross-layer-thinking-guide.md) | Shared guidance: make data flow explicit, validate at boundaries, and avoid leaky abstractions or scattered duplicate validation. |
| [`../../../spec/guides/code-reuse-thinking-guide.md`](../../../spec/guides/code-reuse-thinking-guide.md) | Shared guidance: search for reusable contracts/utilities first and keep payload parsing and state transitions centralized. |
| [`../../../spec/frontend/index.md`](../../../spec/frontend/index.md) | Frontend package guidelines are not filled in yet. |
| [`../../../spec/backend/index.md`](../../../spec/backend/index.md) | Backend/database guidelines are not filled in yet. |

**Confirmed fact:** There is no existing `package.json`, source tree, test runner, browser configuration, CI, or packaging configuration to preserve. Therefore the initial choice can be intentionally small, but the first scaffold will establish conventions that later work must follow.

### Electron runtime and boundary facts

**Confirmed facts from official Electron documentation:**

- Electron has a Node-capable main process, isolated Chromium renderer processes, preload scripts, and utility processes. The renderer should not be treated as a privileged Node environment. See [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model).
- `contextIsolation` has been the default since Electron 12 and is recommended. Electron recommends exposing a narrow API with `contextBridge.exposeInMainWorld`; exposing the whole `ipcRenderer` object is unsafe. See [Context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) and [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc).
- For two-way renderer/main calls, Electron documents `ipcRenderer.invoke` with a corresponding `ipcMain.handle` as the convenient pattern, while still recommending narrow, purpose-specific wrappers. See [Inter-process communication](https://www.electronjs.org/docs/latest/tutorial/ipc).
- Electron's security guidance recommends keeping Electron current, disabling Node integration for remote/untrusted content, and using `nodeIntegration: false` and `contextIsolation: true` for renderer boundaries. See [Security](https://www.electronjs.org/docs/latest/tutorial/security).
- Electron's native-module ABI differs from the ordinary Node ABI. Native modules must be rebuilt for Electron; `@electron/rebuild` can do this, and Electron Forge uses it automatically during development and when making distributables. Native modules can still require a platform compiler/toolchain when no prebuild is available. See [Using native Node modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules).
- `app.getPath('userData')` is the recommended per-user application data location. Electron specifically advises placing app data in an app-specific subdirectory rather than colliding with Chromium-managed directories. See [`app.getPath('userData')`](https://www.electronjs.org/docs/latest/api/app).
- ASAR is a read-oriented virtual archive with special caveats for APIs such as `fs.open`, `process.dlopen`, executables, and native assets. Native `.node` files need to be unpacked. See [ASAR archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives).

**Recommendation / inference:** The first implementation should keep the native database adapter in the main process to minimize moving parts, with short transactions and no long-running queries. If database work becomes CPU- or latency-sensitive, move the adapter to an Electron utility process; do not solve this prematurely with a renderer Web Worker. Electron's process model provides utility processes for crash-prone or CPU-heavy components, while Electron's native-module guidance warns that native modules in Web Workers can cause crashes or memory corruption because `process.dlopen` is not thread-safe.

Electron supports ESM in the main process from Electron 28, but renderer ESM cannot directly use Node built-ins or bare Node modules without a bundler, and sandboxed preloads have additional ESM restrictions. See [Electron ESM](https://www.electronjs.org/docs/latest/tutorial/esm). **Recommendation / inference:** Do not make an ESM/preload migration a second Phase 0 experiment. Use the selected template's known-good module conventions and keep the preload surface narrow.

### Build and packaging options

#### Option comparison

| Option | Confirmed current behavior | Phase 0 assessment |
| --- | --- | --- |
| **Electron Forge 7.11.2 + `vite-typescript`** | Electron's [boilerplates/CLIs guide](https://www.electronjs.org/docs/latest/tutorial/boilerplates-and-clis) points to Forge for packaging/publishing and its templates. Forge provides start/package/make workflow and uses `@electron/rebuild`; the [Vite plugin](https://www.electronforge.io/config/plugins/vite) builds main, preload, and renderer entries. Forge's Vite support is documented as experimental from the 7.5.0 line, and the stable template source uses the Vite 5 era. | **Recommended desktop default.** It has the smallest packaging/rebuild surface for a native addon. Pin Forge and its compatible Vite major, record the experimental-plugin risk, and smoke-test the packaged app on every target OS/architecture. |
| **electron-vite 5 + a separate packager (Forge or electron-builder)** | [electron-vite 5](https://electron-vite.org/guide/) provides a unified `electron.vite.config.*`, main/preload/renderer builds, HMR, and a conventional `src/main`, `src/preload`, `src/renderer` structure. It is a build/dev tool, not the complete packaging workflow. Its [distribution guide](https://electron-vite.org/guide/distribution) documents pairing it with electron-builder or Forge, changing output directories when paired with Forge, externalizing native modules, and unpacking them from ASAR. The v5 package requires Node `^20.19.0 || >=22.12.0` and supports Vite 5/6/7 peers ([package source](https://raw.githubusercontent.com/alex8088/electron-vite/v5.0.0/package.json)). | **Viable alternative, not the minimal default.** It has a clean unified config and is attractive if current Vite 7 or electron-vite conventions are a priority, but adding a separate packager creates output-directory, native-externalization, ASAR-unpack, and rebuild integration decisions. |
| **Plain Vite + hand-wired Electron** | [Vite](https://vite.dev/guide/) supplies a fast web dev server and bundler, supports TypeScript syntax and workers/WASM, and does not provide the Electron main/preload lifecycle, native rebuild, or distributable workflow. Vite only transpiles TypeScript; it does not type-check it ([features](https://vite.dev/guide/features)). | **Not recommended for the first desktop scaffold.** It is appropriate inside the isolated browser spike but would require recreating desktop integration and packaging behavior. |
| **Electron Forge 8 alpha** | The Forge release stream includes prereleases whose notes indicate the major package set is ESM and the alpha line requires Node `>=22.12.0`; it also tracks newer Vite majors. See [Forge releases](https://github.com/electron/forge/releases). | **Defer.** A prerelease toolchain would add migration and module-format risk to the first native persistence validation. |

**Confirmed version facts observed on 2026-08-30:**

- Electron's [release schedule](https://releases.electronjs.org/schedule) showed stable `44.0.0` released on 2026-08-24, with Node `24.18.1` and Chromium `152.0.7977.54`; Electron's [release page](https://releases.electronjs.org/) showed the `44`, `43`, and `42` stable lines. These are time-sensitive observations, not a promise that they will remain current when implementation begins.
- The stable [Forge repository](https://github.com/electron/forge) showed `7.11.2`; the [Forge Vite plugin package](https://raw.githubusercontent.com/electron/forge/v7.11.2/packages/plugin/vite/package.json) declares Node `>=16.4` and a Vite `^5.0.12` development dependency, while the [Vite TypeScript template](https://raw.githubusercontent.com/electron/forge/v7.11.2/packages/template/vite-typescript/tmpl/package.json) uses the same Vite range and an old TypeScript `~4.5.4` template pin.
- The old template TypeScript pin is not a recommendation. **Recommendation / inference:** select a current supported TypeScript version deliberately after the initial scaffold, retain strict type checking, and run the exact app smoke tests after changing it. Avoid silently inheriting a stale template pin, but also avoid upgrading the desktop bundler to an unsupported Vite major.
- [Vite 8](https://vite.dev/blog/announcing-vite8) became stable on 2026-03-12 and requires Node `20.19+` or `22.12+`; its current feature set supports WebAssembly imports and Web Workers. That makes it a reasonable browser-spike bundler, but not a reason to force Vite 8 into Forge 7.11.2. The separate browser project boundary prevents the desktop packager's Vite compatibility from blocking the OPFS experiment.

### TypeScript and shared code

**Confirmed facts:**

- TypeScript provides static analysis and erases types when emitting JavaScript; it does not perform runtime validation. See [TypeScript from scratch](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch.html).
- TypeScript's [`strict`](https://www.typescriptlang.org/docs/handbook/2/basic-types.html) family of checks is the appropriate baseline for a new codebase, especially `strictNullChecks` and `noImplicitAny`.
- Vite supports TypeScript syntax but explicitly does not type-check it. Vite recommends running `tsc --noEmit` separately and using `isolatedModules`-compatible syntax. See [Vite features](https://vite.dev/guide/features).

**Recommendation / inference:** Put the following in a shared, browser-compatible package or directory (the exact directory name can be chosen during implementation):

- income/expense domain types and invariants;
- use cases and ports for persistence, clock, IDs, and synchronization;
- serialization DTOs and one runtime decoder/type guard per untrusted boundary;
- pure derived-statistics and change/conflict functions;
- test vectors usable by both desktop and browser adapters.

Keep Electron/Node imports, file paths, native bindings, IPC channel names, and browser worker plumbing outside this layer. This directly follows the repository's cross-layer guidance to make boundaries explicit and avoid scattered validation. It also allows Web UI components to run in either the Electron renderer or a regular browser without pretending that the two persistence environments are interchangeable.

### Native SQLite options

#### `better-sqlite3`

**Confirmed facts:**

- The official [better-sqlite3 repository](https://github.com/WiseLibs/better-sqlite3) describes a synchronous API, prepared statements, full transaction support, and prebuilt binaries for common platforms. Its [package source](https://github.com/WiseLibs/better-sqlite3/blob/master/package.json) and the [npm versions page](https://www.npmjs.com/package/better-sqlite3?activeTab=versions) showed `13.0.3` as the current package version observed for this research; the package declares Node `>=22`.
- The project recommends WAL in normal performance-oriented usage and is designed for local SQLite workloads, but its README cautions that it is not intended for very high write concurrency or enormous databases. A single-user offline desktop app is a closer fit than a write-heavy server.
- Native addon use in Electron still requires Electron ABI rebuilding. The project's [troubleshooting guide](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md) calls out Electron rebuilds and ASAR unpacking; the official Electron native-module guide is the authoritative packaging constraint.
- The package is MIT licensed and includes the Node-API/native addon dependency path. Prebuild coverage does not eliminate the need to test each target OS and architecture.

**Recommendation / inference:** Use `better-sqlite3` `13.0.3` as the Phase 0 desktop adapter, exact-pinned and hidden behind a repository-owned port. Its synchronous transaction model makes the local write path easy to reason about for migrations and atomic local changes. Keep operations short; if profiling shows main-process stalls, move the adapter behind a utility process without changing the shared domain port.

#### `node-sqlite3`

**Confirmed facts:** The official [TryGhost/node-sqlite3 README](https://github.com/TryGhost/node-sqlite3/blob/master/README.md) currently carries a `[DEPRECATED] node-sqlite3` notice and describes the repository as unmaintained. It offers asynchronous C++ bindings and prebuilt Node-API packages for common platforms, with a node-gyp/compiler fallback. Those async semantics are attractive, but the maintenance status is a decisive Phase 0 risk.

**Recommendation / inference:** Do not select it for a new implementation. Consider it only if a required existing extension or API makes it unavoidable, and document that exception.

#### Node's built-in `node:sqlite`

**Confirmed facts:** Node's official [`node:sqlite` documentation](https://nodejs.org/api/sqlite.html) says the module was added in Node `22.5.0`, exposes synchronous database APIs, was no longer behind `--experimental-sqlite` by Node `22.13.0`/`23.4.0`, and remains experimental in the documented API line (with later releases describing it as release-candidate status). Electron embeds its own Node runtime, so a host Node probe is not enough to prove that the chosen Electron runtime exposes the module correctly. An Electron issue records earlier uncertainty around enabling `node:sqlite` in Electron: [electron/electron#45532](https://github.com/electron/electron/issues/45532).

**Recommendation / inference:** Do not make `node:sqlite` the default foundation. A tiny runtime probe in the exact Electron version is worthwhile as a Phase 0 comparison (report `process.versions`, load `node:sqlite`, create/open a file DB, migrate, close, and reopen), but the result must also be weighed against its experimental status and Electron release support. If the probe fails or is unsuitable, the adapter boundary makes the fallback to `better-sqlite3` routine.

### Browser SQLite WASM/OPFS spike

**Confirmed facts from SQLite's official WASM documentation:**

- The official SQLite WASM project publishes the browser package as [`@sqlite.org/sqlite-wasm`](https://www.sqlite.org/wasm/doc/trunk/npm.md). The npm distribution page observed `3.53.0-build1` as current; the upstream [SQLite WASM releases](https://github.com/sqlite/sqlite-wasm/releases) showed the corresponding build. The project documents modern browser use, with Node support limited to in-memory use rather than persistent OPFS storage.
- Persistent OPFS VFS access is worker-only. SQLite's [persistence documentation](https://www.sqlite.org/wasm/doc/trunk/persistence.md) says the normal `opfs` VFS is available when SQLite is loaded from a worker, not from the main UI thread.
- The normal OPFS VFS relies on `SharedArrayBuffer`, so the browser response must be cross-origin isolated with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. The [SQLite demo](https://www.sqlite.org/wasm/doc/trunk/demo-123.md) and [API index](https://www.sqlite.org/wasm/doc/trunk/api-index.md) show the worker-oriented `sqlite3.oo1.OpfsDb`/current usage patterns.
- The official package README documents a worker-only persistent path and says the older Worker1/Promiser1 APIs are deprecated as of 2026-04-15. The spike should use the current worker/module API, not copy a deprecated example.
- OPFS access handles are exclusive. SQLite documents that multiple tabs/workers can encounter `SQLITE_BUSY` or generic I/O errors; browser concurrency is not equivalent to desktop SQLite concurrency. Transactions must be short and the spike must deliberately test lock contention and retry/failure behavior. See [SQLite persistence and locking notes](https://www.sqlite.org/wasm/doc/trunk/persistence.md).
- The `opfs-wl` VFS introduced in the SQLite 3.53 line uses Web Locks and `Atomics.waitAsync`; it may improve fairness/concurrency but has portability and compatibility trade-offs. The standard `opfs` VFS should be the first measurement target; `opfs-wl` is a variant to test only if multi-worker behavior matters.
- The `opfs-sahpool` VFS can avoid COOP/COEP in supported environments and can be faster, but it is a worker-only, fixed-capacity pool with no multiple simultaneous connections and different filename/pool constraints. It is useful as an alternate single-worker spike, not evidence that ordinary OPFS locking is solved.
- WAL in browser WASM has different constraints: SQLite documents that WASM lacks the shared-memory mechanism used by normal WAL concurrency; OPFS WAL requires exclusive locking and does not provide the same concurrency benefit. Do not carry native-WAL assumptions into the browser model.
- Browser storage is origin-private and not user-visible. OPFS is quota-limited; clearing site data removes it, private/guest contexts can reduce persistence, and browser or OS storage management can make data disappear. See [MDN: Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) and [MDN: synchronous access handles](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle).
- OPFS requires a secure context (normally HTTPS or an allowed localhost context) and synchronous access handles are only available in dedicated workers. The browser spike must run from an actual HTTP(S) dev server, not a packaged Electron `file://` page.
- Vite can provide development response headers through [`server.headers`](https://vite.dev/config/server-options), but deployment/hosting must supply the same COOP/COEP headers. Headers working in Vite dev are not proof of production hosting behavior.

**Recommendation / inference:** Make `browser-sqlite-opfs` an explicitly separate browser entry point. Use a module worker, current `@sqlite.org/sqlite-wasm` API, the standard `opfs` VFS first, and a real browser dev server configured for secure context and cross-origin isolation. Reuse only the pure shared model/use-case/test-vector layer. Do not make the desktop repository port depend on the browser worker protocol, and do not promise browser persistence until the spike has measured the target browser matrix.

The minimum spike should record:

1. exact SQLite WASM build and VFS selected;
2. browser/version/OS and whether the context is cross-origin isolated;
3. schema creation, migration, insert/update/read, close, and page reload persistence;
4. two pages or workers competing for a database, observed lock errors, and bounded retry behavior;
5. quota/storage-clear/private-mode behavior and a user-safe fallback when persistence is unavailable;
6. import/export or recovery behavior, since OPFS is not a user-visible backup file;
7. performance for representative transactions rather than a synthetic sustained-write benchmark;
8. browser-specific failures, particularly Safari and unsupported/permission-denied cases.

### Version and runtime constraints

The following are the constraints that should be treated as an implementation checklist, not as permanent latest-version claims:

| Layer | Observed/current constraint | Consequence |
| --- | --- | --- |
| Electron | `44.0.0` stable observation; embedded Node `24.18.1`; stable support is the latest three major lines ([releases](https://releases.electronjs.org/), [schedule](https://releases.electronjs.org/schedule)) | Pin the exact Electron version and run native-module/package smoke tests after every Electron upgrade. |
| Forge desktop | Stable `7.11.2`; Vite plugin source uses Vite `^5.0.12`; Vite integration documented as experimental ([plugin docs](https://www.electronforge.io/config/plugins/vite), [source](https://raw.githubusercontent.com/electron/forge/v7.11.2/packages/plugin/vite/package.json)) | Keep desktop Vite on the supported major; do not use Forge 8 alpha for the foundation. |
| electron-vite alternative | v5 requires Node `^20.19.0 || >=22.12.0`, supports Vite peer `^5 || ^6 || ^7` ([package](https://raw.githubusercontent.com/alex8088/electron-vite/v5.0.0/package.json)) | It cannot be used as a reason to select Vite 8 for desktop; packaging remains a separate concern. |
| Host Node | Select `>=22.12.0`; verify current LTS/tooling at implementation time | Meets current Vite 8/electron-vite requirements and `better-sqlite3` Node `>=22`; the lockfile and version manager should make it reproducible. |
| `better-sqlite3` | Observed package `13.0.3`, Node `>=22` ([package](https://github.com/WiseLibs/better-sqlite3/blob/master/package.json), [npm](https://www.npmjs.com/package/better-sqlite3?activeTab=versions)) | Install as a runtime dependency, rebuild for Electron, and validate all shipped OS/arch combinations. |
| Browser Vite | Vite 8 requires Node `20.19+` or `22.12+` ([announcement](https://vite.dev/blog/announcing-vite8)) | It may be used in the isolated browser spike without constraining the Forge desktop plugin. |
| SQLite WASM | Observed `@sqlite.org/sqlite-wasm` `3.53.0-build1`; persistent OPFS is worker-only ([npm docs](https://www.sqlite.org/wasm/doc/trunk/npm.md), [persistence](https://www.sqlite.org/wasm/doc/trunk/persistence.md)) | Pin the WASM build for measurements; report exact VFS/browser conditions. |

### Development and packaging implications

**Confirmed facts:**

- Forge's value for this task is not merely scaffolding: its documented workflow covers development and distributable creation and automatically invokes Electron native-module rebuilding. The native module still needs to be a runtime dependency and must be present in the packaged dependency tree.
- Native modules cannot be treated as ordinary renderer-bundled JavaScript. electron-vite's [dependency-handling guide](https://electron-vite.org/guide/dependency-handling) says Node/Electron built-ins and main/preload dependencies are externalized and native addons such as `sqlite3` cannot be fully bundled. Its [distribution guide](https://electron-vite.org/guide/distribution) calls out ASAR unpacking for native modules when using electron-builder.
- Forge packaging must have a normal on-disk `node_modules` layout; the Forge documentation notes limitations with symlinked dependencies/Yarn Plug'n'Play and special configuration for pnpm. The first scaffold should use the package-manager layout best supported by the selected Forge template, rather than adding a workspace/PnP experiment at the same time. See [Forge documentation source](https://github.com/electron-forge/electron-forge-docs).
- A writable SQLite file belongs under `userData`, not the application bundle, source tree, or ASAR. Packaged-app validation must open the real installed/packaged app and verify that restart sees the same database.
- Vite's TypeScript transform is not a test or type gate. A separate type-check script and tests are required even if the dev server compiles.

**Recommendation / inference:** For Phase 0, the desktop developer loop should prove four things in one small vertical slice: start the app, write a transaction through renderer → preload → IPC → main adapter, package/make the app with the native addon present, and restart the packaged app with data intact. Keep Forge's native rebuild output and ASAR/native-unpack settings visible in the build logs. Add cross-platform packaging jobs only after the local path works, but before claiming native SQLite support.

The browser spike should be served separately, with its own Vite response headers and worker entry. Do not infer browser support from an Electron renderer or from Node-only WASM execution.

### Testing and validation implications

**Confirmed facts:**

- Node's built-in [`node:test`](https://nodejs.org/api/test.html) runner is stable since Node 20 and supports synchronous/asynchronous tests, process isolation, and setup/teardown. It is enough for a minimal first test layer without adding a test framework to an empty repository.
- [Playwright's Electron API](https://playwright.dev/docs/api/class-electron) can launch and inspect Electron applications and is documented as experimental. It supports modern Electron versions, but native dialogs and OS-level packaging behavior have limitations.

**Recommendation / inference:** Use four distinct validation layers, each with a concrete observable:

1. **Shared domain tests under `node:test`.** Test signed integer amount rules, exact split sums, budget/revision/tombstone behavior, deterministic derived statistics, and change/conflict decisions. These tests must import no Electron or SQLite implementation.
2. **Native adapter integration tests.** Against a temporary database directory, test first migration, idempotent migration, atomic commit/rollback, prepared statements, reopen after process exit, and the expected SQLite locking mode. Run this with the exact Electron-rebuilt native module as an Electron-targeted test; a plain Node test proves SQL logic but not Electron ABI/package correctness.
3. **Electron bridge and packaged smoke.** Exercise renderer → typed preload → narrow IPC → main persistence, verify context isolation/Node integration settings, run offline, close, relaunch, and verify data. Repeat with a packaged/made artifact on every target OS/architecture. Playwright can automate the smoke path, but because its Electron API is experimental it should not be the sole release gate.
4. **Browser OPFS spike tests.** In a real browser server/context, verify cross-origin isolation, worker initialization, create/write/read/reload, close/reopen, quota or storage-clear failure, unsupported fallback, two-worker/tab contention, `SQLITE_BUSY`, and import/export. Capture the exact browser, WASM build, VFS, headers, and timings.

**Recommendation / inference:** Keep the browser and native adapter tests contract-compatible through shared domain test vectors, not by forcing both persistence implementations behind an identical low-level SQLite API. The question Phase 0 must answer is whether the domain/change model remains portable, not whether OPFS and native SQLite have identical locking or journaling semantics.

### What should remain deferred

The following are intentionally not foundation blockers and should not be pulled into the first scaffold:

- PWA/offline browser as a product client, mobile clients, and browser background-sync strategy. The product baseline explicitly makes Electron first and browser storage a validation only.
- Exact encryption implementation, key management, key rotation, provider/region matrix, and remote object protocol. Validate the encryption boundary and threat assumptions, but do not let an unchosen remote protocol define the local storage API.
- Final S3 object layout, synchronization scheduling, multi-device merge policy, tombstone retention/compaction, and user-visible conflict UX. Phase 0 should exercise representative two-client changes and conflicts, not finalize all remote semantics.
- ORM/query-builder selection, public database format, backup/restore format, and schema breadth beyond the minimum domain. Hand-written minimal migrations behind a repository-owned adapter are sufficient for the spike; a larger data-access framework should follow evidence.
- SQLCipher or another encryption-at-rest binding decision. It changes native build/packaging and licensing/extension considerations; first prove the local model and encryption boundary, then choose it deliberately.
- Switching the desktop shell to Forge 8 alpha, Vite 8, electron-vite v6/beta, or a fully ESM-first preload. These are future upgrade choices, not good reasons to increase Phase 0 variables.
- Browser `opfs-wl`, `opfs-sahpool`, WASMFS, multi-tab coordination protocol, and broad browser support claims. Test the standard OPFS path first; add variants only when the observed product requirement justifies them.
- Moving SQLite into an Electron utility process or adding a worker/process pool. Keep the first vertical slice simple and change the process boundary only when measured latency, crash isolation, or concurrency requires it.
- CI matrix, Playwright project configuration, release signing, auto-update, crash reporting, and hako/dev-container integration. The task PRD explicitly keeps product/config/CI work out of the pre-boundary phase; record the required acceptance checks first.

## Caveats / Not Found

### Unresolved risks

- **Version drift:** Electron, Forge, Vite, SQLite WASM, and native binding releases are time-sensitive. The versions above are observations from 2026-08-30. Reconfirm them immediately before implementation and pin exact versions in the resulting lockfile.
- **Forge Vite maturity:** Forge's Vite plugin is documented as experimental, and its stable template's TypeScript pin is stale. This is manageable with pinning and smoke tests but is not zero risk.
- **Native ABI and packaging:** `better-sqlite3` prebuild coverage may not match every Electron/OS/architecture combination. An Electron upgrade, architecture change, or missing prebuild can trigger local compiler requirements. Test a made artifact, not only the dev app.
- **`node:sqlite` support:** Electron's embedded Node version does not by itself guarantee stable, usable `node:sqlite` behavior. The exact Electron runtime probe is still required if that alternative remains interesting.
- **Main-process blocking:** `better-sqlite3` is synchronous. Large queries or accidental long transactions can stall the main process; keep transactions short and retain a utility-process escape hatch.
- **OPFS availability and durability:** secure context, worker-only access, COOP/COEP, quota, storage clearing, private/guest contexts, browser eviction/permissions, and origin changes can all affect persistence. OPFS is not a user-visible file and cannot substitute for export/recovery or remote backup.
- **OPFS locking/concurrency:** exact behavior varies by browser and VFS; `SQLITE_BUSY` and generic I/O errors are expected cases to measure. Native SQLite WAL/concurrency behavior must not be used as a browser proxy.
- **Browser package support:** SQLite describes its npm distribution as community-maintained even though it is part of the official SQLite WASM subproject. Pin the package/build and preserve a reproducible spike record rather than assuming npm support guarantees.
- **Automation confidence:** Playwright Electron automation is experimental. Use it for repeatable smoke coverage but retain at least one real packaged-app/manual OS validation path.
- **Empty-repository conventions:** There is no existing package manager, source layout, CI, or test convention. The proposed paths and scripts are architectural guidance only; implementation should reconcile them with the boundary decision and the still-empty Trellis frontend/backend specs.

### Not found / intentionally not decided

- No evidence in the repository establishes a preferred package manager, Node version manager, UI framework, state-management library, schema migration library, encryption library, or S3 client.
- No official source found in this research establishes a stable, production-grade browser SQLite persistence abstraction that is simultaneously equivalent to native SQLite, durable across all target browsers, and suitable for committing to the product architecture. The OPFS work should therefore stay a spike.
- No product requirement currently justifies a multi-process SQLite architecture, browser multi-tab write support, SQLCipher, PWA packaging, or a final sync protocol.

## External references

Primary/official documentation used:

- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron native Node modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [Electron ESM](https://www.electronjs.org/docs/latest/tutorial/esm)
- [Electron `app` API / `userData`](https://www.electronjs.org/docs/latest/api/app)
- [Electron ASAR archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
- [Electron boilerplates and CLIs](https://www.electronjs.org/docs/latest/tutorial/boilerplates-and-clis)
- [Electron releases](https://releases.electronjs.org/)
- [Electron release schedule](https://releases.electronjs.org/schedule)
- [Electron Forge Vite plugin](https://www.electronforge.io/config/plugins/vite)
- [Electron Forge stable repository](https://github.com/electron/forge)
- [Electron Forge Vite plugin package source](https://raw.githubusercontent.com/electron/forge/v7.11.2/packages/plugin/vite/package.json)
- [Electron Forge Vite TypeScript template source](https://raw.githubusercontent.com/electron/forge/v7.11.2/packages/template/vite-typescript/tmpl/package.json)
- [Electron Forge releases](https://github.com/electron/forge/releases)
- [electron-vite guide](https://electron-vite.org/guide/)
- [electron-vite development guide](https://electron-vite.org/guide/dev)
- [electron-vite dependency handling](https://electron-vite.org/guide/dependency-handling)
- [electron-vite distribution](https://electron-vite.org/guide/distribution)
- [electron-vite v5 package source](https://raw.githubusercontent.com/alex8088/electron-vite/v5.0.0/package.json)
- [Vite guide](https://vite.dev/guide/)
- [Vite features and TypeScript caveat](https://vite.dev/guide/features)
- [Vite server options](https://vite.dev/config/server-options)
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8)
- [TypeScript from scratch](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch.html)
- [TypeScript basic types and strict mode](https://www.typescriptlang.org/docs/handbook/2/basic-types.html)
- [better-sqlite3 repository](https://github.com/WiseLibs/better-sqlite3)
- [better-sqlite3 package source](https://github.com/WiseLibs/better-sqlite3/blob/master/package.json)
- [better-sqlite3 troubleshooting](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md)
- [better-sqlite3 npm versions](https://www.npmjs.com/package/better-sqlite3?activeTab=versions)
- [node-sqlite3 README](https://github.com/TryGhost/node-sqlite3/blob/master/README.md)
- [Node `node:sqlite` API](https://nodejs.org/api/sqlite.html)
- [Electron `node:sqlite` issue](https://github.com/electron/electron/issues/45532)
- [SQLite WASM npm documentation](https://www.sqlite.org/wasm/doc/trunk/npm.md)
- [SQLite WASM overview](https://www.sqlite.org/wasm/doc/trunk/about.md)
- [SQLite WASM persistence and OPFS](https://www.sqlite.org/wasm/doc/trunk/persistence.md)
- [SQLite WASM API index](https://www.sqlite.org/wasm/doc/trunk/api-index.md)
- [SQLite WASM demo](https://www.sqlite.org/wasm/doc/trunk/demo-123.md)
- [SQLite WASM releases](https://github.com/sqlite/sqlite-wasm/releases)
- [MDN Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [MDN synchronous access handles](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle)
- [Node test runner](https://nodejs.org/api/test.html)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
