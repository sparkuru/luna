# Quality review — 2026-10-03

Status: final review passed for the submitted code and recorded evidence scope.
The active task remains incomplete. This review does not provide subjective
user satisfaction or independently repeat the device/server runs.

## Code and spec review

Reviewed `src/web/profile-host.ts`, `src/web/opfs-sah-exists.ts`, its unit
tests, and `tests/e2e/local-ledger-catalog.spec.ts` against task context and
frontend/backend specs. Compared the parser directly with the installed
`@sqlite.org/sqlite-wasm` 3.53.0-build1 `dist/index.mjs`, especially
`getAssociatedPath`, `setAssociatedPath`, and `computeDigest`.

- `.opaque` contains randomly named files. Virtual paths occupy the first
  512 bytes, flags are big-endian at 512, digest words are little-endian at
  516/520 on the supported Android/browser platforms, and payload starts at 4096.
- v1 digest is two zero words; `SQLITE_OPEN_MEMORY` selects the pinned v2
  two-accumulator algorithm. Exact NUL-terminated filename, main DB flag,
  absence of DELETEONCLOSE, digest and SQLite signature are checked.
- Discovery uses directory/file lookup and Blob reads only, with at most
  4112 bytes read per candidate. It does not initialize a pool, acquire a sync
  access handle, or write/repair files. Existing caller maps NotFoundError to
  unavailable; other errors propagate rather than authorizing creation.
- New Chrome regression forces the non-cross-origin-isolated SAH path,
  switches profiles, reloads, deletes a backing file while retaining its
  directory, and verifies unavailable/rejection after attempted selection.
- The new Android-runtime spec matches this behavior and requires format
  revalidation on SQLite dependency upgrades. Trellis Plus delegated acceptance
  policy preserves untested capabilities and does not invent user satisfaction.

No product-code defect was found. Review fixed missing regression coverage in
`src/web/opfs-sah-exists.test.ts`: v1 digest and DELETEONCLOSE/NUL cases,
bounded read-only traversal, and permission/lock/read error propagation.
This was the only code file changed by the reviewer.

## Commands actually run by reviewer

| Command | Result |
| --- | --- |
| `./hako npx tsx --test src/web/opfs-sah-exists.test.ts src/web/profile-host.test.ts` | 16/16 passed under Node 22 container |
| `./hako npm run typecheck` | Passed |
| `./hako npm run test:web -- tests/e2e/local-ledger-catalog.spec.ts --project=chrome --grep 'SAH profiles' --workers=1` | 1/1 passed; Vite development host, actual Chrome SAH storage |
| `node --check .trellis/tasks/09-30-manual-acceptance-followup/research/electron-path-a01-20261003.mjs` | Passed |
| `git diff --check` | Passed |
| `python3 .trellis/scripts/task.py validate 09-30-manual-acceptance-followup` | Passed; existing component-guidelines size warning described below |

The initial hako invocation could not access the Docker socket inside the
sandbox; the authorized elevated hako invocation succeeded. No independent lint
command/config is provided by this project, so lint is **not configured**, not
a claimed linter pass. No complete suite was rerun for this focused review.
Task validation warns that the 34623-byte component guideline exceeds the
32768-byte automatic injection limit. Its context entries still validate;
this warning is not an application lint/type/test failure.

## Evidence review

- A01: rebuilt packaged Electron provenance and path-projection checks are
  recorded. The main-process save-dialog substitute, historical GTK coverage,
  visible installation URLs and unverified OS sandbox enforcement are explicit.
- A02: Android 16/WebView 143 evidence records the actual SAH bug and fixed APK,
  profile isolation, force-stop/restart and missing-directory non-recreation.
  Airplane mode was not changed; local-only operation is not a radio-off test.
- A04: actual IME and two-step BACK checks are partial coverage. TalkBack and
  physical keyboard remain uncovered.
- A06: target-host stopped-copy restore 8/8 and initialization negatives 5/5
  are recorded, including failed attempts and temporary proxy adaptation.
  Running-copy rejection, Compose lifecycle and off-host restoration remain
  uncovered; `partial-pass` is correct.
- A03: final evidence includes real DocumentsUI export/selected file bytes,
  wrong-password preservation and new-profile restoration through host sessions,
  successful UI merge with begin/append/finish and a rendered success message,
  and both profiles read after force-stop/restart. The second isolated run
  additionally rejected damaged full-backup bytes without changing the snapshot
  and cancelled actual DocumentsUI save through system BACK while retaining
  the record. Its temporary `.acceptance` APK hash is recorded separately.
- A05: physical Android and workstation Chrome exchanged data over fully
  validated, scoped test-CA HTTPS. The evidence now distinguishes the temporary
  `.acceptance` APK and its SHA256 from the `.lan` APK used for A02–A04.
  CDP offline simulation, response-loss injection, manual-mode preservation,
  host-level conflict resolution and final convergence are recorded. The second
  run additionally displayed both actual Android conflict candidates and used
  the UI selection, then proved automatic offline-write recovery/poll delivery
  without explicit sync/probe calls. Physical radio disconnection, attachment
  transfer and paired service/client reboot were not covered. The temporary
  CA does not prove release-default certificate trust.
- A07: temporary scoped CA/IP HTTPS does not establish durable public-domain
  deployment, renewal, or operational handoff.

The final A05 infrastructure record reports both rounds' exact-label
service/network removal, verified local/remote task-directory absence, and
dedicated NSS trust cleanup.
Images remain cached. A transient driver exception exposed a synthetic bearer;
the record states its account/session database and service were destroyed to
invalidate it. The token itself is absent from the committed-evidence candidates.

Read all five new dated JSON evidence records and parsed them with Node.
Private-key markers, Bearer credential values and common credential-valued JSON
fields had zero matches. This is a targeted scan plus content review, not a
claim to have audited all historical logs. The Electron harness contains only
an explicitly synthetic test passphrase, not a real credential.

The first-run Android record now reports removal of both task-installed
packages, synthetic backup files, XML dumps and ADB forwards. The implementation
plan has been updated to the delegated acceptance policy and the design permits
the authorized minimal product repair.

The second isolated run's A03/A05 results, server cleanup and Android package/
forward/build-context cleanup have been reconciled with the final PRD and
implementation plan. All five JSON files parsed again after final updates,
with zero targeted credential-pattern matches. Final `git diff --check` passed.

## Final conclusion and remaining scope

No unresolved product-code findings or evidence-summary contradictions were
found. PRD/design/implementation now agree on delegated observable acceptance,
minimal authorized repairs and preservation of incomplete criteria. A01/A02/
A03/A05 conclusions apply only to their stated tested scope; historical native
chooser evidence, scoped test-CA APKs and injected network failures remain
clearly distinguished from this run's direct observations.

A04 still lacks TalkBack traversal and physical-keyboard evidence. A06 still
lacks running-copy runtime refusal and Compose lifecycle acceptance. A07 still
needs a durable domain/certificate-renewal and operational handoff environment.
These are open acceptance work, not waived requirements. The task must remain
active and unarchived; no subjective satisfaction is asserted. The existing
context-size warning remains documented above. No task archive or commit was
performed by reviewer.
