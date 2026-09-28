# Research: screenshot feedback diagnosis

- Query: Diagnose the three screenshots against the active entry-date task and related mobile statistics layout: visible date order, close-control height, and statistics page gutter.
- Scope: internal
- Date: 2026-09-28

## Findings

### 1. The screenshots most likely show the responsive Web surface, not the Capacitor mobile surface

At initial diagnosis, the PRD limited the fixed `YYYY/MM/DD` projection to native mobile, which did not cover the likely browser-hosted screenshot. After confirming the browser chrome and inset dialog, the PRD was expanded to include Web viewports below 768px while retaining existing desktop Web/Electron date behavior. The Web entry sets `data-client-surface="mobile"` only when `Capacitor.isNativePlatform()` is true; browser-hosted Web sets `web` (`src/web/main.ts:23`). `getClientSurface()` reads that root marker and defaults to Electron when none was set (`src/renderer/client-surface.ts:18-22`). `TransactionDialog` passes `mobileDisplayValue` for native mobile and Web; CSS shows it only on native mobile or narrow Web (`src/renderer/features/entry.tsx:834-845`, `src/renderer/styles.css:4668,4972-5002`). The desktop Web projection remains hidden and Electron does not render it.

The screenshot geometry supports that interpretation: the entry dialog is inset from the viewport and has rounded corners, matching the narrow Web dialog rule (`src/renderer/styles.css:3483-3485`); native mobile instead makes that dialog full-bleed, with zero side inset and no border radius (`src/renderer/styles.css:4737`). The screenshot also includes browser navigation chrome below the app. This is strong visual evidence of a browser-hosted page, though the definitive check is the live `document.documentElement.dataset.clientSurface` value.

The user confirmed the narrow-Web change by supplying the screenshot feedback. Narrow-Web Playwright screenshots and viewport assertions now cover both locales. The actual AVD smoke reports the root surface marker and runs against the rebuilt APK.

### 2. Existing checks do not prove the projection is what Android pixels display

The first browser tests and AVD run asserted DOM text but did not prove which glyphs were rendered. The final review found the native projection still had `display: none`; only the Web narrow rule showed it. This meant the original AVD screenshot could have been displaying the Android input's locale format. The implementation now explicitly shows the projection on native mobile and asserts it is visible, positioned above the input, and has non-zero geometry (`src/renderer/styles.css:4668`, `scripts/smoke-android.ts:62-82`).

The native smoke now captures the Android WebView compositor after the system picker changes the date, in addition to asserting the `mobile` surface marker and computed style values. On the rebuilt APK, the smoke reported projection `display: flex`, z-index 2 above input z-index 1, and a 328×48 CSS-pixel projection over the 380×48 input. The reviewed screenshot shows `2026/09/29`; save and force-stop/restart readback preserve `2026-09-29`.

### 3. Screenshot 2 does not establish a box-height bug by itself

The icon-only close button keeps a localized accessible name and hides the decorative Lucide X from accessibility APIs. Both narrow Web and native mobile now use a 48×48px target centered vertically with the title. Browser regression tests measure the button and title boxes, confirm icon-only text, and exercise click/Escape draft behavior.

### 4. The statistics screenshot follows a Web rule that removes its page inset

The related `09-26-mobile-statistics-budget` PRD and design are relevant: the design inherits a 16px mobile page gutter (`.trellis/tasks/09-26-mobile-experience-redesign/design.md:21-24`), and the second-round task requires the compact statistics view across narrow phone widths (`.trellis/tasks/09-26-mobile-statistics-budget/prd.md:6-21`). Native mobile currently gives `.statistics-page` an additional `padding-inline:16px` (`src/renderer/styles.css:4801-4806`) on top of the app shell's 16px inset (`src/renderer/styles.css:4684`), yielding about 32 CSS px total from viewport edge to page content.

The Web mobile breakpoint explicitly reset `.client-surface-web .statistics-page` to `padding:0` (`src/renderer/styles.css:3309-3310`); its `#main-content` rule only added top and bottom padding. The final narrow-Web rule restores 24px inline padding after generic mobile CSS, applying the same viewport gutter to heading, toolbar, grid and cards. Tests measure aligned gutters and no horizontal overflow at 320, 375 and 457px in both locales. Native mobile retains its separate 16px statistics padding.

## Files found

