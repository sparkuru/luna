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
the recent ledger, and the host's record action. On Web, that action is exactly
one page-level `#primary-record`; native hosts may retain their direct income
and expense shortcuts. It must not render a
persistent desktop-side transaction form, budget summary, settings panel, or
sync/backup panel.

The record action opens a modal transaction dialog. It exposes only the fields
needed for the common path (transaction type, amount, category, and date);
date remains visible in the core form because it controls the financial period.
Merchant, payment method, notes, and future split controls belong behind a
native semantic `<details>` disclosure. Category selection uses a separate
short modal flow and a single read-only `#choose-category` button surface; the
transaction form must not expose a free-text category input because categories
come from the workspace catalog. On native hosts, the
`#open-secondary-menu` control opens the secondary modal; on Web, its stable
counterpart is the Settings navigation item. Budget, category breakdown,
display settings, and sync/backup tools remain reachable through those
settings surfaces. All platforms must submit the same `TransactionDraft`
through `window.lunaLedger`.
The native `#open-secondary-menu` control may retain its decorative
`.menu-icon`; the Web settings navigation item uses the design-consistent
`.settings-navigation-icon` while keeping the stable ID and localized
accessible name. Do not use the literal Chinese character `三` as a visible
label or as a substitute for an icon.
Each summary card also exposes a 44px `.summary-visibility-toggle` beside its
label. Each control changes only its own summary amount. The renderer keeps
these three visibility flags in session memory, while the hide-by-default
setting initializes all three after reload. Transaction and budget details
remain unchanged.

### Web Shell Separation

The Web presentation shell separates navigation chrome from ledger actions and
workspace administration. `.web-sidebar` contains the brand and exactly one
`PrimaryNavigation`; it must not contain `#primary-record`, a ledger picker,
an account description, or a persistent sync-status card. The Web ledger page
owns one solid `#primary-record` button for `addTransaction`; it does not
render `#record-expense` or `#record-income` shortcuts. The transaction dialog
retains the income/expense type switch for choosing the record type. The
single Settings navigation item keeps the stable `#open-secondary-menu` ID and
uses `.settings-navigation-icon` on Web.

Workspace/ledger switching, account state, and sync/backup descriptions belong
to `/settings` and its subroutes. If a Web sync capability needs to remain
discoverable, expose a real settings navigation action such as
`#open-sync-status`; do not reintroduce its details into the ledger shell.
This keeps the primary ledger task visually focused while preserving access to
the same shared settings/API logic.

The Web `TransactionDialog` uses a full-width desktop flow: type switcher,
category suggestions, and quick core fields span the form; amount, category,
and date are one balanced row; the optional calculator also spans the form;
the save action follows the core fields before the optional details and image
attachment sections. Radix portals render outside `.app-shell`, so portal
geometry must use `html[data-client-surface="web"]` selectors in addition to
the scoped shell selectors.

On the Web ledger, place the unique `#primary-record` after the month controls
inside `.page-heading-actions`; desktop CSS therefore presents the record CTA
directly below the month selector, while narrow layouts may make both controls
full width. During a month transition, `LedgerMonthLoading` must keep the
ready-state hero, month controls, summary grid, and transactions panel in the
same page frame, use static non-financial placeholders, and keep loading/error
status plus retry in that frame. Do not animate loading placeholders when the
purpose is to prevent a layout flash.

```tsx
<WebSidebar />
<LedgerHome web />
<TransactionDialog /> // type → category → amount/date → save → more details
```

Good: the 1440px Web ledger shows one sidebar Settings item and one page-level
record CTA, while the settings overview owns ledger/account/sync cards. Bad:
putting a second Settings button or a record button in the sidebar, or styling
only `.client-surface-web .transaction-dialog-panel` and leaving its portal
with the old two-column blank area.

### Workspace Setup Composition

