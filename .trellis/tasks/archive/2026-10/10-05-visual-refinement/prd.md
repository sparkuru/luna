# Luna visual and interaction refinement

## Goal and authority

2026-10-05 user goal: use Awwwards, Webby Awards and FWA winning websites as the quality reference; inspect and keep improving typography, whitespace, hierarchy, color, motion, microinteractions, responsiveness and originality until no evident improvement remains. The active goal expressly authorizes continued implementation and observable acceptance. It does not authorize publishing, remote deployment, commits or archive. Retain the full goal across iterations.

## Background

Clean baseline: `6a373de`, no active task. Luna is an offline personal ledger with shared React Web/Electron/Android presentation. Actual synthetic-data browser renders at 1440x900 and 375x900 expose inconsistent page title scales, repeated nested list borders, oversized empty chart tracks, weak brand identity and a tall narrow statistics toolbar.

## Requirements and acceptance

| ID | Requirement | Evidence needed |
| --- | --- | --- |
| V1 | Coherent typography and whitespace across setup, ledger, entry, statistics, budget and settings | Inspect before/after renders in both locales; consistent title scale, aligned groups and readable numbers |
| V2 | Meaningful hierarchy and restrained semantic color | Real data outranks chart tracks and decoration; clear primary action; readable contrast and focus |
| V3 | Original Luna identity integrated with the usable ledger | Project-authored scalable moon mark and subtle visual motif, no third-party imitation |
| V4 | Purposeful motion and microinteractions | Visible navigation/hover/press/dialog feedback; transform/opacity entrance; reduced-motion suppresses movement; no layout shift on reveal |
| V5 | Responsive supported workflows | Desktop, tablet, 320/375/457 narrow and landscape checks, long content and no overflow; navigation and core controls remain reachable |
| V6 | Existing application contracts remain functional | Shared tests, typecheck, production Web build and browser regression; summary privacy, drafts/focus, chart selection and backup/sync remain intact |
| V7 | Iterative honest completion audit | Evidence for all eight quality dimensions; inspect final screenshots and correct visible issues; no claim of awards or native acceptance from browser evidence |

## Submission authorization — 2026-10-05

After reviewing the result, the user said “效果不错；可以提交”. This accepts
the presented Web appearance and authorizes the local work commit containing
implementation, regressions, specs and task evidence. Archive, remote push and
deployment remain outside this authorization. The initial goal's commit boundary
above records the earlier phase, before this subsequent permission.

## Submission and archive authorization — 2026-10-06

After the resumed checks and test correction, the user replied “确认” to the
explicit work-submission, task-archive and journal-closeout plan. This authorizes
those local operations. Original visual work is `edbd4dc`; the current
test-ordering and evidence commit is `41d8140`. Push and remote deployment remain
outside scope. Earlier authorization boundaries above retain their historical
phase context.

## Boundaries

Preserve existing application capabilities, light indigo/green palette, offline fonts/assets, localized strings, all routes, secure persistence and summary masking. No new business features, marketing site, remote fonts, dependencies, protocol/storage change or deployment. Shared Web flows are mobile-supported; browser emulation is separate from installed Android evidence. Dark mode is not currently supported and is not introduced here.
