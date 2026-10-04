# A07 independent quality review, 2026-10-05

Status: passed. A07's current authorized technical acceptance is complete;
A01–A06 remain accepted at their recorded scope. The task is technically ready
for archive bookkeeping. No commit or archive was performed by this reviewer.

## Scope and context

The user resumed `https://luna.majo.im` and supplied VPS access in updated
configuration A. The current PRD/design/implementation plan supersede the
10/04 deployment deferral. A01–A06 evidence remains historical accepted
evidence; TalkBack and voice acceptance remain canceled.

Read `check.jsonl`, all thirteen initially registered files in full, then PRD/design/
implementation plan. Read the oversized component guideline directly in two
parts, rather than treating truncated injection as complete loading. Read the
project policy index, mainline and remote-task skill; inspect the current
worktree without staging or modifying others' changes. Read the two final A07
evidence registrations as they were added, bringing the manifest to fifteen,
and refresh current task/spec/mainline completion wording before this verdict.

## Initial findings

- The isolated deployment plan preserves the existing Sep28 installation and
  its data, uses a separate project and persistent tree, and retains loopback
  publication/private API and MinIO services. A Luna-only certificate and
  renewal boundary avoid replacing the unrelated expired wildcard certificate.
- The client harness distinguishes real Web UI creation/restore and image
  transfer from Android image creation through the public host API; the latter
  is not native DocumentsUI coverage. Default browser/system trust must remain
  active, with no added CA or certificate bypass.
- A scheduled renewal unit is not proof of renewal execution. Final evidence
  must distinguish initial issuance, an actual not-due renewal check, installed
  certificate integration/reload, and a future renewed certificate issuance.
- At review start no physical Android was connected. Fresh narrow Chrome cannot
  substitute for the current PRD's real Android/system-trust criterion. This
  was an initial prerequisite, not a failing product result. The user later
  connected Android 15 / WebView 134; actual endpoint acceptance was then pending
  and subsequently passed as recorded below.
- Requested the client implementer to assert/record absent cold-relaunch
  authentication separately from normal-tab reload session continuity, so the
  harness cannot silently accept both states while claiming one. Implementer
  added account-null/connected-false/remote-configured-false assertions for
  actual cold Chrome and Android starts, while retaining normal reload's
  account-present assertion and exact durable binding/data/image checks.
- The first public client run uploaded from the first Chrome UI, then timed
  out waiting for an account-page control after the fresh second client's
  successful connection navigated to the ledger. The repaired harness waits
  for actual host connection, returns through account UI, and preserves sync,
  manual-mode and exact data/image/viewer assertions. Its resume mode uses the
  original profile directories and does not claim a second fresh start.
- A second harness wait targeted a hidden image action on narrow/native
  presentation. Actual renderer places that action in a closed transaction
  `<details>` menu. The harness now opens its real nearest disclosure before
  clicking, preserving visible decoded-image assertions and every exact
  snapshot/binding/normalized-byte check. This is not a product-source change
  or a reason to call the original initial run entirely green.
- Native device naming is also in a real optional `<details>` section
  (`DeviceContainer` in the renderer). The harness opens that disclosure only
  when the field is hidden. A later native resume retains the already bound
  session/profile and forbids duplicating the unique native upload; the
  original mobile control/route wait remains a failed harness attempt.
- A final first-Chrome pull exposed an immediate `isVisible()` assumption
  before authentication controls finished loading. The helper now waits for
  either the visible login form or existing account identity, then retains
  submission/identity checks. Actual successful login/unlock and two-image
  readback distinguish this harness timing correction from an inferred server
  authentication or rate-limit failure.

## Independently verified deployment

Read-only SSH verification used the existing known host key and explicit local
SSH configuration fallback. No remote service/configuration mutation by reviewer.

- `/opt/luna/current` resolves to
  `/opt/luna/releases/20261005-bf4071f3fbdd77ac`. Its source-manifest SHA-256 is
  `bf4071f3fbdd77ac3311d07e2c14c9ac7fc03af7f4da615f7f381093dc05bacf`.
  All 137 manifest entries independently match the local current worktree;
  remote manifest and detail-focus/CSS/bucket-initializer fingerprints match.
  An independent network-disabled/read-only Node container recomputed all
  137 deployed source hashes with zero mismatches. All 23 running API compiled
  files independently match local `dist/server`; all 15 running Web static
  assets match the local release-image asset manifest, with no extra files.
- The dedicated Nginx include resolves to `/opt/luna/ops/nginx.conf`; `nginx -t`
  passes. HTTP-01 remains accessible and other HTTP traffic redirects to Luna
  HTTPS. TLS proxies only to loopback 18111, preserving Origin, Authorization,
  conditional/idempotency headers and ETag; request/response buffering is off.
