# Resolve PRD key decisions

## Goal

Turn the repository-root `prd.md` into a coherent decision baseline for an
open-source, offline-first personal income/expense recorder. Resolve its eight
explicit open decisions and the product-level ambiguities that would otherwise
block later technical design.

## Background

- Source: repository-root `prd.md`, Draft v0.1 dated 2026-08-28.
- Audience: individuals, couples, and small families.
- Project shape: open-source personal hobby project.
- The repository currently contains planning material and no product
  implementation that can establish behavior by precedent.
- During review, the product was deliberately simplified from an account-balance
  ledger with a dedicated relay into an income/expense recorder with optional
  monthly spending limits and direct encrypted object-storage synchronization.

## Requirements

### Product model

- Record only income and expense transactions.
- Support category splits as details within one transaction.
- Income uses positive integer minor units and expense uses negative integer
  minor units. Every category split uses the transaction's sign and all splits
  must sum exactly to the transaction amount.
- Support optional merchant/counterparty, notes, tags, payment-method tags, and
  attachments.
- Treat cash, cards, and wallets as informational payment methods, not
  balance-bearing accounts.
- Do not model account balances, reconciliation, transfers, credit-card
  repayments, adjustments, refunds, reversals, or user-facing void operations.
- A full refund is handled by deleting the original expense; a partial refund is
  handled by editing its amount. This intentionally recalculates the original
  month's history rather than recording a refund in the current month.

### Monthly spending limit

- A workspace may optionally configure a spending limit for each calendar
  month.
- Without a configured limit, the product behaves as a pure income/expense
  recorder.
- Remaining monthly allowance equals the month's configured limit minus its
  latest effective expense records.
- Income does not increase the spending limit.
- Months are independent: unused allowance and overspending do not roll over.
- A new month initially copies the previous month's limit; the user may edit or
  disable it without changing historical months.
- User-facing copy must say “remaining monthly allowance” or “remaining budget,”
  never imply that this is a bank, cash, wallet, asset, or liability balance.

### Currency, amounts, and dates

- Each workspace has exactly one recording currency and fixed precision chosen
  at creation. Changing currency requires a new workspace.
- Foreign spending is manually converted by the user before entry. Original
  foreign amounts may be retained in notes only.
- Do not fetch, store, snapshot, apply, or recalculate exchange rates.
- Store amounts as signed integer minor units; do not use binary floating point
  for financial arithmetic.
- Every transaction has an explicit user-selected local calendar date. Monthly
  grouping uses that date and never changes with a viewing device's timezone.
- Optional occurrence time/timezone is display metadata. Creation,
  modification, and sync timestamps use UTC for audit and synchronization only.

### Transaction lifecycle and history

- A local draft is excluded from reports and synchronization.
- Saving makes a transaction effective immediately and queues it for sync.
- Do not expose confirmed/unconfirmed state because there is no bank-feed or
  reconciliation authority.
- Users correct saved records by editing or deleting them.
- Statistics and remaining allowance use only the latest effective revision.
- Transaction details allow users to expand a history showing who changed which
  fields and when.
- Deleting a saved record immediately removes it from summaries and synchronizes
  a content-free tombstone so a stale client cannot resurrect it.
- Deleted content and its revision history enter delayed encrypted cleanup;
  tombstones may retain only identity/version metadata indefinitely.

### Conflict behavior

- Concurrent changes to type, amount, occurrence date, category splits, or
  deletion state require explicit user resolution. Never silently choose a
  winner by timestamp.
- Disjoint non-financial scalar changes may merge by field. Tags and attachments
  merge by element. Concurrent edits to the same scalar field still conflict.
- While a transaction is conflicted, all replicas calculate that transaction's
  contribution from its last non-conflicting revision. Other transactions
  continue contributing normally.
- Conflict details preview each candidate's effect on spending and remaining
  allowance.
- Resolution may select one candidate, create a manually merged revision, or
  preserve the candidates as two independent transactions.

### Client platforms and local persistence

- Electron desktop is the first formal P0 client, using shared web UI code and
  native SQLite local persistence.
