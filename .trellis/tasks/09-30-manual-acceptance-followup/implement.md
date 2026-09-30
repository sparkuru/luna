# Implementation and Acceptance Plan

## Bookkeeping already completed

- [x] Archive every active task from before 2026-09-28 under `.trellis/tasks/archive/2026-09/`.
- [x] Create the A01–A07 manual acceptance table in `prd.md`.
- [x] Keep the implementation closeout in `e11c2da` and retain all archived research as the evidence baseline.
- [x] Probe the physical AIO-3568J Android 11 storage capability; record the HTTPS and IndexedDB fallback scope.
- [x] Run the physical Android A03 SAF/DocumentsUI export, cancellation, wrong-password, and fresh-profile restore harness; record sanitized evidence.
- [x] Preserve the physical Android A04 route geometry, touch-target, and DocumentsUI/BACK baseline; keep TalkBack and hardware keyboard claims manual.
- [x] Run serial local browser acceptance for encrypted sync, offline storage, keyboard/focus, and mobile layout; record the browser-only scope.
- [x] Run production Chrome OPFS local-profile isolation and missing-profile recovery; retain Android WebView scope as manual.
- [x] Run the complete configured production Chrome Playwright suite serially; record the 159/159 result and keep device/deployment scope manual.
- [x] Run the complete unit/integration suite under the required Node 22 runtime and record the 221/221 result.
- [x] Rebuild the production Web/Electron artifacts and pass both packaged Electron smoke gates; record their scope.

## Manual acceptance sequence

- [x] A01 — Electron GTK/native chooser, first-run directory selection, and restart automation; renderer privacy and user satisfaction remain manual.
- [ ] A02 — OPFS/SAH storage isolation and persistence on an Android WebView that exposes the API.
- [ ] A03 — Android SAF/DocumentsUI export, real-file import, validation failures, restore to a new profile, and user satisfaction (automated scope recorded; original/new profile switching remains for review).
- [ ] A04 — TalkBack, physical keyboard/IME, system BACK, focus order, and duplicate keypad behavior.
- [ ] A05 — Two real clients: edit/delete, interrupted transport, concurrent heads, retry, and convergence.
- [ ] A06 — Target deployment stop-copy restore and running-copy, half-init, bucket, and permissions negatives.
- [ ] A07 — Durable HTTPS endpoint, fresh-device onboarding, restart persistence, and secret/log hygiene.

Run rows in the order above. A02/A03 may share an Android setup; A06/A07 may share an isolated deployment setup. Do not mark a row complete from a neighboring row's evidence.

## Result recording

For every run append the date, environment, exact result, sanitized evidence link, and the user's satisfaction to the matching row in `prd.md`. Use the response form `Axx：通过/不满意；备注：...`. Keep unresolved rows as `待人工`, `不满意`, or `阻塞` and write the smallest next action.

## Validation gates

- [ ] `python3 .trellis/scripts/task.py validate 09-30-manual-acceptance-followup` passes.
- [ ] A01–A07 each has real evidence and a dated result.
- [ ] User has explicitly marked every row through the response form and all rows are both passing and satisfactory.
- [ ] Run the applicable Trellis quality check and record its result.
- [ ] Archive this task only after the preceding gates; otherwise keep it as the sole active follow-up.

## Rollback points

This task is docs-only. If a result entry is wrong, restore the previous table text and retain the original evidence. If acceptance reveals a product defect, create a separate implementation task and leave this row open until the corrected behavior is manually rechecked.
