# Resumption review — 2026-10-06

## Initial review and reproduced failure

The visual renderer remains the version accepted and committed in `edbd4dc`.
The repository/container cleanup did not change renderer, Web host, offline
plugin, craft tests or month-focus tests. Current visual and month-focus checks
pass. The original account/offline gate reproduced an account-test race on
both browser projects: **8 passed, 2 failed**, at the unchanged 120-second
complex-case deadline. V6 needs a corrected, independently checked regression
before this review can pass or archive can be proposed.

Ownership in this review is this evidence file only. Product code, task state,
commit/archive, preview lifecycle, user configuration/data and remote deployment
were not modified by the reviewer. Main owns the resumed task and the separately
dispatched test correction.

## Loaded context and source checks

- Read PRD, design, implementation plan, validation and commit-readiness records;
  all 14 registered check sources, frontend index/quality guidance, project
  policy index/mainline/details, workflow 2.2 and local UUPM skill. Read the
  complete 591-line component guideline directly because its 35,923 bytes exceed
  the 32,768-byte injection cap. No native injection was assumed.
- `git diff --name-only edbd4dc HEAD -- src/renderer src/web
  scripts/web-offline-plugin.ts tests/e2e/visual-refinement.spec.ts
  tests/e2e/react-state.spec.ts` returned no paths. All five entries in the
  preserved `source-sha256.txt` passed independently.
- Reviewed actual shared SVG consumption, routed headings, CSS feedback,
  container reflow, chart track treatment and month focus listener/layout
  effect. No product/spec drift found in these paths.
- Built `icon.svg` equals the authored source byte-for-byte; built HTML and
  manifest theme are both `#3048bd`, manifest background is `#f7f8fc`.
- `task.py validate` passed both 14-entry manifests; no stale registered path
  after cleanup. Its only warning is the known component-spec size, resolved
  by the complete direct read. Package discovery reports a single repository
  with backend/frontend/trellis-plus layers; this change affects frontend and
  its Web build asset plugin.
- Existing before/after screenshots, final logs and failure evidence remain in
  `/tmp/luna-visual-refinement` and `/tmp/luna-craft-evidence`. Migrated root
  report/results remain under `archive/2026-10-06/`. Directly inspected retained
  Chrome English 1440 ledger and Chinese 375 statistics images; no new visible
  concern. Current passing semantic checks plus unchanged source did not warrant
  another capture sweep. Prior 170 desktop + 170 narrow + final 10-case log
  endings were confirmed; those are historical disjoint coverage, not a new
  full-suite result.

## Current gates before the test correction

All development commands ran through `./hako` with the prepared
`luna-dev:node22-playwright-1.63.0` image. Normal execution initially could not
access the Docker socket; scoped escalation then ran successfully. No new host
port was published. Playwright started its own container-loopback production
preview, with `reuseExistingServer=false`.

| Gate | Actual result |
| --- | --- |
| Root typecheck | Exit 0 |
| Shared unit suite | 226 passed, 0 failed/skipped; about 36.4s |
| Production Web build | Exit 0; about 6.2s; existing vendor directive and >500kB chunk warnings |
| Full visual-refinement spec | 16/16 passed, 0 skipped; two workers; about 1 minute |
| Deep-link + delayed month loading/focus + retry | 6/6 passed, 0 skipped; two workers; 12.2s |
| Original account/offline selection | 8 passed, 2 failed, 0 skipped; one worker; about 5 minutes |
| Task context validation | Both manifests pass, known size warning as above |
| Diff whitespace | Passed at review baseline |
| Lint | No lint script configured; no lint pass is claimed |

The original account selection includes two complex variants per project plus
cold-shell persistence, localized offline-preparation failure and offline menu
deep links. Both cold-copy variants and all six shell/failure/deep-link cases
passed. Both online complex account variants timed out. No assertion, timeout
or production fixture was relaxed. The 344-case suite was not rerun.

Commands for browser gates:

```text
./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/visual-refinement.spec.ts --workers=2 --reporter=list --output=.devhome/visual-resumption-20261006/craft-results
./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/react-state.spec.ts --grep 'validated month and type deep links|month loading keeps' --workers=2 --reporter=list --output=.devhome/visual-resumption-20261006/focus-results
./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/server-account.spec.ts tests/e2e/offline-and-storage.spec.ts tests/e2e/router-offline.spec.ts --grep 'real server login, encrypted copy|production server copy cold-opens|production shell cold-opens|offline asset preparation failure|production menu deep links' --workers=1 --reporter=list --output=.devhome/visual-resumption-20261006/account-offline-results
```

## Account race: concrete cause and next check

The failing step is the original `server-account.spec.ts:388` unconditional
`second.locator('#server-sync-now').click()` after the first browser revokes
the second browser's session and the test opens Account on the second browser.
The trace and screenshot show correct early authentication teardown:

- Desktop: real `GET /api/v1/auth/sessions` returns 401 at monotonic 26,345.88ms;
  the sync click starts at 26,377.149ms and never completes.
