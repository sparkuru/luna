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

The confirmed product baseline in `prd.md` calls for an offline-first personal
finance application whose first delivery is an Electron desktop client. The
repository has no implementation files or selected frontend stack yet. Do not
assume the React Native stack mentioned by the generated UUPM reference is the
project stack, and do not select Electron tooling until implementation evidence
or an explicit product decision establishes it.

## Plan

For a future task that changes user-visible UI:

1. Read this file, the initialized UUPM skill, and the applicable
   `.trellis/spec/frontend/` guidelines.
2. Generate design-system recommendations before implementation using the
   approved product evidence and chosen stack. Until a stack is selected, use
   a generic query rather than inventing a stack, for example:

   ```bash
   python3 .codex/skills/ui-ux-pro-max/scripts/search.py \
     "offline-first personal finance desktop app privacy focused family shared workspace" \
     --design-system --format markdown
   ```

3. Keep raw task-specific output at
   `.trellis/tasks/<TASK-ID>/research/ui-ux-pro-max.md` and turn selected
   decisions into the task's approved design record. Do not treat search
   results as an implementation plan by themselves.
4. Define responsive or window-size behavior, loading, empty, error, disabled,
   success, keyboard, reduced-motion, and accessibility expectations before
   changing UI. Adapt touch and safe-area checks when a mobile target is later
   approved.

No task exists in the current direct-configuration pass, so no design system
output is persisted and no task context is injected.

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
