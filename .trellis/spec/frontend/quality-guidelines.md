# Quality Guidelines

> Quality rules for the shared React renderer on Web, Electron and Android.

## Overview

The renderer must remain usable offline, keyboard-operable, privacy-safe, and
honest about the separate ledger and portable-settings sync states. It consumes only
`window.lunaLedger`, uses shared validation and locale formatting, and renders
from fresh safe projections in both Electron and Web hosts.

## Forbidden Patterns

- Do not access Node, Electron, SQLite, or filesystem APIs from renderer code.
- Do not make renderer network calls, load remote fonts, use emoji as icons, or
  imply that a config-sync success uploaded transactions or budgets. Web
  SQLite-WASM/OPFS is the ledger persistence boundary; native Android may use
  its explicit IndexedDB compatibility adapter when OPFS is unavailable. Web
  must not call desktop sync APIs or silently downgrade a plain HTTP origin.
- Render user-controlled values through React text children; do not use
  `dangerouslySetInnerHTML` or interpolate them into raw HTML.
- Do not hide validation errors, remove keyboard focus, or make a disabled
  control appear actionable.
- Do not edit a multi-category transaction through the single-category form;
  the current UI must keep it read-only.

## Required Patterns

- Use semantic headings/landmarks, labels, an explicit skip link, and an
  `aria-live` region for action results.
- Keep focus-visible styles, minimum 44px controls, responsive layouts for
  narrow desktop windows, and `prefers-reduced-motion` behavior.
- Represent loading, setup, empty, filtered-empty, error, disabled, and success
  states explicitly.
- Use the indigo/green semantic token palette documented by the task design;
  reserve red for destructive/error states and preserve readable contrast.
- Keep hidden summary amounts out of their DOM text/attributes/live regions and
  keep credentials/passphrases out of every renderer-readable response. Detail
  budget/category/transaction amounts are intentionally visible.

## Testing Requirements

Run `./hako npm run typecheck` and `./hako npm test` for every renderer/API
change, then run `./hako npm run build` and `npm run smoke:electron` for
cross-layer changes. Run `npm run web:build` and `npm run test:web` for Web UI
changes. The packaged smoke and Playwright verify behavior, not all visual
quality or assistive technology; a human must still review packaged Electron,
keyboard focus, reduced-motion, native dialogs, and assistive technology.

## Code Review Checklist

- [ ] Does user data render through React's escaped text children?
- [ ] Does the form have labels, errors, disabled state, and keyboard focus?
- [ ] Does a committed mutation remain successful if its subsequent refresh
      fails, with an honest recoverable refresh warning and no replay?
- [ ] Are month navigation, filters, empty state, and delete state clear?
- [ ] Does the UI distinguish encrypted portable-settings sync from ledger
      sync and avoid provider-wide compatibility claims?
- [ ] Were typecheck, tests, build, and packaged smoke run when applicable?

Packaged smoke scripts must navigate the actual menu routes and open dialogs
before checking their controls. Controlled React inputs require a native value
setter plus bubbling input/change events (or real Playwright interaction), and
durable commit checks must wait separately for the Query-driven UI refresh.
Do not assume the former all-on-page forms remain mounted after routing.
