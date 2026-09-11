# Directory Structure

> Shared renderer boundaries for Electron, offline Web and Android.

## Directory Layout

```text
src/renderer/
├── index.html       # static shell, CSP meta, skip link, app mount
├── renderer.ts      # React root, QueryClientProvider and RouterProvider
├── app/             # route tree, validated search and application shell
├── components/      # forms and project-owned shadcn/ui primitives
├── data/            # local Query options, host reads and mutation helpers
├── features/        # ledger, entry, budget, settings, backup/sync/conflicts
├── i18n.ts          # complete en/zh-CN catalogs and Intl formatting
├── i18n.test.ts     # catalog/error-code/precision regressions
├── ledger-tools-i18n.ts # localized ledger actions and stable host errors
├── styles.css       # local tokens, responsive layout, focus/motion rules
└── electron.d.ts    # typed Window.lunaLedger declaration

src/web/
├── index.html       # browser shell and CSP
├── main.ts          # Web host injection before shared renderer startup
├── web-api.ts       # domain operations through the local store contract
├── sqlite-wasm-store.ts # SQLite-WASM + OPFS Worker adapter
├── sqlite-wasm.worker.ts # serialized OPFS connection and short write transactions
└── browser-state-store.ts # IndexedDB fixture plus old-Android compatibility adapter
```

The renderer does not own persistence files or SQL. Shared DTOs and validation
remain in `src/shared/`; the only application capability is the typed
`window.lunaLedger` host. Credentials/passphrases may be sent only in the
explicit ledger configuration/backup calls and are never returned. `src/web`
uses SQLite-WASM/OPFS by default and a production offline asset cache; native
Android explicitly uses the IndexedDB adapter when its WebView lacks OPFS.
Android embeds the same assets and skips Service Worker registration. Portable ledger SDK/session
code lives in `src/sync/`, not in renderer components.

## Module Organization

Keep the renderer entry small. Components and feature hooks own presentation;
reusable business logic stays outside the renderer. New persistence features
must first extend the shared API,
domain decoder, IPC handler, and tests before adding controls.

## Naming Conventions

Use `camelCase` for TypeScript, kebab-case for CSS classes and IDs, and
descriptive `render*`, `populate*`, `submit*`, and `create*` names for UI
functions. Use semantic HTML landmarks and stable IDs for form labels,
alerts, focus targets, and automated checks.

## Examples

- [src/renderer/renderer.ts](/home/wkyuu/cargo/repo/34-luna/src/renderer/renderer.ts)
  mounts the React providers and application route tree.
- [src/renderer/styles.css](/home/wkyuu/cargo/repo/34-luna/src/renderer/styles.css)
  owns visual tokens and responsive behavior.
