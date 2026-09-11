# Error Handling

> Error boundaries for domain validation, SQLite, IPC, and the renderer.

## Overview

Validation is owned by `src/shared/domain.ts` so the same rules apply to
renderer input, IPC payloads, and the SQLite adapter. `src/main/ipc.ts` is the
last boundary: it validates unknown IPC values, checks the sender, preserves a
user-safe `DomainError.message`, and replaces unexpected implementation errors
with an operation-level message.

## Error Types

`DomainError` has a stable `code`; IPC serializes only `LUNA_ERROR:<code>` and
the renderer localizes it. Current domain codes
include `invalid-input`, `invalid-amount`, `invalid-date`, `invalid-month`,
`invalid-transaction`, `invalid-workspace`, `already-configured`, and
`not-found`, and `stale-revision`. Config sync uses distinct stable codes such as `authentication`,
`conflict`, `remote-not-found`, `wrong-password-or-tampered`, and
`invalid-remote-config`; do not reuse a domain code for a sync failure.

## Error Handling Patterns

- Decode `unknown` at the IPC boundary with `decodeMonth`, `decodeId`,
  `decodeWorkspaceSetup`, `decodeTransactionDraft`, or the budget/update
  decoders.
- Keep multi-table writes inside a SQLite transaction so an invalid split or
  failed insert cannot leave a partial financial record.
- Catch expected domain errors at the UI action boundary, restore the submit
  control, focus the relevant field, and leave the previous snapshot intact.
- Catch unexpected main-process errors with a generic message. Never include a
  database path, SQL, raw payload, password, key, or credential in a renderer
  error or log.

## API Error Responses

The preload API returns promises. Successful methods return typed,
renderer-safe DTOs. Failures reject with `LUNA_ERROR:<stable-code>`; raw
implementation messages are never protocol. The surface includes ledger
operations plus `getSettings`, `updateSettings`, `configureConfigSync`,
`testConfigSync`, `syncConfigNow`, and `clearConfigSync`.

```typescript
getSnapshot(month: string): Promise<AppSnapshot>;
createWorkspace(input: WorkspaceSetupInput): Promise<Workspace>;
createTransaction(input: TransactionDraft): Promise<Transaction>;
updateTransaction(id: string, input: TransactionDraft): Promise<Transaction>;
deleteTransaction(id: string): Promise<Transaction>;
setMonthlyBudget(month: string, budgetMinor: string | null): Promise<void>;
```

## Validation Matrix

| Boundary failure | Required behavior |
|---|---|
| Non-object or malformed IPC input | Reject with a validation message before store access |
| IPC sender is not the current main window/frame | Throw `Untrusted IPC sender.` and do not mutate state |
| Domain invariant fails | Reject with `DomainError.message`; no partial write |
| Store/migration/native binding fails | Reject generic operation message; keep internals private |
| Renderer action fails | Show an alert/status, re-enable the action, and preserve editable input |
| Wrong passphrase, tag/AAD failure, or ciphertext tamper | Return one stable localized failure code and no partial portable settings |
| S3 409/412 or concurrent-delete 404 | Re-read/merge with bounded retry, then report conflict without blind overwrite |

## Good/Base/Bad Cases

- Good: `decodeTransactionDraft(input)` runs before `store.createTransaction`.
- Base: an invalid budget is shown inline while the existing budget remains.
- Bad: `event.sender` is trusted because the handler name looks private, or a
  caught exception is serialized wholesale into the renderer.

## Tests Required

- Decoder tests should assert malformed unknown values and stable error codes.
- Store tests should assert invalid writes leave row counts, budgets, and
  pending operations unchanged.
- Packaged smoke should assert the typed bridge performs a valid write and
  returns the expected normalized signed amount.

## Wrong vs Correct

### Wrong

```typescript
ipcMain.handle('sql', (_event, query) => database.prepare(query).all());
```

### Correct

```typescript
ipcMain.handle(IPC_CHANNELS.createTransaction, (event, input: unknown) => {
  assertTrustedRenderer(event, getMainWindow);
  return callSafely('save transaction', () =>
    store.createTransaction(decodeTransactionDraft(input), randomUUID(), new Date().toISOString()),
  );
});
```

## Common Mistakes

- Do not add a second decoder in the renderer or store for the same payload.
- Do not turn a local-only error into a false remote-sync status.
- Do not “recover” by silently discarding a transaction or pending operation;
  surface the failure and retain the previous committed state.