- Trusted VPS public requests to `/` and `/api/v1/meta` return 200 with curl
  TLS verification result zero and no bypass. Installed certificate SAN is
  only `luna.majo.im`, issuer Let's Encrypt YE1, valid 2026-10-04 15:48:28 UTC
  to 2027-01-02 15:48:27 UTC. Public certificate SHA-256 fingerprint is
  `F323F20C4175E21C888FCE2C8C0D6FFC8BC72D1E9DCB41EFDE839ECB4C22FA8B`.
  Certificate/key files are 0600; ACME home, data and backups are 0700.
- Root-owned renewal service runs the existing ACME executable as `wkyuu`
  with dedicated `/opt/luna/ops/acme-home` and umask 0077. Its actual run on
  October 5 ended `Result=success`, status zero. The timer is enabled/active,
  daily with randomized delay and `Persistent=true`; observed next run is
  October 6 00:30:10 +08. Saved installation metadata targets the dedicated
  key/fullchain and the fixed `nginx -t && systemctl reload nginx` hook; next
  renewal due is December 2. This verifies execution/integration, not future
  renewed issuance or uninterrupted service until expiration.
- Production Web/API are healthy. Only Web publishes
  `127.0.0.1:18111->8080`; API/MinIO have no host bindings. All three have
  read-only rootfs, dropped ALL capabilities and no-new-privileges. Web image
  ID `69a043ed22c6a3bbd4317db95d319e18bdea9e5220322734b15ef46462f6fa26`;
  API `2483ce467999ac00d42521e41458f922acdf5975609efe01fee51629b39dc65b`;
  MinIO `69b2ec208575b69597784255eec6fa6a2985ee9e1a47f4411a51f7f5fdd193a9`.
- The old Sep28 Web/API/MinIO retain container IDs `e58529f8ff7b`,
  `d9aa40da326c`, `1c39da9cc2f6`, remain running for six days, and retain
  loopback 18110. Reviewer did not access their data.
- Read the installed `luna-compose` wrapper and `operations.md`: explicit
  project/env/release boundary, interactive hidden-password account commands,
  stopped full-tree backup/restart, dedicated renewal checks and bounded
  route rollback/new-directory recovery preserve existing and new data.
  There is no added sudoers rule or credential argument.

## Client, lifecycle and privacy verification

Read the real client result and replay after the repairs: two original fresh
Chrome profiles have exact recovered transaction/binding/normalized image bytes
and a decoded visible image viewer; normal reload retains the account session;
both actual closed-browser relaunches after service restart clear memory-only
account/remote configuration, retain the durable copy, and reauthenticate,
unlock, synchronize and read back the same data. The normalized one-pixel PNG
is 88 bytes, SHA-256
`1b1593b61b3c83f6f7f2a20699e1c46233ce5c60855e2779d2f4c2645171802c`.
Original fixed-stage failures and resume attempts remain in the result.

Reviewed the stopped-backup/restart script and safe persisted summaries:
it captures all six metadata tables inside one transaction, stops only new
Web/API/MinIO writers, traps restart on failure, invokes the product backup,
compares complete paths/bytes/modes/UIDs/GIDs including root metadata, starts
the owned stack and checks readiness before comparing metadata again.
Source and backup summaries match: 21 files, 132342 bytes, complete-tree SHA
`124a9af806ddcc2e9b18ebd78d99a1aaf3b676a770b59a3243c92014d496036b`;
backup root is 0700. Before/after six-table SHA is
`e79f71273bace91116f3e4519b78da4147db0e740fa598654530cad88adc15e8`,
schema 3 and instance identity unchanged. The active-copy attempt refused;
the stopped product command returned `LUNA_SERVER_BACKUP_OK`. Independent
post-restart public metadata still reports the same instance and Web/API healthy.
This copy contains the initial Chrome-seeded one transaction/image, before the
later native upload and final account revocation. Restoring this pre-revocation
copy requires password/session revocation before traffic, now explicitly
documented in the operator handoff. It is not a backup of later native data.

After the native upload, a second restart checks application continuity without
repeating the copy test. Six-table metadata SHA before/after is
`fef9433a743e7e783e3fac0f5a1646e1356f23e9da295d1811967b682488380d`,
including stored ciphertext hashes, ETags and session state; at that point there
are two attachments, five idempotency rows and eight sessions. The first startup
readiness poll returned 502; bounded retry then reached 200 with TLS verify zero
and healthy Web/API. This is a maintenance interruption, not uninterrupted
uptime. It does not assert unchanged MinIO housekeeping files or a second backup.

Read the log-audit implementation and its initial snapshot result: it checks
seven distinct actual synthetic password/bearer strings, bearer patterns and
an exact five-field API schema; no secret value is printed. All 250 initial
API events pass, Web/proxy logs are empty. Actual application logging uses
the route template, not raw request URLs. This snapshot precedes remaining
native traffic; at that stage final logs and session revocation remained open.

