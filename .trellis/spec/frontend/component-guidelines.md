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

Transaction detail follows the same teardown boundary even when returning to
a list-row opener. Capture its opener for an intentional close and restore it
from the close-autofocus callback's microtask, after the scope exits; a
microtask scheduled only by the state-close handler runs too early. Detail
BACK, visible close and Escape must return to that opener (or the list heading
if removed). Opening the editor from detail must instead keep amount focus;
do not restore list focus over the newly opened editor.

An icon-only dialog close action keeps its localized accessible name on the
button and marks the decorative icon `aria-hidden`. The mobile and narrow-Web
transaction close target remains exactly 48×48px and shares the title row's
vertical center.

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
and expense shortcuts; narrow Android hides those duplicate shortcuts and uses
the central record action. It must not render a
persistent desktop-side transaction form, budget summary, settings panel, or
sync/backup panel.

The record action opens a modal transaction dialog. It exposes only the fields
needed for the common path (transaction type, amount, category, and date);
date remains visible in the core form because it controls the financial period.
Merchant, payment method, notes, and future split controls belong behind a
native semantic `<details>` disclosure. Category selection uses a separate
short modal flow and a read-only `#choose-category` button surface. Mobile also
offers an enabled-category quick grid; more categories opens the same catalog
picker without automatically focusing its search input. Editing a disabled
category keeps its name and disabled explanation visible and preserves its ID.
The transaction form must not expose a free-text category input because categories
come from the workspace catalog. On mobile, stable `#open-secondary-menu`
belongs to the bottom Settings item; omit its duplicate topbar control.
Electron retains its menu control, and Web uses its Settings navigation item.
Budget, category breakdown,
display settings, and sync/backup tools remain reachable through those
settings surfaces. All platforms must submit the same `TransactionDraft`
through `window.lunaLedger`.
The native `#open-secondary-menu` control may retain its decorative
`.menu-icon`; the Web settings navigation item uses the design-consistent
`.settings-navigation-icon` while keeping the stable ID and localized
accessible name. Do not use the literal Chinese character `三` as a visible
label or as a substitute for an icon.
Each summary card also exposes a `.summary-visibility-toggle` (44px minimum;
48px on Android). On narrow Web and Android layouts, reserve independent grid
areas for the label, amount, and toggle;
never position the toggle over the amount. Long and negative localized amounts
must remain readable at 320px without horizontal overflow. Each control changes only its own summary amount. The renderer keeps
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
to `/settings` and its subroutes on all surfaces. The native topbar shows brand
and current workspace (Electron additionally keeps `#open-secondary-menu`);
it has no persistent sync status,
login/unlock reminder, or ledger selector. Use the registered Sync settings
card to reach `/settings/sync`; its status, mode, unlock and retry controls own
that information. The settings overview itself has no storage capability or
sync-status decoration. Do not reintroduce these details into the ledger shell.
This keeps the primary ledger task visually focused while preserving access to
the same shared settings/API logic.

Use a plain localized ledger heading and avoid repeated hero slogans, recent
ledger explanations, or capability announcements. In production Web,
`data-offline-shell="ready"` remains the machine-readable readiness signal;
`#offline-status` and its `.offline-notice` parent are hidden and empty on
`offlineReady`. Preparing/unavailable states retain localized visible feedback.
Test both successful offline reload and service-worker registration failure;
absence of a success message must not be interpreted as readiness failure.
Automatic sync remains host-owned for configured/unlocked active sessions,
independent of settings visibility. Never add renderer polling to quiet the
shell, overwrite a saved manual mode, or imply an Android background service.

Web settings subpages at <=768px use a compact Settings return action and
`#settings-section-switcher` disclosure, generated from the same settings area
registry as desktop groups. The disclosure resets closed after section changes;
only the visible navigation participates in keyboard and current-page checks.
At 375x800, preferences language and privacy controls must be usable without
scrolling through the navigation directory; at 320x568, its title and first
primary input must be visible. Bottom navigation targets occupy equal-width
slots and remain at least 44x44px.