- SQLite is an internal local implementation detail, not a public backup format.
- P0 includes only a browser SQLite WASM/OPFS technical spike. A supported PWA
  follows a stable local transaction and sync foundation.
- Future mobile clients guarantee an immediate sync attempt on manual action,
  startup, and foreground resume. Background execution is opportunistic and has
  no real-time or fixed interval promise.
- Sync UI shows the last successful time, queued local changes, and actionable
  failure state. Local recording never blocks on object storage.

### Direct encrypted synchronization

- MVP clients connect directly to user-supplied S3/OSS-compatible object
  storage. There is no purpose-built relay, hosted account service, relay
  database, or PostgreSQL/MySQL adapter.
- Sync core depends on a vendor-neutral client-side object-store port rather than
  leaking a provider SDK into transaction/sync logic. MVP implements only the
  tested S3-compatible adapter; other provider adapters are future work.
- A fresh client restores using only object-storage endpoint/bucket details,
  valid storage credentials, and the local master password. It does not require
  an old device, QR pairing, or a separate recovery key.
- Object storage receives only ciphertext plus the minimum routing, version,
  size, and integrity metadata needed for object operations.
- A client with storage access, complete ciphertext, and the workspace root key
  can reconstruct the workspace plaintext locally.
- Offline behavior remains complete; object-storage failure affects only sync.

### Encryption and access model

- Generate a random high-entropy workspace root key.
- Derive a key-encryption key locally from the master password with a
  memory-hard password KDF, then wrap the root key. Store only the wrapped
  envelope, KDF salt/parameters, and ciphertext remotely.
- Derive purpose-separated data keys from the root key for workspace data and
  attachments. Never upload the plaintext root key or master password.
- Password changes rewrap the stable root key instead of re-encrypting the
  complete workspace.
- With no already-unlocked client, forgetting the master password makes the
  encrypted data permanently unrecoverable. There is no server reset or recovery
  backdoor.
- Creation and password-change flows must explain this loss boundary and prompt
  the user to create an encrypted full backup.
- Anyone given storage access and the master password enters the workspace's
  full shared-history trust domain. Private data requires a separate workspace.
- MVP has no Owner/Editor/Viewer or record-level permissions. Revocation relies
  on storage-credential rotation and, to prevent future decryption by a client
  retaining the old root key, encryption-key rotation. Existing local plaintext
  copies cannot be remotely erased.

### Checkpoints, retention, and deletion

- Object storage always retains enough encrypted state for a fresh authorized
  client to restore without another device.
- Clients periodically produce encrypted full checkpoints plus subsequent
  encrypted operations.
- Default retention is the latest three valid checkpoints and every operation
  newer than the oldest retained checkpoint.
- Operations already covered by retained checkpoints have a default 30-day
  grace period before deletion. Checkpoint count and grace period are
  configurable.
- Restore tries the newest checkpoint and may fall back to an older retained
  checkpoint after integrity failure.
- Transaction revisions and unresolved/resolved conflicts are durable business
  data inside checkpoints. Only redundant transport operations are compacted.
- Attachments are content-addressed, always client-encrypted, and stored in the
  same object backend. Referenced attachments cannot be collected; unreferenced
  blobs follow checkpoint and grace rules.
- MVP provides logical deletion and delayed purge, not immediate secure erasure.
  Storage-provider versioning/lifecycle rules may retain old ciphertext longer,
  and product copy must not claim otherwise.

### Backup and export

- The authoritative portable full backup is a versioned encrypted archive with
  the wrapped root-key envelope, complete checkpoint, required operations,
  tombstones, attachments, and integrity manifest.
- The archive restores without the original object store.
- CSV and versioned JSON are user-initiated readable exports. Warn explicitly
  that they are plaintext and let the user choose whether to include attachments
  where the format permits.
- Local SQLite files are not stable public backup or interchange formats.

### Upstream and licensing

- Keep the repository's existing custom `license` text.
- Closed-source derivatives and paid hosted services are acceptable.
- Intentionally accept that the custom license lacks standard OSI/SPDX
  recognition and may create interpretation and compliance-tooling uncertainty.
