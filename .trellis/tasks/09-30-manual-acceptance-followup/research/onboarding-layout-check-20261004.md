# Welcome layout quality check — 2026-10-04

Verdict: pass for the scoped Web welcome correction and its regressions. This
does not close the active task's A04/A06/A07 gaps or assert user satisfaction.

## Scope and source review

- `src/renderer/styles.css:3072`: the existing desktop Web shell sets `margin: 0`
  at 1024px and above. The no-workspace override then constrains its width to
  1440px without restoring automatic inline margins. At wider viewports this
  anchors the entire welcome surface left. Restoring `margin-inline: auto` in
  that override centers the shell, including its topbar and existing centered
  setup column. Its selector requires `.web-setup-topbar`; workspace shells and
  native surfaces retain their existing layout.
- `tests/e2e/workspace-setup-visual-polish.spec.ts`: fresh contexts at
  1280/1366/2048px compare welcome copy, card and topbar centers to the actual
  viewport center, rather than merely checking their alignment with each other.
  The suite also verifies copy-before-card flow, card width, 375px overflow,
  native disclosure keyboard behavior, name-only creation, precision validation,
  and visible restore/connect/back actions. Optional budget stays visible in
  narrow Web; only the explicitly selected native mobile presentation moves it
  into the disclosure (`src/renderer/features/setup.tsx`).
- Reviewed task PRD/design/implementation, registered check specs, frontend
  quality and Web-host contracts, Trellis Plus policy and UUPM research. Existing
  local fonts, semantic colors, controls and motion remain unchanged. Raw UUPM
  recommendations are research, not new approved styling.
- Preserved unrelated preview-tooling and Trellis-context WIP. No staging or
  commit performed by the reviewer.

## Findings fixed directly

1. `src/web/web-api.test.ts:646`: the budget-conflict fixture used real current
   time when creating a workspace, while testing September conflict inheritance
   into October 2026. On October 4, workspace creation seeds an explicit October
   budget of `50000`; the assertion at the original line 660 therefore correctly
   received `50000` instead of inherited `null`. Reproduced independently with
   `./hako node_modules/.bin/tsx --test --test-name-pattern='budget conflicts disable' src/web/web-api.test.ts`
   before changing the fixture: 0/1 passed, actual `50000`, expected `null`.
   Product code correctly keys creation to `localMonthFromTimestamp(now)` and
   chooses an explicit month before an inherited month
   (`src/web/web-api.ts:539`, `:1197`). Fixed only this test by using its scoped
   Node test Date mock at September 15, 2026. Retained all conflict/edit/byte
   preservation assertions and added October inheritance assertions before
   divergence (`10000`) and after resolution (`20000`). The focused test then
   passed 1/1. The test runner restores its mock automatically; the experimental
   MockTimers warning is reported without suppression. No product API/domain
   behavior changed.
2. `research/onboarding-layout-uupm-20261004.md`: clarified that budget-in-advanced
   applies to the explicit native mobile surface, not every narrow viewport.
   This matches the existing setup component and narrow-Web assertions.

## Verification

Reviewer ran the following independently through the project Node 22 Docker
wrapper; initial sandbox socket denial was resolved through scoped execution
approval, without changing repository policy:

| Check | Result | Evidence |
| --- | --- | --- |
| `./hako npm test` | 226/226 pass | `/tmp/luna-onboarding-check-unit-20261004.log` |
| `./hako npm run typecheck` | Pass | `/tmp/luna-onboarding-check-typecheck-20261004.log` |
| `./hako npm run test:web -- tests/e2e/workspace-setup-visual-polish.spec.ts --workers=1` | 12/12 pass across configured Chrome projects | `/tmp/luna-onboarding-check-browser-20261004.log` |
| `git diff --check` | Pass | No whitespace errors |
| Dedicated lint | Not configured in `package.json` | Static CSS/TypeScript review and typecheck passed |

Web build was already run successfully by the implementer for the same product
CSS. Reviewer fixes affect only test data and research wording, so that build
was not repeated. Native mobile 2/2 checks are implementer evidence, not installed
APK evidence or an independently repeated reviewer check.

Reviewer inspected the Chinese 2048px screenshot
`/tmp/luna-onboarding-after-2048x1040.png` and the full-page 800x375 landscape
capture `/tmp/luna-onboarding-after-800x375.png`: readable single-column welcome
flow, balanced page axis, recovery actions and budget field retained. Parent
also verified that the running HTTPS preview's `/styles.css?direct` response
contains the corrected selector; its repository-mounted Vite host requires no
restart. These captures and logs are temporary diagnostics.

## Spec synchronization and residual scope

Reviewed the parent's final spec and task updates for consistency with source
and executed checks. `frontend/component-guidelines.md` now requires the shell
inline margins and copy/card/topbar viewport-axis assertions, and distinguishes
native mobile from narrow Web disclosure placement.
`frontend/quality-guidelines.md` records that fixed-month inheritance tests must
also control creation time: even a null initial budget creates an explicit
current-month source. PRD and implementation records preserve exact passing
counts and the previous failure. Parent ran `task.py validate` successfully;
the existing component-spec context-size warning remains
(35409 bytes versus 32768-byte threshold), not a failing validation. Final
`git diff --check` also passed.

No unresolved defect remains in the reviewed changes. User visual preference is
optional feedback, not a fabricated approval. Installed Electron/Android,
screen-reader/device traversal, live deployment lifecycle and long-term HTTPS
remain outside this CSS correction. Preserve the active task and its A04/A06/A07
limitations.
