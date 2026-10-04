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
- The project `license` file is present. Trellis 0.6.14's exact notice is
  collected in [third_party](../../../third_party/index.md); preserve upstream
  headers and never stage protected runtime material through Trellis Plus.
  UUPM notice provenance remains explicitly unresolved for sharing its material.

## Shared versus personal files

- Durable project rules belong under `.trellis/spec/trellis-plus/`.
- Platform-generated assistant files, including `.codex/**`, are personal/local
  and remain ignored and unstaged. They may point to this policy but must not
  duplicate it.
- Before staging any future change, inspect the complete candidate path list,
  classify every path, run `git diff --check`, and stage only explicit
  project-owned or user-authorized ordinary paths.

## Trellis Plus: Development-stage principles

Read [development-principles.md](development-principles.md) on every development
task and explicitly authorized no-task change. These contain scope, evidence,
README, user-work/data and compatibility boundaries.

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

When the user explicitly delegates acceptance, run the observable checks within
the authorized environment and record agent-verified results without requiring
repeated per-row approval. Do not report subjective satisfaction on the user's
behalf. Missing device capabilities or long-term deployment evidence remain
uncovered, with the exact prerequisite recorded. A documentation-only evidence
commit may preserve those gaps without claiming product acceptance or archiving
an incomplete task.

## Trellis Plus: Playwright automated frontend validation

The project now has a browser Web host for the shared renderer. Classify mobile
applicability before implementation for every changed page/core interaction;
mobile-supported flows require desktop and narrow-mobile coverage even without
a responsive CSS diff. Record mobile-not-applicable only with scope evidence;
missing runtime/tests mean unavailable, not passed. For eligible
browser changes, classify each UI change as required, existing-equivalent,
not-effective, or unavailable; run focused semantic coverage before human
review, and retain traces/screenshots/logs on failure. A passing browser test
does not replace targeted review of subjective visuals, real devices,
assistive technology, native Electron dialogs, or private environments.

### Trellis Plus: Playwright Validation Profile

- execution mode: `docker-wrapper`; run project-local Playwright through
  `./hako`, using the Node 22/browser image described below.
- setup/install: `./preview.sh build`, then `./hako npm install`; the Dockerfile
  dev stage provides Google Chrome for `channel: chrome` and matching Firefox.
  No global workstation browser or Node installation is required.
- app readiness: `playwright.config.ts` starts and probes its own Vite Web host
  at `http://127.0.0.1:4173` inside the test container; `reuseExistingServer` is
  false. Do not start a second server first. `LUNA_TEST_PRODUCTION=1` selects
  the built preview command; build with `./hako npm run web:build` first.
  `LUNA_TEST_BASE_URL` selects an explicitly authorized external origin and
  disables the managed server; it must be reachable from the container.
- focused test command: `./hako npm run test:web -- tests/e2e/privacy-and-web.spec.ts --project=chrome`
- full/CI browser command: `./hako npm run test:web`; no CI result is claimed.
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
mounts only the repository and runs as the invoking user. One-shot commands
use disposable containers; the preview lifecycle below manages its detached
Web service. Its default image is built from the `dev` stage in the repository-root
`Dockerfile`, which is the only Dockerfile used by the development and test
workflow; keep Chrome and Firefox provisioning in that stage instead of adding
a separate development Dockerfile. Deployment-specific Dockerfiles remain
owned by their respective Compose/release workflows. Use the `dev-it-in-docker`
skill when changing that boundary, keep any wrapper allow rule scoped to
`./hako`, and never broaden permissions for raw Docker, shell, or package-manager
commands.

## Trellis Plus: Preview lifecycle and environment

Read [development.md](./development.md) before changing `preview.sh`, `dev.sh`,
`hako`, preview configuration, or preview acceptance checks. It defines the
Docker-backed HTTPS Web preview, root `.env` setup, explicit image build,
readiness and the mandatory [console contract](preview-console.md), and
data-preserving shutdown. Production
Compose deployment retains its separate lifecycle and loopback-first boundary.

## Project policy loading

Root `AGENTS.md` now directs main sessions to read this index and mainline
through a project-owned section outside the unchanged Trellis-managed block.
The current Codex hook configuration has no SessionStart registration; the
existence of `session-start.py` does not prove execution. Read applicable details
explicitly at startup/resumption and before commit/archive. Preview work requires
both `development.md` and `preview-console.md`.

Implementation/check loading uses the active task's `implement.jsonl` and
`check.jsonl` through native context injection or the agent's documented
child-side fallback. That loader materializes registered files, not Markdown
links. For preview work, register this index, `development.md`, and `preview-console.md` in both
manifests with `python3 .trellis/scripts/task.py add-context <task-dir>
<implement|check> <repo-relative-spec-path> <reason>`, then inspect them with
`task.py list-context <task-dir>` and run `task.py validate <task-dir>`.
Future tasks still require this explicit detail registration; there is no
automatic linked-spec enforcement. With an explicit no-task request, read the
same specs directly and do not create a task just to carry context.

## Trellis Plus: ChatGPT/Codex commit completion and attribution

Read [commit-policy.md](commit-policy.md). Each successfully archived
Codex-assisted task receives exactly one
`Co-authored-by: OpenAI Codex <codex@openai.com>` trailer on its archive commit.
Use the verified `archive --no-commit` route and explicit paths. Ordinary work
and separate journal commits do not receive this task trailer. This supersedes
the earlier substantial-contribution/work-commit rule; historical commits stay
unchanged.

## Trellis Plus: Mainline continuity

Read [continuity.md](continuity.md). Import existing requirements with source
and approval boundaries; preserve drafts as proposed without implementation
authority. Do not request already-established approval again. For relevant no-task requests, run a read-only pulse over
the mainline record, task/archive evidence, git state, and validation results.
Use `guided` as the default, recommend rather than create work, honor
`paused`, and permit serial continuation only under an explicit recorded
authorization. Stop for dirty state, missing evidence, ambiguity, risk, or a
new product decision.

## Preview contract context registration

For normal preview tasks, register `index.md`, `development.md` and
`preview-console.md` explicitly in both implement/check manifests; loaders do
not recursively follow Markdown links. Root AGENTS supplies the portable main
session read directive. An explicitly authorized no-task change reads the same
files directly and must not create a task or change existing task status merely
for this policy reconciliation.

## Context size and complete reads

The current frontend `component-guidelines.md` exceeds the installed 32768-byte
per-file context injection limit. `task.py validate` warns and native injection
will truncate that file. When context contains a truncation marker or validation
reports a size warning, implementation/check agents must open the complete
registered source directly before applying its rules; a truncated injection is
not complete loading. This reconciliation does not modify protected loaders or
personal hook budgets, and no live hook invocation is claimed here.
