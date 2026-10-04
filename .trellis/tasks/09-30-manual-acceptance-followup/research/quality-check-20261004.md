# Closeout quality review — 2026-10-04

Status: final code and evidence review passed for the approved scope.
The complete production browser run's two SAH fixture failures were
diagnosed and the corrected full catalog file passed in both modes. This is
complete verified coverage across recorded runs, not a claimed clean single
328-test run. The main session owns summaries, commits and archive.

## Scope and source review

Loaded all check-context references directly, task PRD/design/implementation,
frontend/backend indexes and quality rules, and Trellis Plus details. Read the
complete component guideline instead of relying on truncated
injection. Reviewed the final detail-focus change, server-account test split,
stopped-backup entrypoint, bucket initializer proxy fix and A06 Compose harness.

- Transaction detail records its opener only when actually closing. Radix
  close-autofocus queues restoration after scope teardown with `preventScroll`;
  transition into editing does not request opener restoration. The existing
  deleted-opener fallback remains. Browser assertions cover BACK, close,
  Escape and editor focus.
- General server login/copy/restore runs in development and production. Cold
  offline reopening runs only with the production shell and additionally checks
  its controlling Service Worker and actual offline state. Original financial,
  image, profile and persistence assertions remain. The original development
  failures are retained with their uncached Worker-request cause.
- Backup resolves the data/destination boundaries, refuses overlapping paths,
  existing destinations, incomplete/unsafe state and active overlapping Docker
  mounts. The final guard conservatively refuses any non-Unix `DOCKER_HOST`,
  including conflicts with `DOCKER_CONTEXT`, then requires the selected
  context's local Unix socket. Bind mounts are canonicalized; Docker volume
  paths are compared without opening root-only volume directories. `cp -a`
  preserves the complete tree and ownership; publication uses an owned staging
  tree. Failure removes only owned staging and an empty reservation, retaining
  source and unexpected destination contents.
- Repeated running-mount checks are detection, not a lock against restarting
  containers or non-container writers. Help, design and deployment spec state
  the required operator-controlled stopped window and do not claim arbitrary
  `cp` or `rsync` is intercepted.
- Only the private-MinIO `mc` subprocess has HTTP/HTTPS/ALL proxy variables
  removed. Host/build proxy settings and the API/MinIO isolation boundary stay
  intact. Actual target Compose execution is a separate evidence gate.

No product-code defect requiring reviewer edits was found in these paths.
During evidence reconciliation the reviewer flagged a transient mismatch between
the daemon-guard description and in-flight source; the implementer synchronized
the final conservative guard and its regression with the main session's spec.
The main session synchronized deployment/backup and browser-validation rules
after the reviewer flagged the missing new entrypoint documentation.

## Reviewer checks actually run

| Command | Result |
| --- | --- |
| `./hako npm run typecheck` | Passed |
| `./hako node --test tests/deploy/backup.test.mjs tests/deploy/instance-init.test.mjs` | 13/13 passed: eight backup tests and five initialization tests |
| `node --check deploy/backup.mjs` | Passed |
| `node --check deploy/bucket-init.mjs` | Passed |
| `node --check tests/deploy/backup.test.mjs` | Passed |
| `node --check` for all three new A04 replay drivers and the A06 Compose replay | Passed |
| `git diff --check` | Passed |
| `python3 .trellis/scripts/task.py validate 09-30-manual-acceptance-followup` | Passed, final 13 entries per context; 35923-byte component guideline exceeds injection limit and was read directly |

Initial sandboxed hako execution could not access the Docker socket. The
authorized elevated wrapper invocation ran successfully. No dedicated linter
is configured in package scripts; JavaScript syntax and diff checks passed,
without representing them as a configured linter result.

## Acceptance evidence review

Existing A01/A02/A03/A05 evidence remains consistent with its stated tested
scope. Packaged Electron main-dialog substitution and historical real GTK
checks remain distinct. Android SAH isolation/restart/missing-profile checks
are physical-device evidence; local-only writing does not claim airplane-mode
testing. Real DocumentsUI export/selection/cancellation and full-backup
wrong-password/corruption/new-profile restoration preserve data. A05 uses
physical Android and workstation Chrome with scoped test-CA HTTPS; CDP network
interruption and lost-response injection, actual conflict selection, manual
mode preservation and automatic recovery are recorded separately.