- Narrow: the same real sessions request returns 401 at 176,255.228ms;
  sync click starts at 176,278.166ms and never completes.
- The second-browser failure screenshot shows the signed-out login form. The
  sync control is absent, not disabled or hidden behind an overlay. Thus
  Playwright waits for a control that correct session invalidation removed.
- `AccountPanel` starts `server.sessions()` through its enabled Query on mount
  (`src/renderer/features/account.tsx:298`). The current-account client treats
  a real 401 as authentication invalidation
  (`src/sync/server-host.ts:548`); `invalidateAccount` clears account, secrets,
  timers and session, then emits. Account embeds `ServerSyncPanel` only while
  `status.account` exists (`account.tsx:444`). This real code path matches the
  screenshots and network ordering. No clock/CPU/environment explanation is
  inferred from the timeout.

Main was notified before any correction. The narrow next check is a
deterministic test fixture for this revocation/early-401 ordering, preserving
real session revocation, signed-out state, credentials clearing and the
remaining recovery/data assertions. Product code needs no change on this
evidence. Recheck revised account variants on both projects at the original
deadline; do not hide the original failure by overwriting its evidence.

Logs and metadata inspection are under `/tmp/luna-visual-resumption-20261006/`.
All original run outputs are copied to its `browser-artifacts/` directory.
Each failed project's `account-offline-results/server-account-real-server-81a6c--and-local-profile-recovery-<project>/`
contains two screenshots, `error-context.md` and `trace.zip`. The ignored
`.devhome/visual-resumption-20261006` intermediate remains because hako mounts
the repository rather than host `/tmp`; list reporter avoided altering old
root reports. Trace archives contain only this run's synthetic local fixtures
and stay outside Git.

## Acceptance boundary at this point

V1–V5 remain satisfied within the already accepted Web scope: typography,
hierarchy/semantic color, local authored identity, bounded/reduced motion and
responsive behavior have unchanged source plus current focused checks. V7's
honest iterative audit remains satisfied by preserving the actual failure and
its cause. V6's current automation gate is unresolved until the test race is
corrected and independently rerun; prior successful coverage stays historical.
No CI, new Firefox run, installed Android/Electron, spoken-reader, award,
remote deployment or continuous-operation acceptance is claimed. The existing
subjective Web acceptance remains the user's 2026-10-05 response. Do not
request archive on the strength of the initial failed gate.

## Independent verification after correction

The separately dispatched implementer corrected only
`tests/e2e/server-account.spec.ts`. The reviewer read that diff and the main
session's updated design, implementation plan and frontend quality guidance.
Before revocation, the test observes the real DELETE response and requires 204.
Before second-browser Account navigation, it observes the real sessions GET
and requires 401. It then verifies signed-out state, cleared account identity,
absence of sync controls, renewed login and the unchanged local-ledger recovery
assertions. The test no longer attempts to click a control that successful
authentication invalidation already removed. Original 120-second deadlines,
real server fixtures, encryption/image checks and recovery assertions remain.
No product code was changed, no failure was swallowed, and the revised spec
records the demonstrated lifecycle rather than a speculative environment cause.

Independent reviewer results on the revised test:

| Gate | Final result |
| --- | --- |
| Root typecheck after patch | Exit 0 |
| Same 10-case production account/offline selection | 10 passed, 0 failed/skipped; one worker; 1.8 minutes |
| Desktop complex variants | Online 18.7s; cold offline copy 19.0s |
| Narrow complex variants | Online 18.8s; cold offline copy 19.9s |
| Response-order evidence | Passing traces retain real session DELETE 204 followed by sessions GET 401 |
| Diff whitespace | Passed after the test/spec correction |

The independent rerun used the earlier account/offline command with
`--trace=on` and the separate
`--output=.devhome/visual-resumption-20261006/account-offline-fixed-results`.
Its log is `/tmp/luna-visual-resumption-20261006/account-offline-fixed.log`;
successful traces are copied under that directory's
`browser-artifacts/account-offline-fixed-results/`. The earlier `8 passed /
2 failed` log and both failure trace/screenshot directories remain intact.
Network summaries read only method/path/status/timing, excluding headers and
request bodies. The implementer's preceding 4/4 run is separate supporting
evidence, not part of the reviewer's 10-case count.

Current renderer gates remain typecheck, 226 unit tests, production build,
16 craft cases and 6 focus/loading cases, plus the final corrected 10-case
account/offline gate. Unit/build/craft/focus were not repeated after this
test-only correction because their application sources remained unchanged.
This is **32 distinct current browser cases across three focused batches**,
with an additional original failed 10-case attempt retained. It is not a new
344-case full-suite or CI run. Historical parallel-run interruptions and earlier
timeout causes are not retroactively explained by this reproduction.

Final review: **V1–V7 remain satisfied within the accepted Web scope**. No
unfixed technical finding or additional product decision remains in that scope.
The evidenced test race is corrected and independently verified. Main may
record review completion and request the separate archive authorization; this
review does not grant commit/archive/push/deployment authority. Subjective Web
acceptance and native/device/reader boundaries remain as recorded above.
