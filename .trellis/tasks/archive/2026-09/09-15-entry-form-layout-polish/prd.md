# 微调记账弹窗分类、计算器与图片控件布局

## Goal

Improve the entry dialog layout based on the latest visual review without
changing the category or calculator behavior.

## Background

The current dialog already uses a read-only category input plus a separate
picker button, but the input still looks editable. The calculator result is
shown as a full-width row above the keypad, and the upload card's three-column
layout leaves the action visually detached from the centered content on narrow
or wide dialog widths.

## In Scope

- Shared renderer transaction dialog markup and styles in
  `src/renderer/features/entry.tsx` and `src/renderer/styles.css`.
- Web-first browser validation of the changed dialog states and responsive
  geometry.

## Requirements

- The category field must be a read-only selection surface: remove the
  editable text input and keep only the category-picker button. The selected
  category name, or the existing empty placeholder, must remain visible in the
  same field area.
- The calculator's evaluated value must appear in the calculator header's
  upper-right area, like a calculator display. It must remain readable for
  normal, long, and repeating-decimal results without disturbing the keypad.
- The image-selection control must have balanced horizontal alignment: icon,
  copy, and the selection button should be vertically centered within the
  upload card, while retaining keyboard access and the existing file limits.

## Out of Scope

- Category catalog data, picker behavior, or transaction validation.
- Calculator parsing, arithmetic precision, or saved amount semantics.
- Image processing, attachment limits, native Android picker behavior, or
  persistence APIs.

## Key Decisions

- Keep the existing category picker trigger and selected-label display, but
  represent the field as a non-editable button-like surface instead of an
  `<input>`.
- Keep the calculator result in the DOM near the calculator heading and move
  it with CSS into a compact right-side display area; do not change the
  calculation state or keypad order.
- Preserve the upload card as one responsive component and solve alignment in
  CSS, including a stacked narrow-screen fallback rather than adding another
  upload control.

## Risks / Deferred Items

- The remaining visual question is subjective; focused browser checks can
  verify geometry and semantics, but packaged Electron visuals and assistive
  technology still need the project's normal human residual review.
- No open product decision remains for this scope.

## Acceptance Criteria

- [x] Category entry no longer accepts typing; clicking the visible field
  opens the existing category picker and keyboard focus remains usable.
- [x] Calculator output is rendered in the header's right-side display area,
  and existing calculation behavior/tests remain intact.
- [x] Image upload card content is visually centered and remains usable at the
  supported responsive widths.
- [x] Typecheck, web build, focused browser regression, and diff hygiene pass.

## Artifact Status

This is a lightweight task, so the converged `prd.md` is the sole planning
artifact. Implementation and check manifests contain the relevant project
specifications for the Trellis sub-agent workflow.
