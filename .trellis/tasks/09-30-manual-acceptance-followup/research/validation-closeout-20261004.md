# Final acceptance validation, 2026-10-04

This is the historical 10/04 closeout scope. A07 resumed on10/05 under the
updated configuration A; current durable deployment and client evidence live
in [VPS evidence](a07-vps-20261005.md), [client evidence](a07-clients-20261005.md)
and [current independent review](a07-quality-check-20261005.md). The historical
readiness below does not itself close the resumed A07.

Technical acceptance is ready for A01–A06 under the explicitly revised scope.
User deferred A07 and canceled TalkBack; neither is reported as passed. No
subjective satisfaction is invented. Commit/archive execution awaits the
workflow's one-shot confirmation.

| Check | Actual result |
| --- | --- |
| Root unit suite | 226/226 passed; rerun after detail-focus correction also 226/226 |
| Server tests | 26/26 passed |
| Server-sync integration | 9/9 passed |
| API contracts | 6/6 passed |
| Root/server typecheck | Passed; root independently rerun after corrections |
| API reproducibility | `LUNA_API_REPRODUCIBLE` |
| Web production build | Passed after final renderer correction |
| Electron build/package | Passed after final renderer correction |
| Packaged storage/IPC smoke | `LUNA_PACKAGED_STORAGE_SMOKE_OK` under default sandbox |
| Packaged file-input smoke | `LUNA_PACKAGED_FILE_INPUT_SMOKE_OK` under default sandbox |
| Focused detail BACK/close/Escape/editor | Desktop/narrow 4/4 passed; corrected APK actual-device recheck passed |
| Actual A06 Compose | 11/11 passed |
| A06 original restore smoke | 8/8 passed |
| Backup and initialization regressions | 13/13 passed (8 backup + 5 init), independently rerun |
| Task contexts | 13 entries in each manifest validate; known 35,923-byte component-spec warning, sources fully read directly |
| Syntax/whitespace | Changed JS/replay syntax and `git diff --check` passed |

Electron helpers used local Xvfb/tsx with host Node 20.19.2 to launch the built
Electron executable, whose runtime is embedded in the package; these helper
runs are not host Node22 unit-suite evidence. Unit/type/browser checks used the
project Node22 Docker wrapper. No sandbox-bypass flag was set.

## Browser failures and their final verification

Initial complete development run: 314 passed, 2 failed, 8 explicitly production
cases skipped (13.8m). A recovery test incorrectly required a cold worker to
load while offline from a development server with no Service Worker. Original
production recovery passed unchanged; split general online recovery from the
explicit production offline case without dropping data assertions. Final
focused recovery file: development 4 passed/2 production skips; production
6/6 passed. See [recovery diagnosis](e2e-restore-check-20261004.md).

Final complete production run after the renderer fix: 326 passed, 2 failed,
no skips (9.8m), 328 cases total. Both failures were the intentionally
nonisolated SAH fixture: production Service Worker cached the original
COOP/COEP headers and reintroduced isolation on reload. The runtime probe
proved `crossOriginIsolated` changed from false to true. Only that fixture now
blocks Service Workers and asserts nonisolation after both reloads. Original
profile/data/missing-backing-file assertions remain. Full catalog file finally
passed production 6/6 and development 6/6 without skips. See
[SAH diagnosis](e2e-sah-production-check-20261004.md).

All 328 production cases are thus covered by the full run plus corrected
focused verification. Do not call this a single 328/328 passing run. The final
reviewer accepted this coverage because only one fixture's context changed,
its adjacent regular-OPFS cases also passed, and the other 326 source/test/env
paths were unchanged. Product code was not changed to bypass either failure.
Original traces remain under `test-results`; the final full output is
`/tmp/luna-production-final-20261004.log`.

## Scope and cleanup

[A04 evidence](a04-native-20261004.md) proves the retained physical-device
IME/BACK/save/cancel/error/restart behavior and corrected detail focus.
Physical keyboard absent; ADB events are clearly labeled virtual, and actual
IME fulfills the original keyboard-or-IME input alternative. TalkBack was
stopped, exact original settings verified, and both task packages, files and
ADB forwarding removed. No voice implementation or microphone permission added.

[A06 evidence](a06-server-20261004.json) proves the isolated same-host Compose
backup/refusal/restore/restart/negative matrix. The backup CLI requires every
writer stopped throughout maintenance; it does not intercept raw copies or
guarantee locking against arbitrary concurrent writers. API/build artifacts
and pinned-equivalent MinIO provenance are verified; the earlier remote Web
image explicitly predates the independent A04 renderer-only correction.
Owned temporary remote containers/networks/data are removed; cache images
remain and unrelated services/data were preserved.

[A07 disposition](a07-deferral-20261004.json) retains durable deployment
prerequisites in mainline. Public unauthenticated candidate-domain probes made
no deployment changes; temporary public bodies/headers/certificate dumps were
removed. The existing preview and user configuration were preserved.

Review classification: human-not-needed for this authorized observable scope.
Commit/archive permission remains a workflow action, not a request to repeat
product acceptance or to enable a spoken reader.
