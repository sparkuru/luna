# Component Guidelines

> UI composition rules for the React renderer with Tailwind and shadcn/ui.

## Overview

React feature components render semantic HTML through JSX. User-controlled
values remain text; never use dangerouslySetInnerHTML for ledger content.
Components receive shared domain DTOs and workspace currency/precision, never
database rows. Project-owned shadcn components live in components/ui.

Every user-visible renderer string comes from the complete `en`/`zh-CN`
catalog, including document title, accessible labels, errors, statuses, and
empty states. Amount/date/month formatting uses the selected locale.

## Component Structure

Prefer a focused typed component for one feature or reusable visual primitive:

```typescript
function TransactionListItem(props: {
  transaction: Transaction;
  currency: string;
  precision: number;
}) { /* render semantic JSX and host-backed actions */ }
```

Use React event handlers and clean up external listeners in effects. After a mutation, reload the
snapshot and render the affected state; do not maintain a second UI-only copy
of financial totals.

## Props Conventions

Use explicit TypeScript parameters and shared DTO types. Pass primitive display
settings (`currency`, `precision`, `month`) separately from a `Transaction` or
`AppSnapshot`. Do not pass `HTMLElement` references through the IPC boundary.

## Styling Patterns

Use Tailwind utilities, local CSS variables in `styles.css`, semantic classes,
and responsive layout rules. Keep colors meaningful (`income`, `expense`, `danger`, `focus`)
and preserve the visible focus ring. Do not add remote fonts, emoji as icons,
or inline style attributes to user-visible nodes.

Both host entries load external CSS. The shadcn Dialog overlay uses static
scroll-lock CSS instead of Radix RemoveScroll's injected stylesheet; retain
Radix modal focus/ARIA semantics and test nested Escape handling under CSP.
DialogContent preserves child form instances in a stable React portal when
the modal scope closes. Do not replace this with unmount/remount that silently
resets a financial draft or its observed revision/budget heads.

For a nested dialog, prevent the default close autofocus and restore the parent
trigger in a microtask. The installed Radix FocusScope invokes close autofocus
before removing its scope; an immediate parent focus assumes the wrong order.
Keep a short source comment and browser assertions for both Escape and category
selection. Re-check this lifecycle when upgrading Radix; do not replace the
contract with arbitrary sleeps or treat repeated passes as proof of ordering.

When a dialog intentionally focuses a field below the mobile first viewport,
use `focus({ preventScroll: true })` so opening it does not hide the dialog
heading or the first-step controls. Test the initial scroll position visually
and keep the focused control keyboard-reachable.

### Ledger Quick-Entry Composition

The shared ledger home uses one recording mental model across Web, Electron,
and Android: recent transactions remain the primary content and a clear record
entry is always discoverable. The home surface contains the brand/workspace
context, page heading, three summary values (income, spending, and net flow),
the recent ledger, and the primary record actions. It must not render a
persistent desktop-side transaction form, budget summary, settings panel, or
sync/backup panel.

The record action opens a modal transaction dialog. It exposes only the fields
needed for the common path (transaction type, amount, category, and date);
date remains visible in the core form because it controls the financial period.
Merchant, payment method, notes, and future split controls belong behind a
native semantic `<details>` disclosure. Category suggestions use a separate
short modal flow and must preserve custom input. The secondary menu is a
modal dialog opened by the `#open-secondary-menu` control; budget, category
breakdown, display settings, and sync/backup tools render there. All platforms
must submit the same `TransactionDraft` through `window.lunaLedger`.
The `#open-secondary-menu` control renders a decorative `.menu-icon` with
three horizontal child lines and keeps its localized accessible name in
`aria-label`; do not use the literal Chinese character `三` as its visible
label.
Each summary card also exposes a 44px `.summary-visibility-toggle` beside its
label. Each control changes only its own summary amount. The renderer keeps
these three visibility flags in session memory, while the hide-by-default
setting initializes all three after reload. Transaction and budget details
remain unchanged.

After a successful mutation, reload the host snapshot before announcing the
result. A failed mutation keeps the draft and its recovery path visible. This
keeps the simple entry surface from becoming a second financial source of
truth and preserves revision, conflict, and multi-category protections.

## Accessibility

- Use headings, `main`, `nav`, `section`, `form`, labels, and list elements for
  their semantic roles.
- Every control has an accessible label or visible text, a minimum 44px target,
  keyboard focus, and a clear disabled/error state.
- Keep a skip link, an `aria-live` status region, `aria-invalid`/descriptions
  for errors, and a predictable focus target after navigation or save.
- Respect `prefers-reduced-motion` and test at narrow desktop window widths.
- For fixed mobile navigation, measure the real geometry with representative
  synthetic records: at 375×812 the month, all three summaries, two complete
  transaction rows, and the central record action must clear the navigation;
  an empty-state-only check is insufficient.
- When summary amounts are hidden, no actual aggregate monetary value may
  appear in the three summary values' text, ARIA, title, dataset, or live
  regions. Budget editor values, budget detail text, category totals, and
  transaction amounts remain visible by product design. The reveal control is
  session memory only. Toggling visibility must preserve the summary card
  geometry and the surrounding page flow; a hidden value is not a reason to
  shrink or reflow its card.

## Common Mistakes

- Do not interpolate merchant, category, notes, or error text into `innerHTML`.
- Do not render a successful status and then immediately erase it by calling a
  full render; announce success after the render completes.
- Do not make a multi-category record editable as a single category: lock it
  until split editing exists so data is not silently lost.
