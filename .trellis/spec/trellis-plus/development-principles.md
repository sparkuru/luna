# Development-stage principles

- ownership: project-shared
- source: project-authored

Read this policy for every development task and authorized no-task change. Read
mainline, current acceptance criteria and applicable details at start/resumption
and before completion. Preserve established approval; implementation drift does
not redefine the requested outcome.

## Scope and compatibility

- Solve approved scope and evidenced near-term needs. Reuse renderer components,
  ledger hosts, storage/sync adapters, API clients and test facilities before
  adding abstractions, flags, provider systems, caches or dependencies.
- For unreleased behavior without an external obligation, update contracts and
  callers together; remove superseded prototype paths rather than adding
  speculative aliases or compatibility chains. Real ledger data, encrypted
  backup formats, deployed sync APIs and supported Android storage remain
  affected-surface obligations; document a concrete exception before changing
  them. Development status never authorizes data deletion.
- Keep diffs limited to the request. Do not bundle adjacent refactors, renaming,
  mass formatting, dependency upgrades or unrelated bug fixes. Add dependencies
  only for a concrete benefit existing facilities cannot reasonably provide.

## Development access and evidence

Use the configured trusted-LAN preview in development.md when device access is
intended; preserve narrower network restrictions. Separate development accounts
and fixtures from real sync credentials. Reduce unnecessary test friction through
explicit dev configuration while preserving production auth and the behavior
being tested. Do not change firewalls or publish additional ports.

Before a fix, reproduce current behavior and trace its real execution path. If
unavailable, state the limitation and distinguish hypotheses from proven causes.
Verify promised user behavior and final state; never weaken assertions, hide
errors or mock away the contract. Controlled fixtures must identify what they
cannot prove. Build, HTTP 200, unit checks, browser interactions, native device
checks and real sync each prove their own scope. Report missing prerequisites
and implemented-but-unverified behavior clearly.

Use proportionate existing checks. For browser UI changes, classify mobile
applicability before implementation and run focused desktop and narrow-mobile
coverage for supported pages/core interactions even without responsive CSS
changes. Record real-device limitations separately; a desktop or narrow-screen
pass does not establish touch, keyboard, picker or Android WebView behavior.

Do not enable TalkBack or another device-wide spoken accessibility service
during application tests unless the user explicitly requests that operation.
Luna has no required voice capability; do not introduce voice input or make
spoken-reader acceptance a completion gate without an approved requirement.
Keep existing semantic labels and ordinary keyboard/focus checks. When a user
cancels a device setting test, stop it, restore the exact prior settings and
record verification before continuing unrelated tests. Configuration A device
access alone does not authorize an unsolicited spoken-reader test.

## Workspace, documentation and completion

Preserve user-owned dirty files, local configuration and unknown artifacts. Do
not reset, clean or stage unrelated work. Scratch files belong in /tmp; remove
only disposable files created for the current work. Retain intentional tests
and evidence. README is human-owned and changes only when explicitly requested.
Reusable rules belong here; task-specific evidence stays in the normal task
tree when a task exists. Do not invent another audit system or redundant guides.

The root `readme.md` is a concise project entry: retain the tagline, a short
description, and usage/development/license links, around 15–20 lines without
long command blocks or configuration tables. Detailed usage and operations
belong in the existing topic specs: backend deployment/API/ledger-sync,
frontend Web/Android, and Trellis Plus development. Merge duplicate content
into its owning topic instead of recreating a root PRD or parallel docs tree.
Product direction stays in `.trellis/mainline.md`; task-specific evidence stays
in its task. After documentation moves, check file links and anchors and record
source-to-section mappings without replacing historical revision citations.

Before completion compare requested behavior, the checks actually run and every
unverified portion. Follow the index's review gate and archive policy. Reuse
existing authorization without ceremonial repeat approval. For authorized
no-task work, read the same policy directly, report validation in the handoff
and do not create a task or alter existing task acceptance/status.