The no-workspace `Setup` surface uses a single centered column on every
viewport: `.setup-copy` presents the welcome context above `.setup-card`, and
both share the same readable axis. Keep the form card width-constrained and
let the page flow vertically; do not restore a tall two-column setup with
`align-items: center`, because the card's form height pushes the brand copy
into the lower half of the first screen and creates a large blank upper area.
At `<=768px`, retain the same single-column flow and verify the card has no
horizontal overflow at a 375px viewport.

After a successful mutation, reload the host snapshot before announcing the
result. A failed mutation keeps the draft and its recovery path visible. This
keeps the simple entry surface from becoming a second financial source of
truth and preserves revision, conflict, and multi-category protections.

### Web Month and Statistics Presentation

The Web ledger has two distinct month states: the route-selected month and the
snapshot currently returned by the host. During a month transition, keep the
shell and workspace context mounted, but render a month loading/error state;
never reuse the previous month's transactions or summary under the new month
label. Once the snapshot is ready, pass the selected month as both the base
query range (`YYYY-MM-01` through that month's final day) and the summary
context. User-entered date filters may narrow that range, but must not broaden
it into another month. The transaction count and empty-state decision use the
same selected-month range.

For the Web ledger, `#month-picker` is a non-editable
`button[type="button"]` with a `data-month="YYYY-MM"` value. Its month panel
offers year navigation and twelve month buttons, marks the selected month with
`aria-pressed`, and closes on Escape or an outside pointer while returning
focus to the trigger without scrolling. Keep the previous/next month buttons
as the fast path. Electron and Android retain the existing labelled
`input[type="month"]` control; do not let the Web-only picker CSS or markup
replace that native path.

Each workspace Web page owns its own heading and any relevant period control;
do not render the generic `WebPageTopbar` for ledger, statistics, budget, or
settings. The ledger hero/month picker, statistics anchor, and budget month
label provide their own context, while settings has no month context at all.
Keep the setup topbar and native host shells unchanged. A full-row filter reset
action must use a readable surface/ink pair from the existing tokens, retain a
visible focus ring, and remain legible in its default, hover, and focus states;
do not rely on a dark semantic background with dark text.

On the Web ledger, the filter type select spans the filter grid's full row so
it does not look like an orphaned half-width control. Empty filter date fields
remain real native date inputs: mark their controlled empty state and hide only
the browser's empty yyyy/mm/dd hint with Web-scoped CSS. Preserve the calendar
indicator, `showPicker()` behavior, keyboard editing, and selected date display;
native hosts keep their existing appearance.

The Web statistics view may compress a dense daily/monthly bucket collection
into an interactive plot, but it must keep a keyboard-selectable control for
each bucket, a text-equivalent expandable detail list, and the existing
selected-bucket transaction detail. Category and largest-expense lists show a
bounded initial ranking with an explicit “view all” control when more rows
exist; this limits visual density without discarding data.

Good: while `/luna?month=2026-08` is loading, show the August loader and no
July records; after loading, show only August records. Bad: leave the old
transaction list mounted while changing only `#month-picker`, or render thirty
daily rows as the dominant first view without a compact visual summary.

New transaction drafts always initialize `date` from `currentLocalDate()`;
the route-selected month does not change that default, so a record created
while viewing a historical month still belongs to today unless the user edits
the date. Editing an existing transaction preserves its stored date in the
initial draft.

### Ledger Filter Composition

The ledger filter is a semantic disclosure, not a second ledger page. Its
default query always supplies the selected month's first and last local dates;
user date bounds may narrow that interval but may not cross the month boundary.
Type and category criteria are combined with AND; multiple selected categories
are OR within the category criterion; a matching split must return its parent
transaction once. Amount bounds compare the absolute transaction amount in
minor units, while text/regex search covers merchant, payment method, notes,
and split category IDs.

Category controls use catalog labels and stored IDs separately. Derive normal
options from categories used in the selected month, group active definitions
by expense/income, and retain a selected historical or deleted ID as a visible
fallback until the user removes it. Never expose a raw `expense:0`-style ID as
the normal label when a live catalog definition exists. Do not clear selected
categories merely because the transaction type changes.

When the selected transaction type is `income` or `expense`, render only the
matching catalog group in the category picker; the `all` type may render both.
If a previously selected category no longer matches the type, keep the query
and its removable chip instead of silently deleting it or showing it as a new
option. This makes an intentional type/category conflict evaluate to no
matches while keeping the user's criteria recoverable.

Changing the type is an in-place query-parameter update, not a page change.
Call the router with `resetScroll: false`, preserve the disclosure and local
filter state, and restore focus to `#filter-type` with
`focus({ preventScroll: true })` after navigation completes. Do not duplicate
financial state in the shell just to achieve this behavior.

The free-text search uses one labelled input control. Regular-expression mode
is an adjacent `.*` toggle inside that control, exposed as a real button with
`aria-pressed` and a localized accessible name; it is not a detached checkbox
or a separate filter criterion. The visible marker communicates the familiar
Find-widget affordance while the existing text/regex query semantics remain
unchanged.

The Web month trigger displays the selected month as text without a redundant
central dropdown chevron. The previous/next month buttons remain the explicit
directional fast path, and the trigger still opens the accessible month panel.

Filter evaluation has explicit `ready`, `working`, `invalid`, and `failed`
states. During regex worker debounce/execution or a recoverable error, retain
the last ready list and count rather than rendering a transient filtered-empty
state; only a ready result updates the count and filter totals. Clear/reset
must remove type, categories, text, date, amount, and regex mode together.
Active criteria are represented by removable chips and never written into the
URL or browser history. Every date/amount/search control has a visible label,
localized error association, and keyboard-sized target.

### Date Picker and Calculator Presentation

The transaction and ledger-filter dates remain real, labelled
`input[type="date"]` controls with ISO values; the transaction field keeps its
stable `#transaction-date` ID. When the product wants every pointer location
in the field to open the calendar, capture the field's pointer-down,
feature-detect `showPicker()`, and invoke it with the input as the receiver.
Only after that call succeeds should the pointer default be cancelled; when
the API is absent or rejects activation, leave the native input path available
as the fallback. This prevents Chromium's year/month/day segment selection
from becoming the visible primary click behavior without replacing keyboard
editing or native validation. Use the shared `DateField` primitive through
`Field` so the transaction and filter forms cannot drift.

The optional calculator uses the shared `displayAmount` projection for its
result. Render that projection directly in a prominent, right-aligned display
below the calculator title row—do not add a redundant “exact preview” label—and
keep the ledger-precision value submitted by the existing evaluator separate
from the display projection. The display projection uses the workspace
precision for its main fractional digits and appends the next digit in
parentheses only when the exact result continues, for example `3.33(3)` at
precision 2. A dark, inset LCD treatment may establish a clear display/keypad
hierarchy without introducing an image asset. Keep the display and four-column
keypad usable at 375px; the equals action may span the main keypad columns
while the backspace remains in the final column.

When the Web calculator is expanded (and on native surfaces where it is always
visible), keep the calculator expression separate from the ledger amount draft.
Mouse keys and calculator keyboard keys (digits, decimal point, operators, and
backspace) update the LCD expression first; `=` or Enter is the only evaluation
boundary that writes the rounded ledger value back to the amount field. Scope
keyboard capture to the amount field and calculator controls so merchant,
notes, date, category, and other form controls retain their normal input paths.

Calculator keys should read as pressable controls rather than flat cards: use
consistent rounded corners, a restrained raised shadow, a small upward hover
shift, and a pressed downward shift. Keep number keys neutral, use a soft
primary tint for operators, and reserve the strongest primary treatment for
the wide equals action. Give clear and backspace a quieter neutral treatment;
do not rely on color alone for their meaning, and keep the global visible
focus outline intact.

Transaction list rows keep the right-side metadata and actions visually level on
desktop: the income / expense tag and amount share a vertical center with the
edit, delete, and attachment actions. Keep the title and category / note copy in
the left two-level content block. At narrow widths, move the tag and amount back
into the primary line so they remain visible without horizontal overflow.

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
