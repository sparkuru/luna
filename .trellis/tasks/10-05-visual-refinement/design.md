# Design decisions

## Direction

A quiet personal ledger with a lunar signature: indigo moon symbol, deep ink typography, white surfaces, fine ruled dividers, generous page rhythm and tabular financial figures. Preserve the Web sidebar and single record action; retain native mobile density.

Share a locally authored SVG moon mark between existing brand anchors. Reduce redundant row boxes while retaining visible actions/focus. Normalize Web titles and clarify desktop summary label/value hierarchy without changing reveal geometry. Leave zero/future chart tracks transparent while preserving real progress values, bucket names, selection, text alternatives and picker controls. Narrow statistics controls occupy two balanced rows instead of three isolated blocks.

Motion tokens: 160ms feedback, 240ms soft ease-out modal entrance; opacity/transform only. Animate actual dialog opening, never month loading placeholders or continuous decoration. Reduced motion removes entrance displacement and effectively disables transitions. Keep financial calculations and public host API unchanged.

## Research and adaptation

UUPM design-system search executed for `offline personal finance ledger calm editorial indigo precise spacious`; raw output remains temporary `/tmp/luna-design-system.txt` because retention licensing is unresolved. Its dark-only OLED, remote Lora/Raleway and landing-page recommendations conflict with the existing offline/light application and are rejected. Adopt restrained blue/green semantics, clear CTA, contrast and feedback. UX search on animation/accessibility/z-index/loading reinforces bounded feedback without continuous decoration.

Webby official judging criteria (`https://www.webbyawards.com/judging-criteria/`) include visual design, functionality, navigation and overall experience. Awards are quality references, not a promise of winning. Decisions here are project-authored adaptations.

## States and responsive behavior

Preserve setup, loading, empty, filtered-empty, error/retry, disabled/pending, success, dirty drafts and hidden/revealed summary states. Apply styles to existing semantic controls; do not recreate data/state. Desktop uses consistent headings and generous gutters; narrow Web retains bottom navigation and targets. Explicit native mobile retains compact geometry and five navigation slots. Verify 320/375/457, 768, 1024, 1440 and landscape, en/zh-CN, long amounts and reduced motion. Existing semantic tests cover focus, errors, drafts/privacy; new craft checks cover changed geometry and chart treatment.

## Enlarged text refinement

Normal narrow statistics retains its two-row toolbar. Content-balanced columns,
14px base labels and label-bound assertions prevent English overlap without
reducing 44px targets. At a 200% root font, relative inline-size container
thresholds reflow toolbar groups, summary cards and navigation into full rows.
Use physical narrow gutters and month-arrow widths to leave room for growing
text; allow long transaction amounts to wrap. These refinements follow observed
English overflow and excessive word breaks, while preserving normal layout.

## Rollback and risks

Renderer-only reversible diff, no data migration or remote effects. Risks: CSS cascade, CSP-safe SVG, progress styling and modal focus during animation. Inspect computed styles, pixels and existing regressions. Native device rendering remains a separate evidence boundary.
