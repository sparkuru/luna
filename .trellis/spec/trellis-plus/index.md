# Trellis Plus Project Policy

- ownership: project-shared
- source: project-authored
- tracking: commit this file and its referenced project-owned detail files

This file is the project's durable Trellis Plus source of truth. Read it before
future Trellis Plus runs and before any user-visible UI planning or validation.

## Repository baseline

- Product evidence: `prd.md` describes an offline-first income/expense recorder;
  the first delivery is an Electron desktop client, while the implementation
  stack is not yet selected.
- Capability audit (2026-08-30): the repository contains product documentation
  and Trellis specs, but no application source, package manifest, CI workflow,
  test harness, browser configuration, or development-command wrapper.
- There is no approved project mainline record and no active Trellis task. Do
  not infer a task, priority, or child ordering from the PRD alone.
- Trellis upstream paths remain read-only: do not modify `.trellis/workflow.md`,
  `.trellis/scripts/**`, `.trellis/agents/**`, `.trellis/config.yaml`, update
  metadata, or managed platform files.
- The project `license` file is present. A repository-local Trellis-specific
  license/copyright notice was not found; treat the upstream notice state as
  `license-notice-needed` and never stage protected Trellis material through
  Trellis Plus.

## Shared versus personal files

- Durable project rules belong under `.trellis/spec/trellis-plus/`.
- Platform-generated assistant files, including `.codex/**`, are personal/local
  and remain ignored and unstaged. They may point to this policy but must not
  duplicate it.
- Before staging any future change, inspect the complete candidate path list,
  classify every path, run `git diff --check`, and stage only explicit
  project-owned or user-authorized ordinary paths.

## Trellis Plus: UUPM integration

See [uupm-integration.md](./uupm-integration.md). The active platform is Codex;
the project-local UUPM entry point is `.codex/skills/ui-ux-pro-max/SKILL.md`.
It was initialized with `uipro init --ai codex` and its `search.py --help`
check passed. The generated directory is personal/local and is not part of a
shared commit.

For every user-visible UI task, read the initialized UUPM skill and the
applicable frontend specs, generate a task-specific design system before
implementation, record approved decisions and all required UI states, and
check the result against those decisions. Keep raw UUPM output in the task's
research directory when a task exists; do not create a parallel `MASTER.md` or
persist task output during this no-task configuration pass.

## Trellis Plus: Submit-Ready Human Review Gate

Before a commit or completion handoff, compare the requested scope, diff, and
actual validation results. Decide `human-required`, `human-optional`, or
`human-not-needed`. Block the commit for unautomated UI, device, assistive
technology, private-environment, security, destructive, migration, or
stakeholder-judgment risk. Any request must name the changed path, checks that
already ran, the exact residual scenario to test, and the useful failure
evidence to return; never ask for a generic review.

## Trellis Plus: Playwright automated frontend validation

The current repository has no browser-accessible app, Playwright dependency,
configuration, fixture, or runnable UI command, so no Playwright profile or
test is invented in this pass. When an Electron renderer or browser target is
added, classify each UI change as required, existing-equivalent,
not-effective, or unavailable. For eligible browser changes, maintain one
project profile under this directory, run focused semantic Playwright coverage
before human review, and retain traces/screenshots/logs on failure. A passing
browser test does not replace targeted review of subjective visuals, real
devices, assistive technology, or private environments.

## Trellis Plus: Docker dev-command bootstrap

Before development or validation, check for a project-local `hako` wrapper and
the `.devhome` cache boundary. The current repository has no confirmed
toolchain, manifest, development command, or service port, so no wrapper or
`.devhome` rule is created. Once the source toolchain is present, use the
`dev-it-in-docker` skill to derive the image and commands from repository
evidence, keep any wrapper allow rule scoped to `./hako`, and never broaden
permissions for raw Docker, shell, or package-manager commands.

## Trellis Plus: ChatGPT/Codex commit completion and attribution

For each work commit, decide whether Codex made a substantial author-level
contribution. If yes, include a concise completion body covering the request,
important design boundaries, and validation, followed by:

`Co-authored-by: OpenAI Codex <codex@openai.com>`

Do not add the trailer merely because Codex touched a file. Omit it for small
mechanical changes, user-authored files, task archive commits, and journal
commits. Preserve a different established project convention if one appears
later in project history. The current recent history has no Codex/OpenAI
trailer convention, and this configuration-only change is not being committed
by Trellis Plus.

## Trellis Plus: Mainline continuity

No `.trellis/mainline.md` is created until the user explicitly approves a
project initiative. For relevant no-task requests, run a read-only pulse over
the mainline record, task/archive evidence, git state, and validation results.
Use `guided` as the default, recommend rather than create work, honor
`paused`, and permit serial continuation only under an explicit recorded
authorization. Stop for dirty state, missing evidence, ambiguity, risk, or a
new product decision.
