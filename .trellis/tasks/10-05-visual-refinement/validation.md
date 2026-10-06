# Validation and visual review

Scope: current local Web production build, project-authored visual refinement,
synthetic origin-local data. No publication, real account, remote deployment,
commit or archive. Delegated observable Web acceptance is complete. After the
last Chrome/Firefox normal and enlarged-text review, no further evident visual
or interaction defect remains within this scope. Task is ready for review;
Git submission/archive and native/device acceptance remain separate.

## Iterations and defects

- Baseline `6a373de`: six core surfaces at 1440/375 exposed inconsistent titles,
  nested transaction boxes, visible zero chart tracks and a generic letter mark.
- Added a shared local moon/star/orbit SVG, unified routed titles, desktop
  summaries, ruled rows, quieter chart tracks, settings hierarchy and bounded
  dialog feedback. Kept business calculations, schema, storage and API intact.
- First full production run: 338 passed, 2 failed. Fixed the ~4px month-loading
  panel shift by reserving footer line height. Complex account test timed out.
- Extended title audit found the ledger-directory heading missed the shared
  selector; corrected it. Enlarged-text audit found real long-amount overflow
  and English toolbar overlap; corrected wrapping and content-balanced controls.
- 200% root-font screenshots then exposed excessive word breaks, old navigation
  grid positions and filter-label crowding. Added relative container reflow,
  physical narrow gutters/arrows, full-row navigation/picker labels and readable
  summary labels. Narrow settings groups now retain space before their cards;
  preferences use their actual field count rather than an unused third column.
- A later desktop batch found lost month focus after loading subtree replacement.
  Added a controlled delayed-snapshot regression: old production build failed
  on both projects at the final focus assertion. `LedgerRoute` now restores a
  remembered month control only when subtree replacement lost focus to `body`.
  The existing deep-link case and controlled regression passed 4/4 after rebuild.
- Sync-page screenshot inspection found the account action's text was blue on
  blue: the unlayered global anchor rule overrode layered button foreground.
  Default Web button anchors now retain white text. The route audit asserts
  actual computed foreground/background contrast >=4.5 at normal/enlarged text.
- Aligned the browser `theme-color` meta tag with the manifest's new indigo
  brand color. This last static metadata correction receives a direct built
  HTML/manifest check plus final production offline/account checks; it does not
  change the renderer behavior covered by the two 170-case project batches.

## Automated gates

| Check | Actual result / boundary |
| --- | --- |
| Root TypeScript | Passed after final renderer/focus change |
| Shared unit tests | 226/226 passed after final renderer/focus change |
| Production Web build | Passed; existing vendor `use client` and >500kB chunk warnings remain |
| Focused craft + existing narrow gutter | 20/20 passed before the later focus fix; all included in final project batches |
| Final craft / contrast regression | 16/16 passed after button-link fix; old build failed all four route/contrast cases at ratio 1 |
| Deterministic focus before/after | 2/2 failed before fix; deep-link + delayed loading 4/4 passed after fix |
| Complex account + production cold offline | 4/4 passed at one worker, unchanged 120s limit, both projects; rerun included in final 10-case gate |
| Final desktop remaining directory | 170/170 passed, production, four workers, ~2.1min |
| Final narrow remaining directory | 170/170 passed, production, four workers, ~2.1min |
| Final metadata/offline gate | 10/10 passed after final meta-tag build: four account cases plus six cold-shell, offline-failure and deep-link cases; ~56s |
| Static production identity | Built meta/manifest theme both #3048bd; background token matches; emitted icon equals project SVG source |
| Trellis task context validation | Passed, 14 explicit files per manifest. The oversized component spec was read directly in full |
| Diff whitespace | Passed at final gate |

Full-run evidence is not a single clean 344-case run: a four-worker combined run
received SIGTERM after 297 pass records; a desktop batch had 170 pass / 2 fail
(month focus and account timeout). The account test passed in isolation at its
original timeout. Parallel-run stability remains a test-environment limitation;
do not describe the isolated account pass as a verified fix for its timeout.
The final coverage is assembled from disjoint production project batches and
the four isolated account cases, without deleting or weakening assertions.
These disjoint batches cover all 344 browser cases. The final meta-tag-only
correction follows the 340-case renderer/style gate and is covered by the
direct metadata check and final 10-case production gate. Early full-run/account
failure traces were reset by subsequent runs; their text logs remain. Later
controlled focus and contrast failures retain screenshots/traces, alongside
the title/enlarged-text failure artifacts. Do not claim all early traces remain.

