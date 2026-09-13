# Web Host and Validation Guidelines

## 1. Scope / Trigger

Use this contract when changing `src/web/**`, the shared renderer/API boundary,
browser persistence, summary privacy behavior, or the Playwright Web fixture.
It defines the supported offline Web client and shared Android assets under
the local-ledger requirements. Electron uses native SQLite; Web uses
SQLite-WASM/OPFS, while Android prefers that path and has an explicit
IndexedDB compatibility path for older secure WebViews without OPFS.

### Project Convention: Web-first delivery order

Every new or changed user-visible workflow must be made accessible through the
Web host before Electron packaging is treated as the next delivery step:

1. Define or update the platform-neutral domain and `LunaLedgerApi` contract.
2. Implement the shared renderer flow and a browser-safe Web adapter.
3. Make the flow manually reachable with `npm run web`, then validate its
   behavior with `npm run web:build` and Playwright.
4. After the Web behavior and UX are accepted, add or update Electron-only
   integration such as IPC, SQLite, filesystem access, safeStorage, or native
   dialogs.
5. Run Electron packaging, made-artifact, and packaged smoke checks only as the
   final integration/release gate.

Packaging must not block routine UI design, product review, or browser E2E
feedback. A capability that is inherently desktop-only still needs a safe Web
representation: show its state and boundary, disable unavailable actions, and
explain that the operation requires the desktop app. Do not emulate native
security or persistence behavior in the browser merely to make the control
appear functional.

## 2. Signatures

The Web entry point must install the same renderer-facing port used by Electron:

```typescript
createWebLedgerApi(storage?: Storage | null, testDatabase?: IDBFactory | null): LunaLedgerApi;
createWebProfileHost(testDatabase?: IDBFactory | null, storage?: Storage | null, fetcher?: typeof fetch): ServerHost;
window.lunaLedger: LunaLedgerApi;
secureRandomUuid(cryptoApi?: Crypto): string;
secureRandomId(prefix: string, cryptoApi?: Crypto): string;
```

The default `npm run web` server listens on all interfaces at `0.0.0.0:4173`.
Use `http://127.0.0.1:4173` or `http://localhost:4173` for local access.
Those loopback origins are treated as secure by browsers. Do not use
`http://<host-ip>:4173` for the SQLite Web client: a plain-HTTP LAN origin is
not secure, so the browser does not expose OPFS and startup must fail with an
actionable HTTPS message. For another device, run `./preview.sh`; it creates a
temporary self-signed certificate covering the host's discovered LAN IPs and
starts HTTPS on the same port. Accept that certificate warning on each test
device. This is an unauthenticated development server and must only be
exposed on trusted networks; it is not a production host.

The reproducible validation commands are:

```text
npm run web
npm run web:build
npm run test:web
```

Playwright keeps an explicit `--host 127.0.0.1` override in its
`playwright.config.ts` web-server command so browser tests remain deterministic
and loopback-only.

Only after the Web gate is satisfied should the final desktop integration gate
run:

```text
./hako npm run build
npm run make
npm run smoke:electron
```

## 3. Contracts

- `src/web/main.ts` injects `createWebProfileHost()` and then loads the shared
  renderer. The renderer talks only to `window.lunaLedger`.
- `src/web/main.ts` passes `safeIndexedDB()` only when the native Android
  runtime lacks `navigator.storage.getDirectory`; browser hosts leave the
  argument undefined and keep the strict OPFS requirement.
- The default Web host opens a SQLite-WASM database through an OPFS Worker. An
  isolated Web host uses the regular OPFS VFS; non-isolated embedded hosts use
  the SQLite `opfs-sahpool` VFS when available. The native Android entry point
  explicitly passes IndexedDB when `navigator.storage.getDirectory` is absent,
  because older WebViews expose IndexedDB but not OPFS. Ordinary Web entry
  points never pass that fallback.
- A user-visible feature is not ready for Electron packaging review until its
  normal, empty, loading, disabled, and error states can be inspected through
  the Web host, except for behavior that exists only at a native OS boundary.
- Desktop-only behavior must be isolated behind the shared API capability
  contract. Its Web state must remain navigable and explanatory without making
  IPC, filesystem, SQLite, provider, or secret calls.
- Both HTML entries load the shared stylesheet as an external `<link>`. The
  Web entry goes through `src/web/styles.css` and the Vite `?direct` CSS
  response, because the Web CSP allows `style-src 'self'` but does not allow
  Vite's development-time inline style injection. Do not rely on a renderer
  CSS import alone for the browser preview.
