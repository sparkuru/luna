# Research: independent executable-plan review

- Query: Do revised PRD/design/attachment/implementation/acceptance documents leave material correctness or delivery ambiguities?
- Scope: internal read-only plan/source review; writes only this research artifact
- Date: 2026-09-12

## Findings

Reviewed `prd.md`, `design.md`, `attachment-contract.md`, `implement.md`, `acceptance.md` revision 2. Overall direction is implementable and substantially grounded in current adapters. The following material findings should be resolved in the normative contract before handoff. Line references below refer to the reviewed revision and may move during main-session fixes.

### Final re-review status (2026-09-12, after main-session corrections)

**Verdict: PASS for planning coherence and implementation handoff. All four previously identified blocking/material findings are resolved in the written contract. No remaining blocking finding was identified in this re-review. This is not product validation or a cryptographic security audit.** Historical findings below are preserved for traceability, not outstanding work.

| Finding | Status | Verified correction |
| --- | --- | --- |
| 1 — offline local v2 vs remote v1 | Resolved | `attachment-contract.md:86` defines durable per-target `highestObservedRemotePayloadVersion`, legitimate first v1 normalize/CAS upgrade, post-v2 replay rejection, lost PUT response confirmation and target isolation. Acceptance D includes first upgrade/replay/new-target cases. |
| 2 — stale reservation cleanup | Resolved | `attachment-contract.md:102` uses ledger/id/generation physical keys, token-checked finalization, invalidation before cleanup and metadata-reference checks; explicitly accounts for late physical uploads. Acceptance D pauses old cleanup while a new token publishes and checks both data and quota. |
| 3 — repair contradicts immutable create | Resolved | `attachment-contract.md:96`, `:106`, `:112`–`:114` define narrow HTTP repair, original immutable digest/length constraints, generation-key pointer CAS, and S3 observed-ETag conditional replacement of authenticated original bytes. Normal different-descriptor collision rejection remains intact. Tests include healthy no-op, mismatched metadata, 412 and revoke. |
| 4 — over-quota branch union | Resolved | `attachment-contract.md:120`–`:122` require union inventory preflight before local merge/head publication; explicit merge-quota error preserves both sides, applies to CAS retries/profile migration/restore, and explains retained history cannot be freed by visible delete. Acceptance D covers byte/count union overflow. |

Additional corrections verified:

- `attachment-contract.md:32` requires separate internal `StoredTransaction` and public safe `Transaction` types/decoders, in addition to actual IPC projection/removal.
- `attachment-contract.md:60` defines Web/Electron file input plus Android bounded selection adapter and clear native validation gate, with no arbitrary content URI exposure.
- `attachment-contract.md:149` permits unknown SAF size, enforces actual streamed bytes/header/EOF, and has corresponding acceptance E coverage.
- `attachment-contract.md:145` chooses incremental SHA-256 rather than constructing a whole-backup array. The referenced dependency is actually present: `package.json:65` pins `@noble/hashes` 2.4.0 (also root package-lock entry).
- `implement.md:56` explicitly schedules target-version checkpoint, generation-fenced reservations, constrained repair and merge quota gates with independent failure tests.
- Header/footer calculations and old Web schema3 full-host rejection findings remain unchanged and valid.

Residual non-blocking implementation checks: revalidate computed union/capacity against the current graph **inside** the final storage transaction or CAS retry boundary; do not trust an earlier in-memory preflight when concurrent local writes occurred. Existing atomic-current-state and final-transaction instructions already require this invariant. New repair uses a metadata-version ETag rather than treating a corrupt object's content digest as its authorization token; golden HTTP fixtures should distinguish those values. Mobile image decode and large-backup memory remain empirical acceptance gates, not planning guarantees.

No code was edited, tests run, or devices/providers contacted during this re-review. Only this research artifact was updated.

### 1. Material: local v2 upgrade must not reject the legitimate still-v1 remote head

