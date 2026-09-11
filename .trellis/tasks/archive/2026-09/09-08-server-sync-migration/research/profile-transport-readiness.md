# C profile/transport readiness

Read-only implementation preparation, 2026-09-08. No product code changed.
Read the C artifacts, root `research-seams.md`, parent design §§3/6/7/10 and
current sync/host/storage sources. The earlier root seam inventory remains
valid; this note adds concrete ownership and commit contracts. A review and B
local UI acceptance remain C entry gates.

## Profile host facade: capture an instance, not a mutable store proxy

`src/web/web-api.ts:63` already supplies a complete local use-case implementation
and owns both sync sessions. Preserve it as a per-profile unit. A browser facade
can delegate the existing `LunaLedgerApi` methods to an immutable captured
profile context, while additional account/profile methods live on the host.
Do not duplicate financial create/update/budget code in the account layer.

Suggested host-internal shape (proposal, not an existing interface):

```ts
interface ProfileContext {
  id: string;
  generation: number;
  api: LunaLedgerApi;
  ledger: LedgerDataPort;
  settings: ConfigSettingsPort;
  cancelRemote(): void;
  drainLocalWrites(): Promise<void>;
  close(): Promise<void>;
}
interface ProfileRegistry {
  current(): ProfileContext;
  open(profileId: string): Promise<ProfileContext>;
  activate(profileId: string): Promise<ProfileSummary>;
}
```

The generation is a host session counter, not persisted financial history.
`cancelRemote` needs a public non-destructive config-session cancellation seam:
current `ConfigSyncService.cancel` is private, and `clearLocalConfiguration`
changes durable settings. Logging out must not call the latter merely to stop
work. Ledger `clear()` already cancels and destroys its session without writing
local financial data.

Electron can reuse `LocalStore`, `SettingsStore`, the native crypto injection
in `src/main/config-sync.ts`, and the same remote coordinator. Extract the
local use-case adapter currently embedded in `src/main/ipc.ts`; IPC should
validate input and capture one current context per request. An alternative
minimal refactor is a typed `getCurrentContext` callback with explicit capture
inside each handler. Avoid a generic runtime method dispatcher or a mutable
`LocalStore` proxy.

Concrete trap: `importLedgerBackup` in current IPC decrypts asynchronously and
then calls the captured store. Changing this to `getCurrentStore()` only after
`await decryptLedgerDocument(...)` would import the old account's backup into
the newly selected account. Capture context before decrypt and check its
cancellation/generation before merge. Apply the same rule to settings mutation,
backup export, and native backup save callbacks.

## Persistent profile and binding transaction

Use `legacy-local` as a real preserved source. New profile opening needs an
explicit storage option such as `{databaseName, importLegacy: false}`; null
legacy Storage currently means unavailable, not empty. New profile defaults
must create a new local device identity and must not copy S3 connection,
settings acknowledgement, or native secret files into the server profile.

The authoritative binding must commit with the destination graph, not merely
with an independent catalog/active-profile pointer:

- Browser stores the complete state in one IDB record; `decodeWebState` rejects
  extra keys and accepts schema2 with exact settings/ledger fields. Adding a
  binding/copy-complete marker needs a versioned decoder transition and one
  `BrowserStateStore.update` transaction. Keep schema2 input readable.
- SQLite `mergeLedgerDocument` already commits graph/projections inside an
  immediate transaction (`src/main/store.ts:122`). Add a small profile metadata
  record and an atomic install/bind operation in that store; a separate
  `settings.json` write cannot make graph+binding atomic.
- A catalog is a discoverability index, not the authority for successful copy.
  If its write fails after the destination commits, reopening must discover or
  retry the same destination. Stable host-generated names from validated opaque
  instance/user IDs avoid repeated empty profiles; never accept renderer paths.
- Copy/merge decoded `LedgerDocument` so workspace IDs, revisions, parents,
  tombstones and budgets remain intact. Compare canonical documents after a
  fresh reopen and compare projections. Do not copy a live SQLite file/WAL or
  flatten transactions.

Binding sequence: capture source document and source identity → obtain explicit
server ledger space → read remote → decrypt and enforce workspace compatibility
→ install/merge into destination transaction → conditional upload → GET and
client decrypt verification → commit destination binding → reopen verification
→ activate destination. A failure leaves the source unchanged and destination
recoverable. Never mark active/bound before verified completion. If source
changes while awaiting network, reread and merge before claiming completion;
otherwise clearly keep it pending for a repeat migration.

## Ledger HTTP transport: existing interface is sufficient

`LedgerObjectStore` already accepts get/put keys, exact string body, ETag and
AbortSignal. Implement an HTTP adapter with a fixed ledger ID and reject an
unexpected object key; map it to generated `getLedgerObject/putLedgerObject`.
The sync session currently derives S3 prefix and passphrase from
`ConfigureConfigSyncInput`. Add a transport-neutral session core input
`{remote, objectKey, passphrase}` (host-only), retaining the existing validated
S3 configure method as a compatibility wrapper. A server configure entrypoint
must not synthesize bucket/AWS credentials.

A's generated client keeps ETag/status and allows `parseAs: 'text'`; its static
result type remains the JSON DTO, so narrow the runtime value. Preserve original
bytes on PUT with generated `bodySerializer: () => raw`, after shared envelope
validation, rather than JSON-stringifying an already serialized string.