The Web `/settings` index uses grouped overview cards as its primary entry
points and omits `SettingsNavigation`; `/settings/**` subpages show the
navigation with a Settings return action and `aria-current="page"`. Generate
both surfaces from `src/renderer/features/settings-navigation.ts`, keeping
paths, groups, and localized title keys in one presentation-only registry.
The router still registers deep links separately. The explicit mobile surface
uses four groups with seven direct settings entries; configuration sync remains
reachable under the Sync page's advanced disclosure. Mobile child pages show
only `#settings-back` and their own heading, without the complete module
directory. `/budget` has its own route on every workspace surface. Keep every
registered settings deep link reachable when changing this presentation.
Overview cards are real anchors. Intercept only an unmodified primary click for
client routing; let Ctrl/Meta/Shift/Alt clicks and other native link actions
retain browser behavior, including opening a new tab.

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

For desktop Web, `.client-surface-web:has(.web-setup-topbar)` keeps
`max-width: 1440px` and `margin-inline: auto`; the workspace shell's `margin: 0`
must not leave this width-constrained welcome shell anchored to the left.
In `workspace-setup-visual-polish.spec.ts`, assert the topbar, welcome copy and
card centers against `window.innerWidth / 2` at 1280px, 1366px and 2048px, not
only against each other. At 2048px, mutual alignment alone permits the known
304px left offset.

A fresh browser must expose `#setup-restore` and `#setup-connect` from the welcome
surface. With no workspace, `/settings/backup` renders the real restore tool and
`/settings/account` renders the account flow without first creating a dummy ledger
or leaving the setup form above them. `#setup-back` returns to welcome without
creating data. Backup export remains unavailable until a workspace exists; failed
restore attempts must leave an empty workspace empty. Verify recovery from the
visible welcome action in a fresh browser context, including image bytes and reload,
not merely through a direct route after precreating a local ledger.

On the no-workspace Web surface, omit `#open-secondary-menu`: its `/settings`
target resolves back to Setup and gives the user no action. Keep the host's
native menu behavior separate. Both localized setup notes must point to the
visible restore/connect actions rather than telling a new user to open Settings.
The welcome browser regression checks those actions, the absent dead control,
and the return path after opening recovery.

For a new ledger, changing currency resets precision to JPY=0 or otherwise=2;
show the current value in `#setup-precision-summary` and keep manual precision
in `#setup-advanced`. Invalid advanced input opens its disclosure before focus.
The optional initial budget must say it is optional; name-only creation uses
the displayed currency defaults. Existing ledgers are never altered by these
setup presentation defaults.

Only the explicit native mobile surface puts the optional budget inside
`#setup-advanced`; desktop and narrow Web keep it visible outside the disclosure.
Verify precision is hidden when collapsed, Enter toggles the disclosure on Web,
and the native mobile budget remains hidden until its disclosure opens.

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

An unfiltered month with no transactions uses one localized empty-state message
that names the selected month, regardless of whether the ledger has records in
other months. Do not add a second record CTA or a first-transaction tutorial to
that state; keep the host's normal page-level record action available. When a
filter is active and yields no matches, use the filtered-empty state instead.

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
picker provide their own context, while settings has no month context at all.
Keep the setup topbar and native period input behavior separate. A full-row filter reset
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
selected-bucket transaction detail. Provide `#statistics-bucket-select` and
44px previous/next controls alongside the chart so selecting any date does not
require hitting a narrow bar. Keep future buckets explicitly labelled and retain
the text detail list; never expand overlapping bar hitboxes.
Category and largest-expense lists show a
bounded initial ranking with an explicit “view all” control when more rows
exist; this limits visual density without discarding data.

At Web viewport widths below 768px, `.statistics-page` content keeps at least
24px of visible left and right gutter from the viewport edge. Apply the same
gutter to its heading, toolbar, grid and cards, and verify no horizontal
overflow at 320px, 375px and 457px. Place the narrow-Web rule after generic
mobile rules so a later zero-padding `.statistics-page` selector cannot erase
the gutter. Electron and desktop Web retain their existing layout.

