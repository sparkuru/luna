# Type Safety

> Type and runtime-validation rules at the renderer boundary.

## Overview

The project uses strict TypeScript with `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Shared types in `src/shared/domain.ts` and
`src/shared/settings.ts` are the single source of truth for ledger, settings,
stable status codes, and IPC payloads.
The renderer's `Window.lunaLedger` declaration imports the typed API rather
than describing a second ad-hoc bridge.

## Type Organization

- `src/shared/domain.ts`: serializable domain types, invariants, decoders, and
  money/date/month utilities.
- `src/shared/api.ts`: the asynchronous renderer-facing API.
- `src/shared/ipc.ts`: channel-name constants.
- `src/shared/settings.ts`: strict local/remote settings decoders and the
  renderer-safe projection, which omits device IDs, ETags, and secrets.
- `src/renderer/electron.d.ts`: global `Window.lunaLedger` declaration shared
  by the Electron preload and Web host.
- `src/web/web-api.ts`: browser-local implementation of the same API; it must
  not import Node, Electron, SQLite, or provider SDKs.
- Renderer-only filter, route-search and component props stay with their feature.
- Generated HTTP DTO/SDK/Query options stay under src/api-client/generated;
  regenerate with api:generate and verify with api:check. Do not hand-edit the
  generated vendor runtime or weaken the root strict compiler flags.

Keep the database row interfaces private to `src/main/store.ts`. Do not export
SQL row shapes into the renderer.

## Validation

IPC arguments arrive as `unknown` and must pass `decodeMonth`, `decodeId`,
`decodeWorkspaceSetup`, `decodeTransactionDraft`, `decodeTransactionUpdate`,
`decodeBudgetInput`, `decodeSettingsUpdate`, or
`decodeConfigureConfigSync` before reaching an adapter. Domain normalization enforces
integer minor-unit strings, exact split totals, valid local dates, bounded
precision, and the two allowed transaction types. Do not rely on TypeScript's
compile-time types for untrusted IPC values.

## Common Patterns

```typescript
const api: LunaLedgerApi = {
  createTransaction: (input: TransactionDraft) =>
    ipcRenderer.invoke(IPC_CHANNELS.createTransaction, input),
};
```

Use discriminated unions for income/expense and typed `Promise` results. Use
`instanceof` checks to narrow DOM events and elements. Keep money strings as
strings across API, store, and snapshot; format only at the display edge.

## Forbidden Patterns

- Do not use `any` to bypass the bridge or cast raw IPC input directly to a
  domain type.
- Do not introduce a second `LunaLedgerApi`, channel string, decoder, or money
  parser/status-code list in the renderer.
- Do not use `number` for persisted amounts or compute financial totals with
  floating-point arithmetic.
- Avoid unchecked type assertions; when DOM typing requires one, narrow with a
  runtime `instanceof` check immediately around the assertion.