Final client JSON/Markdown now cover the real Android public HTTPS connection,
UI recovery/viewer and unique native public-host image upload; its live memory
session synchronized without re-login after the second server restart. Actual
force-stop/relaunch changed PID 8322 to 8679, cleared volatile sessions, retained
the exact durable two-transaction/two-image copy and binding, and passed normal
login/unlock/sync. Both original Chrome profiles subsequently downloaded the
native-originated transaction and exact image. The native fixture is a valid
70-byte PNG, SHA-256
`2e9e614a233d1845c927cdda9175ec8bdf3929c242f4d2ad97a90547bf19974e`;
this is public-host staging/sync, not native DocumentsUI or normalization UI.
The final result has 13 pass events / 12 unique checks and retains seven
fixed-stage failures; it is not a single entirely green initial run.

Independently compared all 204 APK build-input hashes against the current
worktree, with zero mismatches. Final replay SHA matches its JSON; reconstruction
of the complete embedded client result matches original result SHA
`7d4a26d9a2018f7f35bfcba106c354673c4f21cf29d409836d8434a84573b937`.
The installed APK was hashed before uninstall and matched the build artifact.

Final VPS evidence records a pre-revocation audit of 781 API events, then only
the owned account reset, all nine known old bearer checks and old-password
check (each 401), followed by the complete 794-event audit. All six sources
(new API/Web/MinIO/bucket-init/instance-init/proxy) have zero matches for eleven
known client password/bearer strings, four internal credential strings and
bearer patterns; API logs retain only the five permitted metadata fields.
Internal strings were compared only inside the VPS helper, never exported.
All eleven stored test sessions are revoked; active sessions are zero. Test
data stays encrypted on the private persistent tree; the early backup retains
the documented pre-revocation restore-auth caveat.

Device cleanup verified owned package/forward absence and unchanged
accessibility null/0/0. Local client and VPS exact scratch directories are
independently absent; owner evidence confirms remote scratch/four helpers and
dedicated client image/tag removed without broad force/prune. Persistent
deployment/TLS/releases/backup/operator files and ordinary build caches remain.
There were two transient SSH closures; later key authentication and public
metadata succeeded. No SSH/firewall/reboot/limiter change or guessed failure
cause is asserted.

Current client harness JavaScript syntax and `git diff --check` passed. Project
Node 22 `./hako npm run typecheck` passed; first sandboxed attempt was denied
access to Docker socket, then the scoped approved wrapper run succeeded.
No package lint script exists; syntax/whitespace checks are the applicable
script checks. The existing complete browser validation remains historical;
unchanged product source does not warrant a duplicate ten-minute run.

The public client operation initially encountered two automatic approval review
rejections about sending the synthetic login/data to the public destination.
No indirect route bypassed that decision; clients stayed without public login
or writes during the pause. The user then explicitly answered “授权，继续 A07
验收” to the question naming `https://luna.majo.im`, the dedicated synthetic
account credentials, transactions and one-pixel image. Main resumed the same
bounded operation with that authorization. This was an execution authorization
boundary, not an application failure.

## Final findings and gate

No unresolved in-scope product or evidence defect remains. During review,
coordinated fixes strengthened cold-start/session assertions and replaced
incorrect route, collapsed-control and loading assumptions in the replay.
All original failed stages remain visible. The VPS evidence owner also
corrected the final image wording from two normalized images to two exact
images: the Web PNG is normalized, while the native public-host fixture is a
valid separate PNG. The owner explicitly recorded final local scratch cleanup.
This reviewer modified only this report; the respective owners applied those
harness/evidence corrections.

The final PRD, design, implementation plan, task metadata and mainline now
agree on A01–A07 technical acceptance, historic 10/04 deferral, current default
trust, exact client/data/session scope, lifecycle/backup timing, revocation and
cleanup. The updated deployment spec preserves the same observable contracts.
The independent-review boxes are intentionally left pending for the main
session to tick after receiving this verdict; commit/archive bookkeeping is
also intentionally pending, and `task.json` remains `in_progress`.

Final verification: JavaScript syntax and whitespace checks pass; project
Node22 typecheck passed earlier in this unchanged-source review. Task context
validation passes for 15 implement and 15 check entries, retaining the known
oversized component-file warning addressed by complete direct reads. JSON
parsing and both exact owned local scratch-absence checks pass. Existing
A01–A06 tests and full production coverage retain their dated scope; the
actual A07 runtime tests pass after the documented harness retries. No new
product tests or duplicate complete browser run were needed for these final
documentation-only changes.

No extra human acceptance is needed for the authorized observable scope;
subjective satisfaction is unclaimed. Future issuance, months of uptime,
hardware-keyboard coverage, native DocumentsUI image selection and canceled
TalkBack remain accurately bounded rather than inferred. The initial
absent/disconnected device and approval holds have actual successful follow-up
evidence and remain in the history.

No product source or remote state changed by this reviewer. No commit/archive.