Good: while `/luna?month=2026-08` is loading, show the August loader and no
July records; after loading, show only August records. Bad: leave the old
transaction list mounted while changing only `#month-picker`, or render thirty
daily rows as the dominant first view without a compact visual summary.

New transaction drafts always initialize `date` from `currentLocalDate()`;
the route-selected month does not change that default, so a record created
while viewing a historical month still belongs to today unless the user edits
the date. Editing an existing transaction preserves its stored date in the
initial draft.

### Mobile Statistics and Budget Presentation

Ledger, Statistics and Budget center their period control and its displayed
value in the same top position. Android WebView may ignore desktop datetime
pseudo-element centering. Shared `NativePeriodInput` retains the labelled,
focusable, 48px native input as a transparent interactive overlay and paints
its derived UTC/localized value separately with `aria-hidden`. Keep the
calendar affordance separate from text centering, and use `:focus-within` on
the visible wrapper. Never replace native touch handling with a synthetic
picker. Validate visible glyph positions, not only the input bounding box,
then actual APK center/indicator touch and system cancellation.

Mobile period navigation uses the same three-column header across Ledger,
Statistics and Budget: 48px previous button, centered native input, 48px next
button. `NativePeriodNavigator` supplies this contract for Statistics and
Budget; retain Ledger's existing month handlers and the same geometry. Keep
localized accessible labels on icon-only buttons. Statistics month arrows
call the original `onMonthChange(previousMonth/nextMonth)` Router path; week
arrows shift the anchor by seven UTC days and year arrows by one UTC year
through `onAnchorChange`. Clamp February 29 to February 28 in a non-leap year.
Do not add shadow month state or bypass Budget's dirty/pending guard. Test
cross-year month navigation, a week crossing a month boundary, leap-day
clamping, original draft cancellation, and glyph/button alignment in both
locales at 320/375/457px. Web/Electron keep their existing period controls.
Mobile Statistics and Budget retain visually hidden,
accessible headings instead of duplicate visible page titles. Week/month/year
controls retain their existing date semantics; Web and Electron are unchanged.

The explicit mobile surface presents statistics in this order: total, compact
real trend, categories, then largest expenses. Keep all buckets from the same
domain calculation in `#statistics-trend-details`, initially collapsed, and
provide `#statistics-bucket-select` with 48px previous/next targets. Future
buckets retain their text label; zero buckets must not appear as nonzero bars.
At 457×999 the initial category row fits above the bottom navigation. Bar/ring,
category split drilldown, amount/date sort and top-five/view-all semantics are
unchanged. Long category names and amounts reflow at 320px instead of reducing
body text or touch targets.

Mobile Budget owns its labelled native month input and previous/next actions,
using the Router setter and dirty blocker described in state-management.
An unset budget displays actual spending plus `#open-budget-editor` and no
fictional progress. Set budgets display remaining or excess and actual use;
excess uses the danger color. Declare WebKit and Mozilla progress pseudo-rules
separately so one unsupported selector cannot invalidate the other's color.
The editor retains blank-to-remove, original heads and no-replay recovery.
Real IME hides bottom navigation and leaves `#save-budget` reachable. Web and
Electron keep their existing budget presentation paths.

### Ledger Filter Composition

Web/Electron ledger filters use a semantic disclosure; mobile uses the dialog
described above with the same query contract. Put text
search first, followed by type and categories. Keep date/amount controls in
`#filter-advanced` without recreating their state when collapsed. Active chips
remain visible outside the disclosures; Reset stays outside the advanced
section and clears every criterion together. Its
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