- Production CSP must keep ordinary JavaScript `unsafe-eval` disabled while
  allowing `wasm-unsafe-eval`; SQLite-WASM needs the latter during module
  compilation. A strict CSP without that WebAssembly exception appears as a
  generic storage initialization failure.
- Web code must not import Node, Electron, `better-sqlite3`, filesystem/path
  APIs or desktop settings/secret adapters. Browser ledger transport is allowed
  only through `src/sync/` with explicitly configured, memory-only credentials;
  shared renderer components never import the SDK. The production browser
  storage adapter owns one SQLite-WASM database per local ledger through an OPFS
  Worker; native Android may use the explicit IndexedDB compatibility adapter
  when OPFS is unavailable. Neither path silently falls back on a plain HTTP
  Web origin or dual-writes both stores.
- Browser state is strict and versioned. Malformed or unsupported state must
  remain in the selected SQLite or explicit Android IndexedDB store and reads
  report a recoverable error, never empty setup.
  Failed writes reject without publishing changes or announcing success.
  Reads reload committed state, returned DTOs do not alias internal state, and
  the Worker uses short `BEGIN IMMEDIATE` transactions with an optimistic
  precondition for concurrent tabs. Storage unavailability is explicit; no
  unsafe in-memory or localStorage write fallback.
- The explicit Android IndexedDB compatibility adapter stores a durable
  per-profile migration lease alongside its state. While a profile is being
  copied, graph, attachment, restore, binding, and checkpoint writes fail with
  `LUNA_ERROR:migration-locked`; reads remain available. The SQLite-WASM
  worker applies the same lease check to binary writes and short transactions.
- Profile-directory reads are presentation reads, not catalog writes. Keep one
  stable catalog store per browser host and coalesce concurrent `profiles()`
  consumers; a top-bar profile picker and an account panel must not compete
  through separate SQLite-WASM workers. The startup picker is only a recovery
  surface when the persisted active profile is missing or still empty, not a
  prompt merely because more than one local copy exists.
- Current development IndexedDB/localStorage bytes are not migrated. Close old
  version tabs before upgrading; a new release starts from its SQLite catalog
  and ledger databases. Users retain data through the application encrypted
  backup flow, not by relying on browser storage internals.
- Editing or deleting an existing rendered transaction passes its expected
  revision. Check it inside the write transaction and reject stale revisions
  with an actionable error, preserving the user's form and committed data.
- Budget forms capture snapshot `budgetHeadIds`, including an inherited month
  or no source, and pass them on every submission. Compare in the local write
  transaction. Sync/presentation refreshes must not replace the draft's token;
  stale budget errors remain inline and preserve the input and focus.
- Production builds precache the complete versioned application shell. Install
  must finish all assets before activation. Never cache financial data, secrets,
  sync responses, or arbitrary network requests. Do not force activate an update
  over open forms. Development servers do not register workers.
- `docker compose up --build -d` serves a production build on loopback port8080
  with no host Node/Bash toolchain, pre-created secret files, or source-code
  bind mount. API/MinIO ports stay internal; initialization and recovery use
  the single `data/` directory described by the backend deployment spec.
  Non-localhost deployment
  requires trusted HTTPS for Service Worker / secure browser APIs.
- LAN access over plain HTTP is not a secure browser context. Web startup and
  normal workflows must not unconditionally depend on secure-context-only APIs
  such as `crypto.randomUUID()`. ID generation may use `randomUUID()` when it
  exists, but must fall back to 16 bytes from `crypto.getRandomValues()`, set
  the UUID v4 version and RFC variant bits, and fail explicitly with
  `LUNA_ERROR:secure-random-unavailable` if cryptographic randomness itself is
  unavailable. Never fall back to `Math.random()`.
- A workspace's initial budget is keyed by the shared
  `localMonthFromTimestamp(createdAt)` helper, not by `createdAt.slice(0, 7)`.
  The date shown to the user and the budget month are local-calendar concepts;
  using a UTC timestamp slice can put a month-end user's first budget in the
  wrong month on either host.
- Web settings project `configSyncAvailable: true`. Locale/privacy persist
  locally; optional remote settings sync uses a separate configured in-memory
  session and local master switch. Protected secret persistence remains an
  Electron-only capability. See the backend config-sync contract.
- The default hidden state masks only the three top-summary values: income,
  spending, and net flow. The home surface does not render a remaining-budget
  summary; budget editing and budget used/limit detail live in the secondary
  menu. Category totals and transaction amounts stay visible and editable
  where the host allows. Hidden aggregate values must not appear in text,
  ARIA, title, dataset, or live-region content.