- Evidence: `attachment-contract.md:69` permits first-use/offline v2 upgrade; `:171` explicitly allows devices independently upgrading offline. But `:82` says a v2 client encountering downgrade rejects, without defining the remote-version checkpoint or distinguishing local format from remote format. Existing `src/sync/ledger-service.ts:155`–`:170` always fetches and decrypts the remote before merge.
- Reproduction: existing remote v1; device offline adds first image and becomes local v2; reconnects, reads untouched remote v1. Treating local v2 as minimum remote version permanently blocks its first normal upgrade sync. Conversely always allowing remote v1 defeats the stated downgrade detection after a successful upgrade.
- Required decision: maintain a **per-target** highest authenticated observed/published remote version (target identity includes actual S3 endpoint/bucket/prefix or HTTP ledger binding); before ever observing/publishing remote v2, allow verified v1 decode+normalize+union and CAS upgrade. Once remote v2 has been observed/published, reject later v1. Do not reuse this minimum across unrelated target connections. Specify how durable profile bindings remember it without storing credentials, and how import-only v2 data does not imply that its new target was upgraded.
- Tests: offline local upgrade against still-v1 target; v2 observed then v1 replay; change target with local v2 to a legitimate v1 source; two offline upgrades with CAS contention.

### 2. Blocking data-integrity risk: expired-upload cleanup needs physical-object fencing

- Evidence: `attachment-contract.md:95` releases expired reservations after cleaning corresponding objects, `:97` adds removeStagedObject and describes ledger/id object keys, while `:93` allows same-ID retries. No generation-specific physical key or ownership-conditional cleanup is defined. Current physical object interface has only ordinary get/put (`src/server/storage/object-store.ts:18`–`:30`); existing DB metadata points to object keys (`src/server/db/operations.ts:162`, `:174`). The plan introduces new delete/reconciliation behavior, so existing code does not provide the missing guard.
- Reproduction: reservation A expires; sweeper determines A's object is unpublished; retry B acquires same ledger/image ID and publishes matching bytes at the same physical key; A's delayed cleanup deletes B's now-published object. Rechecking A's metadata before network DELETE is insufficient because B can publish between the check and delete.
- Required decision: include reservation generation in **server physical object keys**, e.g. controlled ledger/id/reservation UUID; published metadata points to the winning object. Finalize must CAS the active reservation ID/status, and cleanup can delete only that reservation's never-published generation key. Retry/digest-equivalent publication adopts/reconciles its own winning reservation, and cannot let a stale actor publish or debit/release another reservation. Published inventory is never the target of staged cleanup. The public logical attachment ID remains stable. An equivalent strictly serialized/fenced design is possible but must be specified, not left as “确认不可发布”.
- Tests: pause cleanup after metadata inspection, publish a retry, resume deletion; pause stale upload across lease expiry and new reservation; ensure current published GET and quota counters remain correct.

### 3. Material: corrupted-object repair conflicts with immutable create-only transport

- Evidence: `attachment-contract.md:89`, `:93`, `:103` require create-only objects and conflict on different existing bytes; `:111`/`:160` and `acceptance.md` D promise a device with good bytes can repair missing/corrupted remote images. Existing `ServerObjectStore.put` supports conditional operations, but there is no repair authorization/integrity contract or immutable transport repair method.
- Reproduction: graph expects digest H; remote key exists with truncated/corrupt bytes C. Device has correct H bytes and retries upload. `If-None-Match:*` fails; verifying existing bytes detects C != H; mandated immutable-ID conflict rejects forever. If HTTP repeated-ID handling trusts published metadata H instead of verifying bytes, it may instead return false success without repairing C.
- Required decision: either add a narrowly defined authenticated repair operation (only replace corrupt physical storage with ciphertext matching the already-committed descriptor/inventory digest, observed-object CAS, no changing logical descriptor; analogous S3 conditional repair) or explicitly state automatic retry repairs **absence only**, corruption requires a separate operator/local recovery path and is never reported fixed. Remove the unconditional repair promise if repair is out of scope. Do not relax duplicate-ID collision rejection globally.
- Tests: metadata says H but underlying bytes differ; existing correct object never replaced; repair permission/CAS race; status stays error unless actual reread/digest validation succeeds.

### 4. Material: offline concurrent-image quota overflow has no defined merge policy

