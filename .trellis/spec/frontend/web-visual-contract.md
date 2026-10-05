# Web visual contract

## Shared identity and headings

`src/renderer/assets/luna-icon.svg` is the project-authored moon/star/orbit source.
`BrandMark` imports it for both shell anchors; `webOfflinePlugin` reads the same
file for the production `/icon.svg`. Keep it local and precached. Do not copy
another icon string into the build plugin or add remote fonts/assets.

Web routed primary titles use one `h1`; account, settings, tools and category
components choose `h1` on Web and retain their existing native heading level.
The narrow ledger heading remains visually hidden because its record/month
controls carry the visible heading area. Desktop Web titles share the system
font and 650 weight. Nesting a title in `.section-heading` must retain the scale.

## Geometry and financial emphasis

Global unlayered `a { color: ... }` overrides a Tailwind utility layer on
`Button asChild` anchors. Web default button links explicitly retain primary
foreground color. Verify `#sync-go-to-account` text/background contrast >=4.5;
a clickable blue rectangle with blue text is not a usable account action.

At >=768px the Web summary uses heading/metric/foot rows. Keep the metric row
bounded at 3rem with vertical overflow for exceptionally long amounts; revealed
values must not overlap the footer or shift the following transaction panel.
`.summary-card .subtext` reserves 1.25em in both populated and month-loading
states. A hidden skeleton using a different font size without that minimum
caused a ~4px panel shift; verify loaded/loading geometry with `react-state`.

Web zero/future progress tracks are transparent. Keep real progress values,
selected bucket states, date picker and textual detail alternatives intact.
Use separate WebKit pseudo-element rules: an unsupported pseudo-element in a
selector list can invalidate its ordinary progress rule in Firefox.

## Narrow and enlarged text

Below 768px, narrow Web uses physical horizontal gutters and 44px month-arrow
targets. Statistics has a full-width period group and two content-balanced
groups below it; labels must fit inside their buttons, with targets >=44px.
The summary, statistics page and primary navigation establish inline-size
containers. At `max-width: 12rem`, relative to the enlarged root font, summary
cards stack label/value/footer, statistics groups use full rows and navigation
links become readable full-width rows. Reset `#open-secondary-menu`'s original
column/row explicitly; its ID selector otherwise creates an extra column inside
the reflowed navigation. Settings preference fields use an auto-fit grid so two
fields do not leave an unused third column or stretch a small field to match a
long privacy explanation. This reflows at a fixed viewport when
text grows; do not mask overflow by clipping the document or shrinking text.
Long transaction amounts may wrap within the row. No amount may escape the
viewport, even when the root font is 200% and the amount has nine integral digits.

## Feedback and motion

`LedgerRoute` replaces its home subtree with loading content while switching
months. Track focus inside its month controls and restore the same control in
the layout effect only when replacement left `document.activeElement` at
`document.body`. Clear the remembered target when focus moves elsewhere and
remove the document listener on unmount. A picker-local ref alone cannot restore
focus after the picker itself was replaced. The controlled snapshot test in
`react-state.spec.ts` opens/closes the picker while loading, releases the read,
and asserts that the ready month's picker remains focused.

Use `--motion-feedback: 160ms`, `--motion-enter: 240ms`, and `--ease-enter`
for Web feedback. Dialog entrance uses opacity/translate; overlay uses opacity.
The overlay is a plain div without `data-state`: target
`[data-slot="dialog-overlay"]:not([hidden])`. Under reduced motion both entrance
animations are `none`, arrow translation and press transforms are disabled.
Do not animate month placeholders or add continuous background motion.

## Required verification

`tests/e2e/visual-refinement.spec.ts` checks en/zh-CN, 320/375/457/768/1024/1440,
long amounts, reveal geometry/privacy, real/zero/future chart values, label
bounds, 44px targets, bucket controls, landscape, reduced motion/focus and all
Web routed titles plus enlarged text. Run on built production resources.
Keep existing narrow gutter, entry, privacy, month-loading and offline tests.
Inspect rendered Chrome/Firefox screenshots; browser evidence does not establish
installed native device or spoken-reader acceptance.