- `.trellis/tasks/09-28-entry-date-close-empty-month/prd.md` — active requirements and Web/Electron scope boundary.
- `.trellis/tasks/09-26-mobile-statistics-budget/prd.md` — related statistics and responsive acceptance criteria.
- `.trellis/tasks/09-26-mobile-statistics-budget/design.md` — responsibilities and inherited mobile design decisions.
- `.trellis/tasks/09-26-mobile-experience-redesign/design.md` — shared 16px page gutter contract.
- `src/web/main.ts` — browser versus native Capacitor surface selection.
- `src/renderer/client-surface.ts` — root presentation marker reader/default.
- `src/renderer/features/entry.tsx` — surface-gated date projection and icon-only close markup.
- `src/renderer/components/form.tsx` — native date input and optional visible projection DOM.
- `src/renderer/styles.css` — Web/native dialog geometry, mobile date overlay, close target sizing, app-shell/statistics page gutters.
- `src/renderer/components/ui/button.tsx` — base shadcn button size/touch-height classes.
- `tests/e2e/android-entry-layout.spec.ts` — Chromium mobile-surface emulation and DOM-based assertions.
- `scripts/smoke-android.ts` — actual AVD native date dialog selection and DOM/persistence checks.
- `.trellis/spec/frontend/android-runtime.md` — native Android runtime and smoke constraints.
- `.trellis/spec/frontend/component-guidelines.md` — entry/date/accessibility/component contracts.

## Code patterns

- Browser and native presentation are selected explicitly by `Capacitor.isNativePlatform()`; narrow viewport size alone does not switch a browser to the native mobile surface (`src/web/main.ts:23`, `src/renderer/client-surface.ts:14-22`).
- The Web responsive transaction dialog retains its viewport margin while the native dialog is full-bleed (`src/renderer/styles.css:3483-3485,4737`).
- The date projection is accessibility-hidden; its text comes from the ISO draft string using delimiter replacement, while the real date input keeps the canonical value (`src/renderer/features/entry.tsx:834-845`, `src/renderer/components/form.tsx:56-62`). CSS exposes it for native mobile and Web widths below 768px; wide Web/Electron retain native date rendering.
- Android picker validation uses UIAutomator/native taps, computed projection/input geometry and z-index assertions, and a WebView compositor screenshot (`scripts/smoke-android.ts:17-85`).
- Native statistics has both app-shell and statistics-local horizontal padding; Web mobile CSS strips the statistics-local padding (`src/renderer/styles.css:152-156,3275-3278,3309-3310,4684,4801-4806`).

## External references

- None; this diagnosis uses repository source, task records, specs, and the supplied screenshots.

## Related specs

- `.trellis/spec/frontend/android-runtime.md` — native surface smoke and Android runtime behavior.
- `.trellis/spec/frontend/component-guidelines.md` — localized icon-only close and mobile entry composition.

## Caveats / Not Found

- No live DOM session was available for the user's original screenshot, so its surface remains inferred from browser chrome and the rounded, inset Web dialog. The fix covers both likely narrow Web and native Android surfaces.
- No physical handset was used; Android evidence is from the disposable Android 36 AVD.
- The intended pair in screenshot 2's height annotation is not explicit. The selected resolution standardizes the X target to 48×48px and aligns its center with the heading; both dimensions are asserted in browser tests.

## Root-cause and prevention review

### Root cause

- **Primary: test coverage gap.** Earlier checks asserted projection text and ISO input values, but did not assert that the projection was visible or inspect the Android WebView pixels.
- **Contributing: cross-platform contract gap.** Host (`mobile` vs `web`) and viewport (narrow vs desktop) are separate axes. The first fix handled the native host while the supplied screenshots most likely came from narrow Web.
- **Contributing: stale-artifact assumption.** An AVD run initially installed an APK built before the latest CSS; its computed stacking order was not evidence about current source.

### Why the earlier checks failed

1. Native-only scope did not affect the likely Web screenshot.
2. DOM text existed while native CSS still hid the projection; text assertions therefore passed without proving visible output.
3. The first recheck used a stale APK, so its layer values contradicted the corrected source until the isolated APK was rebuilt.

### Prevention mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Test coverage | Assert visible projection, `display`, non-zero geometry and z-index order; capture the actual AVD compositor after picker selection. | Done |
| P0 | Cross-platform contract | Cover native mobile, narrow Web, and wide Web/Electron separately; scope responsive selectors by both host and breakpoint. | Done |
| P1 | Artifact provenance | Rebuild the isolated APK from current source before native screenshot checks; record the surface marker and style values. | Done |

### Systematic expansion

Any UI that paints a value over a native input needs pixel-level verification on the actual installed WebView; React text and browser-only CSS tests cannot establish native control paint order. The cross-platform thinking guide and frontend component/Android specs now record this rule. This repository has no `src/templates/markdown/spec/` mirror to synchronize.
