# Frontend Development Guidelines

2026-09-05 delivery update: Web is an offline
client with production Compose hosting and shared Android assets. See
[Web Host and Validation](./web-host-and-validation.md) for current durability
and offline contracts. Encrypted ledger sync, backups and conflict choice now
have browser regression coverage. Android16 emulator runtime has also passed;
do not infer physical-device or real-TLS-provider coverage from these tests.

These rules describe the React/TypeScript renderer shared by Electron, Web,
and the bundled Android host. Ledger sync and display-settings sync use separate
connections and encryption protocols. All ledger hosts use the SQLite-backed
local model: Electron uses native SQLite, Web uses SQLite-WASM and an OPFS
Worker, and older Android WebViews use the explicit IndexedDB compatibility
adapter on the secure bundled origin. Android ships the same Web assets locally.

User-visible work follows a Web-first delivery order: expose and validate the
shared workflow through `npm run web`, Web build, and Playwright before adding
Electron-only integration. Packaging and made-artifact smoke are final
integration/release gates, not prerequisites for UI iteration. Native-only
capabilities must still have an explicit, safe desktop-only state in Web.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Renderer files and layer boundaries | Current |
| [Component Guidelines](./component-guidelines.md) | DOM composition, styling, and accessibility | Current |
| [Hook Guidelines](./hook-guidelines.md) | React hooks, local Query reads and committed writes | Current |
| [State Management](./state-management.md) | Snapshot, view, form, and derived state | Current |
| [Quality Guidelines](./quality-guidelines.md) | UI states, security, and validation | Current |
| [Type Safety](./type-safety.md) | Shared contracts and runtime decoders | Current |
| [Web Host and Validation](./web-host-and-validation.md) | Browser host boundary and Playwright contract | Current |
| [Android Runtime](./android-runtime.md) | Bundled origin, permissions, isolated emulator and evidence boundaries | Current |
| [Category Catalog](../backend/category-catalog-guidelines.md) | Entry picker, settings CRUD, usage repair and stable label projection | Current |

## Boundary Summary

`renderer.ts` talks only to the typed `window.lunaLedger` API. Shared domain
code owns validation and money/date rules; Electron preload owns the narrow
bridge; the main process owns native SQLite, settings files, safeStorage,
crypto, and remote requests; the Web host owns its SQLite-WASM/OPFS adapter and
offline asset lifecycle, while native Android selects IndexedDB when its
WebView lacks OPFS. User-visible
UI must show loading, setup, empty, error, disabled, session-only secret
fallback, and success states while preserving keyboard access and the summary-
only amount privacy boundary.