- The shared renderer keeps transaction entry out of the persistent home
  layout. `#record-expense` and `#record-income` open `#transaction-dialog`,
  while `#open-secondary-menu` opens `#secondary-menu-dialog`. Budget,
  category breakdown, display settings, and ledger/config sync tools render
  inside the secondary dialog so the same primary path is used on desktop,
  Web, and Android.
- The visible eye control beside each summary label changes only that summary
  amount and stores no session reveal state; the hide-by-default setting remains
  persisted. A reload initializes all three visibility flags from that default.
  When all aggregate values are hidden, the summary grid retains its collapsed
  state marker for assertions, but the cards keep the same geometry. A partially
  hidden card must not resize the row or move surrounding content.
- Playwright uses fresh browser contexts, no credentials, no real provider, and
  the installed Chrome channel plus a `375x800` narrow project. Screenshots and
  traces are failure diagnostics, not pixel-snapshot contracts.

## 4. Validation / Error Matrix

| Condition | Required result |
|---|---|
| First Web visit | Setup form renders with CNY available and local-only copy |
| Create workspace/records | Shared domain rules accept them and SQLite-WASM commits atomically |
| Reload after local writes | Workspace, budget, categories, and transactions restore |
| Hidden summary default | Three aggregate values show only the mask and grid is collapsed |
| Detail privacy boundary | Budget details, editor, category totals, transaction amounts, and edit controls remain usable/visible |
| Per-summary reveal then reload | Each eye reveals only its own value in-session; reload returns all three to the configured default |
| Web display-settings sync action | Explicit memory-only connection plus local master switch; compatible v1 ciphertext |
| Web ledger sync action | Explicit session configuration, encryption, conditional writes; disabled state makes zero I/O |
| Malformed browser state | Recoverable error, original bytes retained, no empty setup or overwrite |
| Storage write failure | Visible failure, prior committed state intact, retry possible |
| Concurrent tabs | Both creates retained through Worker SQLite transactions; stale edits/deletes rejected |
| Production offline restart | Cached HTML plus every lazy JS/CSS asset load, saved ledger restores, writes work |
| Narrow viewport | No horizontal overflow; landmarks, controls, and labels remain present |
| Local month boundary | Workspace creation and its initial budget use the same shared local month shown by the UI |
| Web stylesheet | Computed page background/layout styles are present; no CSP-blocked inline stylesheet is required |
| New user-visible workflow | Reachable through `npm run web` and covered by browser acceptance before packaging work begins |
| Desktop-only capability | Web shows a clear unavailable/desktop-only state and performs no native or remote side effect |
| Web acceptance fails | Fix or explicitly revise the shared behavior before running final Electron package gates |
| Plain-HTTP LAN origin | Refuse startup with an actionable HTTPS/localhost message; never silently fall back to IndexedDB or localStorage |
| Native Android WebView without OPFS | Use the explicit IndexedDB adapter on `https://localhost`; keep the same offline API and error boundaries |
| `crypto.getRandomValues` unavailable | Fail explicitly with `LUNA_ERROR:secure-random-unavailable`; never create a weak ID |

## 5. Good / Base / Bad Cases

- Good: the Web host supplies a local adapter implementing `LunaLedgerApi`, the
  shared renderer remains unchanged at the API boundary, and Playwright proves
  the same semantic behavior before Electron packaging.
- Good: a feature is reviewed in the browser first, then the already-accepted
  shared flow is connected to Electron-specific persistence or OS services.
- Base: the SQLite catalog and selected ledger have no state, so the user sees
  setup and can create a local workspace without network access.
- Base: an inherently native feature renders an explicit desktop-only state in
  Web while its real implementation waits for the Electron integration phase.
- Base: localhost uses native `crypto.randomUUID()` while a secure context
  without that helper produces the same ID shape from `crypto.getRandomValues()`.
- Bad: beginning package-specific UI iteration when the same shared workflow
  is not yet reachable and testable through `npm run web`.
- Bad: assuming an API available on trusted localhost is also available when
  another device opens the same app through an HTTP LAN address.
- Bad: importing `electron` or `better-sqlite3` from `src/web`, copying the
  desktop secret/config-sync path into browser storage, using IndexedDB as a
  hidden fallback in an ordinary Web host, or showing a disabled sync form as
  if it were operational. Correct: select the fallback only in native Android
  after an explicit OPFS capability check.
- Bad: masking transaction rows or budget details, placing the real aggregate
  value in an ARIA attribute, or persisting the temporary reveal state.