## Eight-dimension audit

| Dimension | Observed decision and evidence |
| --- | --- |
| Typography | System UI for application titles/numbers, restrained serif in brand/welcome copy; one routed Web h1. Review en/zh-CN and enlarged text |
| Whitespace | Shared page rhythm, aligned summary rows, fine list dividers, clear settings group gaps and adaptive preference fields |
| Hierarchy | Single record action, larger totals, smaller secondary copy; real chart data dominates transparent zero/future tracks; methods remain in a disclosure |
| Color | Preserved indigo/green/red semantics; text contrast: ink/background 14.63, muted/white 5.40, muted/surface-muted 4.80, primary/white 5.35, primary-dark/soft 6.47, accent/white 5.06, danger/white 6.57 |
| Motion | 160ms overlay/feedback, 240ms opacity/translate dialog entrance; no continuous motion; reduced entrance is none and press/arrow movement is suppressed |
| Microinteractions | Navigation indicator, row/setting hover, visible focus, independent privacy toggles; Escape restores entry focus and month focus survives loading replacement |
| Responsive | en/zh-CN; 320/375/457/768/1024/1440 plus landscape; long amounts, >=44px controls, label bounds, no document overflow and 200% root-font reflow |
| Originality | Project-authored moon/star/orbit mark shared with production favicon/manifest; subtle welcome orbit, offline fonts/assets, no copied award-site graphics |

## Evidence and review boundary

Screenshots and final logs are copied to `/tmp/luna-visual-refinement`; retained
failure artifacts live in `/tmp/luna-craft-evidence`. Scratch capture scripts
remain in the ignored `.devhome` cache. Before/after core surfaces and selected
management routes were visually inspected. Chrome captures cover both locales
at 1440/768/375; Firefox covers both at 1440/375. Additional enlarged-text
screenshots cover five English routes in both engines, with both locales covered
by the Chrome semantic cases. Production shell readiness is awaited. Error,
empty, populated and routed states are captured; existing semantic regressions
cover loading/retry, filtered-empty, disabled/pending, success, drafts, privacy,
backup/conflicts and offline recovery. No console page errors or normal-size
overflow were recorded in the reviewed capture runs.

Final logs:
`/tmp/luna-visual-refinement/logs/luna-craft-web-desktop-final.log`,
`luna-craft-web-narrow-final.log`, `luna-craft-account-offline-final.log`,
`luna-craft-typecheck.log`, `luna-craft-unit.log`, `luna-craft-build.log`,
`luna-craft-production-focus-final.log`, `luna-craft-metadata.log`, and capture
diagnostic logs. This is local evidence, not a CI result or an award judgement.

Review classification: observable Web acceptance is agent-verified within the
user's autonomous goal. Subjective taste remains optional user feedback.
Browser emulation does not establish installed Android/Electron rendering,
native dialogs, spoken-reader behavior or deployment longevity; those are
outside this website refinement's acceptance claim. No device or external
environment was changed.

## Commit acceptance — 2026-10-05

The user reviewed the presented result and replied “效果不错；可以提交”.
The previously optional subjective Web review is now satisfied; a local work
commit is explicitly authorized. Native/device and parallel-run limitations
above remain unchanged. Commit review is `human-not-needed` within the accepted
Web scope. Source SHA-256 checks match the validated renderer, SVG, Web shell
and new craft tests. Task evidence/specs are project-owned; local screenshots,
logs, raw UUPM output, generated platform files and caches stay outside Git.
Task archive, push and deployment have no additional authorization.

Local output relocation (2026-10-06): the existing root Playwright report and
test-results directory were preserved under `archive/2026-10-06/`; see the
[migration record](../archive/2026-10/10-06-repository-cleanup/research/artifact-migration.md).
The `/tmp` and `.devhome` evidence above stays in place. Historical validation
results and overwritten-trace limitations remain as recorded.