- Evidence: `attachment-contract.md:19` bounds each ledger at 512 MiB and `:67` checks local commit quota; `:109` merges latest financial graph before transfers; `:148`–`:149` explicitly define union-quota failure for restore but no equivalent sync rule. `:105` correctly disclaims hard direct-S3 quota. Existing graph merge is set union and rejects invalid candidates (`src/shared/ledger-sync.ts:84` onward); silently dropping references/history is not permitted.
- Reproduction: two devices each offline add distinct 300 MiB collections under their individual 512 MiB quota. Their graph union references 600 MiB. Implementer must currently guess whether to reject all remote financial edits, commit an over-quota graph then leave images missing, exceed local capacity, or prune data. Full backup also remains capped at 544 MiB.
- Required decision: define quota on merged referenced inventory and a safe explicit outcome. Recommended first release: reject the over-limit candidate **before local graph merge**, preserve both local and remote graphs/images, return a distinct merge-quota error with actual required bytes/count and export/independent-profile guidance; never prune history or claim synced. This is an unavoidable capacity conflict under fixed ceilings; document the limitation and do not claim that deleting current images frees retained history. Apply the same preflight to profile migration, and distinguish local disk shortage from protocol inventory overflow.
- Tests: two under-limit branches whose union exceeds count/bytes limits; no partial local merge or unintended head overwrite; existing images remain exportable separately; ordinary no-image local bookkeeping remains possible.

## Checks that passed / important non-blocking clarifications

- **Backup header is exactly 56 bytes:** 8+2+2+4+16+12+4+8. Footer is 8+32=40. No off-by-four issue. Manifest encrypted length is known before encryption because GCM adds exactly 16 bytes, so complete-header AAD and total length are constructible without a circular hash dependency. Ordered authenticated descriptor inventory plus exact EOF makes the non-keyed footer an appropriate structural check, not claimed standalone authentication.
- **Renderer key boundary is explicitly addressed:** `attachment-contract.md:38`–`:42` removes actual raw graph preload/IPC, projects conflicts and all mutation receipts. This correctly responds to current unsafe-for-keyed-graphs APIs (`src/shared/api.ts:32`–`:34`, `src/preload.ts:51`–`:54`, `src/main/ipc.ts:63`–`:67`). Require runtime DTO tests, as already listed.
- **Old Web persisted-state guard is available:** old `src/web/web-api.ts:419`–`:427` rejects schema3; old IDB opens explicit version1 and handles versionchange (`src/web/browser-state-store.ts:198`–`:256`), so upgrading to2 prevents ordinary old adapter reopening. Old OPFS worker itself does not know a future storageSchemaVersion (`src/web/sqlite-wasm.worker.ts:55`–`:100`), therefore do not claim adding that worker marker alone blocks old code. Ensure state schema3 and graph upgrade commit together, and test old **full host** behavior; an old cached raw-state CAS must fail against changed bytes. A coherent state-version transaction is sufficient for normal financial APIs.
- **File streaming ownership is specified:** Web OPFS file, native Electron stream and Android SAF chunk sessions are clearly separated, with <=1 MiB bridge chunks and no full backup JSON. A remaining non-blocking implementation detail is Android providers with unknown document length: `beginBackupImport(totalBytes,password)`/`beginOpen→size` should allow unknown size and enforce authenticated header length plus counted bytes, or explicitly give a supported-provider error. Do not trust provider-reported size instead of EOF/count validation. No Android provider was contacted for this review.
- **Same object graph head is correct:** both old and new clients use the one original remote key/route; CAS protects in-flight old writes, HTTP adds a durable minimum payload version, and S3 downgrade resistance is honestly weaker. Finding1 concerns the missing transition checkpoint, not the choice of key.
- **No product implementation authorization was accidentally restored:** PRD and implementation plan both remain planning-only and protect unrelated SDK/deployment changes. P1–P6 provide independent exits, and native device verification is not falsely inferred from browser tests.

## Caveats / Not Found

- This is a plan/source review, not executed cryptographic, browser, native, provider or load validation. No code/test/device changes were made.
- Proposed protocol still needs the P1 golden fixtures and normative codecs; review passing after these edits would establish plan coherence, not security audit completion.
- Maximum-image decoding and near-capacity mobile memory remain measured implementation gates, correctly called out by acceptance criteria.