User explicitly canceled TalkBack acceptance while retaining keyboard/IME/BACK.
No physical alphabetic keyboard is claimed; the original real-system-IME
alternative remains accepted scope. Reader activation is not a product voice
requirement or completion gate. A07 is explicitly deferred by the user because
durable domain/certificate-renewal/deployment inputs are absent; it is not
passed. Subjective user satisfaction is not invented.

A04's final JSON/Markdown retains the original BODY-focus failure and shows
the corrected installed APK passing actual BACK/Close, injected native Escape
and editor focus, with the same committed ledger preserved. Actual Baidu IME,
two-stage BACK, draft restoration, category/filter/usage focus, budget footer,
DocumentsUI cancellation, validation errors and force-stop readback cover the
revised scope. Visible native control names have no recorded blank entries;
eight-step virtual TAB samples remain samples. The recorded final renderer
SHA256 matches the reviewed source. Task packages/observer/forward/scratch are
removed and exact original accessibility settings are restored.

A06's final target record shows real Compose 11/11 and restore smoke 8/8.
Runtime backup refusal and stopped full-directory copy, independent restore,
session/instance/graph/attachment ciphertext/ETag/usage/idempotency/CAS,
restart, inherited-proxy Web health, sandbox/network boundaries and four
non-destructive bootstrap negatives are explicit assertions in the replay.
The reviewed product/harness hashes match its recorded provenance. An
image-only override selects the verified pinned-equivalent cached MinIO image
after registry retrieval failed; bucket image changes only the reviewed script.
The target Web image predates the renderer-only focus correction, and is
claimed only for deployment behavior; final renderer/browser/APK coverage is
separate. Exact task resources and remote scratch are removed; cached images
remain. Off-host transfer and production traffic cutover remain unclaimed.

The final conservative daemon guard and unrelated root-only volume regression
were independently rerun: 13/13 passed again. Dated evidence JSON parsed and
targeted private-key/Bearer-value/credential-field scans had zero matches across
13 dated 20261004 files at review time. Synthetic fixture passphrases in replay
code are explicit synthetic inputs, not user credentials. No microphone/voice
implementation or permission matched the source/Android search. This is a
targeted evidence review, not an independent security audit.

The full production browser run completed with **326 passed, two failed, zero
skips**. Both failures were the SAH case after reload, on desktop and narrow
Chrome. A repeated unchanged run failed identically; a diagnostic runtime
assertion proved isolation changed from false to true after the production
Service Worker served its cached original-header HTML. The fixture therefore
switched from SAH to regular OPFS midway through its scenario.

Only this test now uses a scoped `serviceWorkers: "block"` context, consistent
with its bundled non-isolated host scenario. Its original data/profile/backing-
file/rejection assertions remain, and both reloads additionally assert false
isolation. The two ordinary catalog cases keep default Worker behavior; all
other production offline cases stay enabled. The corrected complete catalog
file passed **production 6/6 and development 6/6**, with zero skips, followed by
typecheck. See [SAH fixture evidence](e2e-sah-production-check-20261004.md).
No application source changed after the full run.

This narrowly scoped fixture correction plus the passing neighboring cases
justifies using the original 326 passes and final focused production result
for complete verified coverage. The original failed run stays failed in the
record. Repeating the unaffected 326 cases would add no evidence for this
context-only fix. Final task summaries must use the same precise result model.

## Final conclusion

A01–A06 satisfy the current approved technical acceptance scope through the
dated evidence and directly verified regressions. A07 is user-deferred, and
TalkBack is user-canceled; neither is labeled passed. No unresolved product-
code or in-scope acceptance finding remains. Existing physical-keyboard,
vendor/version, network-emulation, scoped-CA, off-host-cutover and subjective
satisfaction limitations remain explicit.

The technical quality gate is satisfied. The main session can complete its
final summary/checklist and authorized commit/archive steps, preserving the
failed-run records and validating links at the archive destination. Reviewer
changed only this report; no commit, archive, external service change or
device-setting operation was performed by reviewer.