On the explicit mobile surface and narrow Web viewports below 768px, the
transaction date paints a visible, `aria-hidden` `YYYY/MM/DD` value over the
native input's locale-dependent date segments. Derive this text from the ISO
value without converting through a timezone-sensitive `Date`; explicitly show
the projection in both surface styles and keep it above the input's date text.
Keep the input labelled, focusable, pointer-active, and at least 48px so its
native/browser picker, keyboard editing, validation, and ISO save value remain
authoritative. Test projection visibility and inspect rendered pixels; DOM text
alone does not prove which date segments users see. Keep desktop Web and
Electron's native date display unchanged, and leave the calendar indicator
visible.

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
For the Web `<details>` calculator, read the element's `open` property during
the form's capture-phase `keydown` handler. The native disclosure can open
before React's `toggle` state or an effect-installed document listener updates;
the first digit must already go to the LCD. When collapsed, amount typing must
stay native. Let Enter activate a focused calculator button (including Evaluate)
instead of intercepting that button's keyboard click; Enter on the amount field
or disclosure summary may evaluate the expression. Mobile presents expression
and `displayAmount` in the single `#transaction-amount` control rather than a
second LCD. A repeating result such as `3.33(3)` is display-only; the evaluator
still submits ledger-precision amount `3.33`. Web and Electron retain their
separate calculator display.

### Mobile Ledger and Dialog Presentation

Select this layout through `html[data-client-surface="mobile"]`, not viewport
width. Use system fonts, compact grouped summaries, day-separated transaction
rows, and five equal bottom slots (Ledger, Statistics, Record, Budget, Settings).
All five controls must share one row and retain 48px touch targets; stable
`#open-secondary-menu` must override any inherited Web grid placement.
At 457×999, a three-record fixture must show the month, all summaries and at
least two complete rows above navigation. Do not duplicate identical title and
notes. Long summary amounts may wrap inside a fixed-height area; reveal/hide
must not reflow the surrounding ledger or overlap the eye.

Mobile `#filter-details` opens persistent `#filter-dialog` instead of expanding
controls into the ledger. Keep query criteria/errors, active chips, result count
and full reset; the result action closes only the panel. A real text keyboard
shrinks the viewport and hides bottom navigation via `data-mobile-ime`; reset
the unobscured-height baseline when width changes so rotation alone does not
imply a keyboard. DOM fill may focus without opening the real Android IME;
test a pointer click and inspect actual native keyboard state.

Mobile entry uses a full-height stable portal, internally scrolling
`#transaction-form`, and a separate `form="transaction-form"` save footer.
Category/date remain core fields; optional merchant/payment/notes/images belong
in more information. Keep the footer inside the actual resized viewport,
including text IME; retain `100vh` baseline and enhance `100dvh` only in a
separate supports rule. Details use compact key/value rows and omit empty
optional fields. Visible filter/detail/image layers consume native BACK before
router fallback; an image closes to its parent detail without closing both.
The event is dispatched on `window`: capture alone does not guarantee priority
over another listener on that same target. Shell routing must defer when an
actual visible dialog is present, then its owner handles the event. Exclude
hidden, inert, aria-hidden, closed, visibility-hidden and zero-rect portals.
Closed persistent portals do not count as visible modals. Validate with
`mobile-ledger-redesign.spec.ts` and installed APK checks.

### Mobile Settings and Recovery

Category management separates expense/income tabs, an add disclosure and a
single-open row menu. Usage remains a dialog whose BACK closes only that layer
and restores the invoking control. Preserve original usage revisions/heads and
confirmation intent as specified in state-management.

Account starts with server, username and password; device naming is optional.
Long identity values wrap at 320px. Embedded Sync controls use the router
navigation callback, including the advanced link, so mobile hash history does
not become a document reload. Sync status belongs to its settings module;
opening Settings must not be required for automatic sync to run.

Backup offers save/import choices while both forms remain mounted and hidden
when inactive. Use independent dirty keys for save and import; saving one must
not clear an unsaved draft in the other. Retain password clearing, confirmation,
errors and existing encrypted/chunked APIs. Welcome exposes name/currency first
and precision/budget in an advanced disclosure; restore/connect still work
without creating a dummy workspace. Web/Electron keep their existing layout.

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
- Controls have an accessible label or visible text, keyboard focus, and a clear
  disabled/error state. Primary touch targets are at least 44px. Dense chart
  bars may remain narrow only when the adjacent 44px bucket picker and complete
  text list provide the same selection operation without overlapping hitboxes.
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
