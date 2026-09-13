# Trellis Plus Project Policy

- ownership: project-shared
- source: project-authored
- tracking: commit this file and its referenced project-owned detail files

This file is the project's durable Trellis Plus source of truth. Read it before
future Trellis Plus runs and before any user-visible UI planning or validation.

## Repository baseline

- Product evidence: `prd.md` describes an offline-first income/expense recorder;
  the first usable delivery is an Electron desktop client.
- Capability audit (2026-08-30): the first usable local slice now has a
  TypeScript/Electron Forge/Vite source tree, strict tests, native SQLite
  adapter, packaged smoke helper, and project-local `hako` wrapper. The current
  extension adds CNY/i18n/privacy plus encrypted portable-settings-only sync.
  Browser OPFS, CI, ledger sync, broad provider compatibility, and production
  security review remain deferred. A separate named-provider smoke has narrow
  fixed-version MinIO evidence recorded in the active task.
- The user-authorized project initiative is recorded in
  [mainline.md](../../mainline.md). This initiative has been explicitly
  resumed; implementation may proceed only through an active task whose state
  is `in_progress`. Do not infer other task priorities or child ordering from
  the PRD alone; task state lives under `.trellis/tasks`.
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
research directory when a task exists; do not create a parallel `MASTER.md`.

## Trellis Plus: Submit-Ready Human Review Gate

Before a commit or completion handoff, compare the requested scope, diff, and
actual validation results. Decide `human-required`, `human-optional`, or
`human-not-needed`. Block the commit for unautomated UI, device, assistive
technology, private-environment, security, destructive, migration, or
stakeholder-judgment risk. Any request must name the changed path, checks that
already ran, the exact residual scenario to test, and the useful failure
evidence to return; never ask for a generic review.

## Trellis Plus: Playwright automated frontend validation

The project now has a browser Web host for the shared renderer. For eligible
browser changes, classify each UI change as required, existing-equivalent,
not-effective, or unavailable; run focused semantic coverage before human
review, and retain traces/screenshots/logs on failure. A passing browser test
does not replace targeted review of subjective visuals, real devices,
assistive technology, native Electron dialogs, or private environments.

### Project validation profile

- execution mode: project-local Playwright against the Vite Web host
- setup/install: `npm install`; browser project uses installed Google Chrome
  (`channel: chrome`) on the current validation host; if that channel is not
  available, install the pinned Playwright browser before running the command
- app readiness: `npm run web -- --host 127.0.0.1 --port 4173`; base URL is
  `http://127.0.0.1:4173`
- focused test command: `npm run test:web -- tests/e2e/privacy-and-web.spec.ts --project=chrome`
- full browser command: `npm run test:web`
- test location/config: `tests/e2e/privacy-and-web.spec.ts` and
  `playwright.config.ts`
- browser projects/viewports: `chrome` at Desktop Chrome defaults and
  `chrome-narrow` at `375x800`
- fixtures/data boundary: each test uses a fresh browser context and
  origin-local storage; no credentials or remote services are used by Web UI
  tests
- accessibility policy: semantic roles, labels, focus, live-region and
  narrow-layout assertions; no axe dependency is required by the current
  profile
- visual baseline policy: screenshots are diagnostic failure artifacts only;
  no pixel snapshots are the pass/fail contract
- failure artifacts: `playwright-report` plus `test-results`, with retained
  trace and screenshots on failure; console/network diagnostics may be added
  when a test needs them

## Trellis Plus: Docker dev-command bootstrap

Before development or validation, check for the project-local `hako` wrapper
and `.devhome` cache boundary. The current wrapper uses a Node 22 Bookworm
image because Electron's native SQLite dependency needs a build toolchain; it
mounts only the repository, runs as the invoking user, and has no persistent
service. Use the `dev-it-in-docker` skill when changing that boundary, keep any
wrapper allow rule scoped to `./hako`, and never broaden permissions for raw
Docker, shell, or package-manager commands.

## Trellis Plus: ChatGPT/Codex commit completion and attribution

For each work commit, decide whether Codex made a substantial author-level
contribution. If yes, include a concise completion body covering the request,
important design boundaries, and validation, followed by:

`Co-authored-by: OpenAI Codex <codex@openai.com>`

Do not add the trailer merely because Codex touched a file. Omit it for small
mechanical changes, user-authored files, task archive commits, and journal
commits. Preserve a different established project convention if one appears
later in project history. The repository's prior history has no Codex/OpenAI
trailer convention; the first substantial implementation commit should follow
the rule above.

## Trellis Plus: Mainline continuity

No `.trellis/mainline.md` is created until the user explicitly approves a
project initiative. For relevant no-task requests, run a read-only pulse over
the mainline record, task/archive evidence, git state, and validation results.
Use `guided` as the default, recommend rather than create work, honor
`paused`, and permit serial continuation only under an explicit recorded
authorization. Stop for dirty state, missing evidence, ambiguity, risk, or a
new product decision.