- Bad: deriving the initial Web budget from an ISO UTC timestamp while the
  selected month uses local calendar time; this creates a silent month-end
  budget mismatch.
- Bad: importing the renderer stylesheet only from TypeScript and assuming the
  Vite dev server will inject it; the strict Web CSP blocks that inline style,
  leaving a functionally passing but visually unstyled page.
- Bad: treating SQLite-WASM `db.selectArray(sql)` as an all-row introspection
  API. It returns only the first result row, so checking every row from
  `PRAGMA table_info(...)` can miss a later column and repeat an `ALTER TABLE`,
  producing `duplicate column name` during startup.
- Correct: constrain schema introspection to the column being tested and
  inspect the single returned row, or use the API that explicitly returns all
  rows:

  ```typescript
  const column = db.selectArray(
    "SELECT name FROM pragma_table_info('luna_state') WHERE name = 'migration_json'",
  );
  if (column?.[0] !== 'migration_json')
    db.exec({ sql: 'ALTER TABLE luna_state ADD COLUMN migration_json TEXT' });
  ```

  Keep a browser regression that opens an existing pre-column database and
  reaches the public settings/snapshot APIs after the migration check.

## 6. Tests Required

- Build: `npm run web:build` must succeed with the browser SQLite-WASM and
  Worker assets, without Node/Electron/`better-sqlite3` modules in the bundle.
- Browser E2E: `npm run test:web` must cover setup, CNY, transaction entry,
  summary-only masking, collapsed state, visible details/editing, independent
  per-summary reveal, reload reset, semantic controls, stylesheet application,
  and 375px overflow.
- Production offline gate: because the production-shell cold-start and update
  cases are intentionally skipped for a development server, run
  `LUNA_TEST_PRODUCTION=1 npm run test:web` after `npm run web:build` to make
  the complete browser gate report all production cases instead of a partial
  pass with skipped tests.
- Insecure-context capability regression: before page initialization, disable
  `crypto.randomUUID`, then assert setup renders and workspace plus transaction
  creation succeed through the cryptographic UUID fallback.
- Legacy-WebView regression: with OPFS absent and
  `AbortSignal.throwIfAborted` absent, install the Android APK and assert the
  initial settings/snapshot reads succeed, no global error is rendered, and
  cancellation checks do not raise a compatibility `TypeError`.
- SQLite-WASM gate: run the production browser cases over a COOP/COEP-enabled
  preview, create two independent local ledgers, reload each, and verify that
  no `luna.web.state.v1` or IndexedDB record is needed for recovery. Android
  exercises `opfs-sahpool` when available and must also verify the explicit
  IndexedDB fallback on a WebView without `navigator.storage.getDirectory`.
- Delivery order: record successful Web manual review plus `npm run web:build`
  and relevant `npm run test:web` coverage before starting the final package,
  make, and packaged-smoke gate for a user-visible workflow.
- Cross-layer regression: run `./hako npm run typecheck`, `./hako npm test`,
  `./hako npm run build`, and the packaged Electron smoke for renderer/API
  changes after the Web-first gate, as final desktop integration validation.
- Date-boundary regression: keep the initial budget assignment on the shared
  local-month helper and include a month-end test when changing Web persistence.
- Human residual gate: review packaged Electron visuals, keyboard focus,
  reduced motion, native first-run directory dialogs, and screen-reader output;
  passing Playwright does not cover these cases.

## 7. Wrong vs Correct

### Wrong

```typescript
// Browser code reaching into the desktop implementation.
import Database from 'better-sqlite3';
import { safeStorage } from 'electron';
```

This makes the Web preview unbuildable or leaks a desktop-only persistence and
secret boundary into an ordinary browser.

### Correct

```typescript
window.lunaLedger = createWebLedgerApi();
void import('../renderer/renderer');
```

The adapter uses shared domain decoders and a SQLite-WASM OPFS Worker, reports the Web
capability boundary through explicit host projections, and leaves all
Electron filesystem, SQLite, safeStorage and display-settings provider work in
the desktop host. Ledger crypto and transport use the portable shared/session
modules on Web and in Electron main; see the backend ledger-sync contract.

For browser-generated IDs, use the shared `secureRandomUuid` and
`secureRandomId` helpers; do not assume localhost capabilities or duplicate
their fallback logic:

```typescript
const id = secureRandomUuid();
```

The fallback must set UUID version and variant bits after filling the byte
array. If cryptographic randomness is unavailable, the helpers must throw
`LUNA_ERROR:secure-random-unavailable`.