An HTTP object's empty response is only `404` with `code: 'object-not-found'`.
A's invisible/missing ledger returns `code: 'not-found'`; treat that as a stopped
binding, never an empty object eligible for upload.

Each encrypted write attempt must own one immutable body/condition/idempotency
key tuple. Retry a lost/transient response with that tuple; after a 412 and
remerge/re-encryption use a new key. Ledger's current loop handles CAS conflicts
but has no transient retry owner. Put transport retries inside one bounded
operation, using the existing 60-second AbortSignal and Retry-After; do not add
nested Query mutations or unbounded delayed work. Existing `LedgerObjectError`
has no separate transient/rate-limit metadata, so add an explicit safe mapping
or transport-local retry handling without misclassifying 401/413 as retryable.

## HTTP preference sync: reuse lifecycle, remove S3 configuration coupling

`src/sync/config-service.ts` is already host-neutral and receives
`ConfigSettingsPort`, secrets, object factory and crypto. Electron's subclass
only injects native crypto. `ConfigObjectStore` has the correct byte-array and
conditional-write interface for `/preferences/object`.

The remaining coupling is in the service, not the crypto: `configure()` decodes
S3 credentials, `run()` reads `settings.syncConnection`, derives prefix key,
loads S3 credentials and guards that connection. Simply replacing its factory
would leave fake S3 state and an incorrect secret lifecycle.

Extract target resolution/guard from `run()` into a host-only session target:
`{identity, objectKey, passphrase, createObjectStore}`. Keep the existing S3
resolver and a new server resolver, both feeding the same encryption/merge/
conditional retry loop. Store server preference enabled/status/ack separately
from legacy `syncAllPortableSettings/syncConnection/lastSync`; those are the S3
contract and must not be rewritten to pretend a server configuration exists.
An account password must never be passed as the preference encryption password.

Settings encryption and merge can be reused unchanged:
`remotePayloadFromSettings`, `mergePortableSettings`, `portableSettingsEqual`,
portable config crypto, and native crypto injection. Their payload deliberately
excludes secrets and host paths. Preference acknowledgement must never change
ledger acknowledgement or clear its pending state.

Unlike ledger's one-call PUT, the config lifecycle currently calls `remote.put`
inside its `retry()` callback. If the HTTP adapter generates a fresh key on each
call, this loses idempotency across those retries. Move the immutable attempt
creation outside that callback, or retain a bounded tuple/key for the same body
and condition through that retry scope; clear it when a new merge attempt starts.

## Cancellation and commit risks to preserve

- IDB already forwards signal through open, queued transaction, request callback
  and final commit. Do not turn `mergeLedgerDocument(input, signal)` into a call
  through the public API signature that silently drops the optional signal.
- Browser `transaction.oncomplete` rejects if signal became aborted; a commit
  may already have happened by that point. Cancellation is not proof of rollback.
  Keep the destination profile and reread it; never remove it or replay a local
  financial creation based only on that rejection.
- SQLite operations are synchronous; capture/check session before entering the
  immediate transaction. Do not close its connection while another asynchronous
  import/configuration operation still holds that profile context.
- `SettingsStore.mutateSettings` already serializes, checks abort before persist,
  and passes signal into atomic file persistence. Reuse this, not `update()` or
  `replacePortable()` methods that lack the same signal contract.
- Profile switch must cancel remote tasks, prevent new old-profile dispatch,
  drain accepted local writes, then swap all ledger/settings/conflict/status
  providers together. A generation check suppresses stale returned projections;
  it cannot undo a committed write and should not claim to.
- Catalog and profile names must not expose bearer tokens or passphrases. Account
  login/metadata remains distinct from opening/copying a financial profile.
- Cross-tab notifications should contain only profile ID/generation/invalidation
  categories, not graph/transactions/secrets. Invalidate every affected month
  after a budget graph merge; do not update open draft expected heads/revisions.

## Focused evidence needed before C acceptance

1. Two isolated browser API profiles and two SQLite instances: copy/reopen graph
   equality, source unchanged, new identity, no S3 secrets/settings inherited.
2. IDB blocked open/queued write/put-success-before-complete abort tests adapted
   from existing `src/web/web-api.test.ts`; cancelled profile switch must neither
   mutate the new profile nor misreport rollback of an already committed old one.
3. Late backup decrypt/import, delayed settings persist and pending ledger GET
   followed by account switch/logout: captured context remains isolated.
4. Actual generated HTTP adapter against real PG with two independent local
   graphs: create/edit/delete/budget conflicts, same-workspace merge, wrong
   workspace/password/envelope no local change, 404 distinctions and session
   revocation without deleting local data.
5. Drop a committed PUT response; same tuple/key replay then fresh download must
   converge. Verify new ciphertext changes the key and Retry-After obeys the
   existing total budget. No financial retry is delegated to Query.
6. Preference HTTP round trip on two devices, concurrent portable settings,
   lost response replay, independent enable/status/ack, no ledger acknowledgement.
7. S3 and encrypted backup migration use original graph decoders; repeat failed
   binding/copy is idempotent and source remains exportable. Include offline old
   S3 source choice explicitly rather than asserting it was up to date.
8. Web login does not call createLedger/PUT; Electron login does not return token
   through IPC. Session restart has local data but requires login/unlock again.
9. Binding completion failure after destination commit but before catalog commit:
   reopen/retry finds the same profile and preserves financial changes.

No implementation or C tests ran for this investigation. The source references
above are current as inspected; A checker and B may update their own boundaries.
