# UUPM Integration

- ownership: project-shared
- source: project-authored integration rules; generated UUPM content stays in
  the personal/local Codex directory

## Current status

- active AI platform: Codex
- project-local entry point: `.codex/skills/ui-ux-pro-max/SKILL.md`
- initialization command: `uipro init --ai codex`
- verification: `python3 .codex/skills/ui-ux-pro-max/scripts/search.py --help`
- current result: initialization and help verification passed on 2026-08-30
- local boundary: `.codex/**` is globally ignored and must not be staged

## Product and stack evidence

The product is an offline-first personal finance application shared by Electron,
Web and Android. The current approved migration uses React, TanStack Query and
Router, Tailwind and project-owned shadcn components. Web persists through
SQLite-WASM/OPFS with a production offline shell; Electron retains native
SQLite. This is a React Web renderer with native host adapters, not React Native. The existing blue/light ledger-first visual
hierarchy remains the product baseline.

## Plan

For a future task that changes user-visible UI:

1. Read this file, the initialized UUPM skill, and the applicable
   `.trellis/spec/frontend/` guidelines.
2. Generate design-system recommendations before implementation using the
   approved product evidence and chosen stack. Use the established React Web stack and approved product direction, for example:

   ```bash
   python3 .codex/skills/ui-ux-pro-max/scripts/search.py \
     "offline-first personal finance desktop app privacy focused family shared workspace" \
     --design-system --format markdown
   ```

3. Keep raw task-specific output, only when its exact source/license permits retention, at
   `.trellis/tasks/<TASK-ID>/research/ui-ux-pro-max.md` and turn selected
   decisions into the task's approved design record. Do not treat search
   results as an implementation plan by themselves.
4. Define responsive or window-size behavior, loading, empty, error, disabled,
   success, keyboard, reduced-motion, and accessibility expectations before
   changing UI. Mobile targets are already supported. Classify applicability before
   implementation and verify applicable desktop/narrow-mobile flows, touch,
   safe areas, navigation, input and final state. Missing tests are not a
   desktop-only exclusion; record actual device limitations separately.

The first usable checkpoint records its historical design research in
`.trellis/tasks/archive/2026-09/08-30-income-expense-mvp/research/ui-ux-pro-max.md` and its
approved adaptations in that task's `design.md`. Future UI tasks should keep
the same task-local evidence pattern.

## Context registration

Register this detail, approved design.md and applicable task research/decision
evidence explicitly in both implement/check manifests. Loaders do not follow
Markdown links; keep task-specific decisions in the task. For explicitly
authorized no-task work, read relevant files directly without creating a task.

## Implement and check

- Implementation must preserve approved UUPM decisions unless the decision is
  invalidated and the change is recorded in the task design record.
- Verification must cover visual hierarchy, typography, semantic color tokens,
  contrast, focus and keyboard behavior, accessible names, interaction states,
  reduced motion, window-size/responsive behavior, and data visualization
  readability where applicable.
- Browser-automatable acceptance criteria require focused reproducible
  Playwright coverage before submit-ready review. Native-only, hardware,
  private-environment, or otherwise unautomatable residual risk gets a narrow
  human-review request instead of a generic smoke test.

## Update Spec

Promote only stable, project-authored UI decisions into this dedicated spec
layer. Keep raw UUPM output and task-specific choices with the task when a task
exists. Never copy generated third-party UUPM source into protected Trellis
files or claim that generated assistant files inherit the project's license.