- Use Actual Budget's schema, transaction concepts, migrations, and tests as
  research references only. Do not fork it or depend on `loot-core`.
- A future isolated code port requires a focused fit/license review and
  preservation of applicable upstream notices.

## Scope

### In scope for the product baseline

- Offline income/expense entry, editing, deletion, category splits, reports,
  optional monthly allowance, attachments, history, and explicit conflicts.
- Electron-first local persistence.
- Direct zero-knowledge synchronization to compatible object storage.
- Encrypted full backup and plaintext interoperability exports.

### Out of scope

- Real account balances, transfers, reconciliation, bank feeds, payment, asset
  tracking, liabilities, net worth, and professional accounting.
- Refund, adjustment, reversal, void, or confirmed/unconfirmed transaction types.
- Multiple currencies, exchange rates, and historical revaluation.
- Dedicated relay deployment, hosted sync accounts, server-side plaintext,
  application-managed member roles, or field-level permissions.
- Immediate secure erasure across offline replicas and provider-retained object
  versions.
- A supported PWA or mobile client in P0.
- Product naming.

## Key Decisions

The requirements above are authoritative. This table maps the source PRD's
explicit section 14 questions to their final disposition.

### Source PRD decision closure

| Source section 14 item | Decision |
|---|---|
| Actual Budget fork / `loot-core` / reference | Reference only; no code dependency |
| Web SQLite WASM/OPFS / adapter | P0 spike only; Electron/native SQLite ships first |
| Relay SQLite / PostgreSQL | Superseded: no dedicated relay or relay database |
| Permanent operation log / compaction | Three encrypted checkpoints plus configurable 30-day grace |
| Multi-currency and rates | One currency per workspace; no exchange-rate model |
| Attachment encryption / external storage | Always E2EE; same direct S3/OSS-compatible backend |
| Mobile background guarantee | Foreground/manual guaranteed attempt; background opportunistic |
| Family complete-history access | Complete shared trust domain; no application-level roles in MVP |

## Acceptance Criteria

- [x] All eight explicit source decisions have an evidence-backed disposition.
- [x] Product type, transaction types, monthly-limit semantics, amount/date rules,
      history, conflicts, deletion, recovery, and backup behavior are explicit.
- [x] In-scope and out-of-scope behavior are observable and non-contradictory.
- [x] No user-owned product, scope, UX, compatibility, or risk decision remains
      blocking.
- [x] The selected decisions form a coherent MVP baseline for an open-source
      personal hobby project.

## Risks and Deferred Technical Research

- Define and review the exact authenticated-encryption, KDF parameter-tuning,
  subkey derivation, signing, key-rotation, and secret-storage suite before
  implementation. Use audited libraries and an independent security review.
- Design the immutable object layout, per-device operation streams, manifest
  discovery, conditional-write behavior, causal revision graph, checkpoint
  publication, corruption recovery, and provider conformance suite.
- Decide the exact S3/OSS provider compatibility matrix from tested API
  capabilities; “compatible” must not be claimed without conformance evidence.
- Run the browser SQLite WASM/OPFS compatibility and multi-tab locking spike
  before committing to the PWA storage adapter.
- Define versioned JSON and encrypted-backup schemas, forward migrations, and
  restore test vectors.
- Prototype root-key rotation before claiming that a revoked holder can be
  excluded from future ciphertext.
- If a dedicated relay is ever reintroduced, isolate its database behind a
  generic persistence port; MVP creates no relay database abstraction and makes
  no PostgreSQL/MySQL compatibility promise.
- These are technical design/research items. They do not change the resolved MVP
  behavior above and must be completed before product implementation starts.

## Evidence References

- Actual Budget repository and license:
  `https://github.com/actualbudget/actual`
- SQLite WASM persistent storage and OPFS constraints:
  `https://sqlite.org/wasm/doc/trunk/persistence.md`
- Android background-work restrictions:
  `https://developer.android.com/develop/background-work/background-tasks/bg-work-restrictions`
- Argon2 memory-hard password KDF specification:
  `https://datatracker.ietf.org/doc/html/rfc9106.html`
- OWASP password-storage guidance:
  `https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html`
