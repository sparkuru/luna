# Hook Guidelines

> React hook and async presentation boundaries.

## Overview

React state owns transient UI behavior. TanStack Query owns discardable host
read caches and mutation progress. Hooks call the typed window.lunaLedger API;
domain validation, persistence, HTTP credentials and sync coordination remain
outside renderer hooks.

## Custom Hook Patterns

useApp reads the safe presentation context. useLocalWrite waits for host commit,
calls the saved callback once, then refreshes; a failed refresh is not a failed
write. Capture draft revisions/heads on form initialization, not in an effect
that replaces them whenever Query data changes. External DOM listeners need
effect cleanup; React form handlers should not be installed with querySelector.

## Data Fetching

Initialization loads renderer-safe settings and the selected host snapshot
(native SQLite in Electron, SQLite-WASM/OPFS in Web, and the selected
SQLite-WASM/OPFS or explicit IndexedDB adapter in Android).
A successful ledger mutation fetches a fresh snapshot, then renders and
announces success. Settings updates consume the returned safe projection.
Manual config-sync actions refresh status after success or failure. The UI
does not use optimistic financial totals or implement remote transport retries.
Local Query options use networkMode: always; mutation retry is disabled.

## Naming Conventions

Use `use*` for hooks, `*Options` for Query factories and `announce` for
live-region messages. Keep async errors at the action
boundary so controls can be restored and the relevant field can be focused.

## Common Mistakes

- Do not add a second fetch/cache path that can disagree with SQLite.
- Do not update summary cards optimistically without a server-of-truth
  snapshot.
- Do not turn renderer queries into an independent financial sync loop.
