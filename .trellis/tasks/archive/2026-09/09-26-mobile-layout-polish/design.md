# Mobile layout design

## Boundaries and presentation

Use shared React/TypeScript and existing CSS semantic tokens. Branch native phone presentation with the existing client-surface marker; keep Web shell and desktop Electron behavior compatible. No financial DTO or persistence changes.

For mobile, replace the repeated native header management rows with compact brand/current-ledger context and an existing settings action. Remove persistent sync state, login/unlock prompts and sync buttons from the primary shell; sync state belongs to `/settings/sync`. Preserve accessible navigation to ledger/account/sync management in settings; retain meaningful live action/error announcements. The fixed four-page navigation and center record action remain.

## Quiet copy and automatic sync

User addition: trim demonstration-like remarks and capability slogans. Audit primary-page copy at actual render sites rather than deleting locale keys indiscriminately. Remove the persistent happy-path offline-ready footer on Web/Android; retain underlying service-worker readiness dataset and real preparing/failure handling without leaving an empty footer-sized gap. Preserve actionable empty states, field validation and recovery/security information. Apply equivalent Chinese/English wording and visibility.

Automatic mode is already the settings default. `ServerHost` owns write-triggered scheduling and remote polling; `src/web/main.ts` owns connectivity/visibility triggers. Removing header UI or collapsing settings must not unmount or relocate that host lifecycle. Preserve explicitly chosen manual mode. No OS background service, keep-alive or credentials persistence change is needed. Prove background relative to the UI: the configured synthetic client must sync with the ledger page shown and the sync settings unmounted.

Implementation finding: `ServerHost.transition()` called `stop()` but did not restore its remote probe. Fix only the last transition's `finally` to call the existing guarded scheduler. The automatic regression must no longer call `checkRemoteNow()` after a remote upload; subscribe before writing, and wait for the real periodic pull. Dispose every synthetic fixture host so running timers cannot keep the test process alive.

`/settings/sync` remains the authoritative state/mode/recovery surface, exposing connection/unlock requirements, last result and manual retry. Homepage lacks persistent sync decorations. Keep actual financial conflict/error recovery distinct from routine sync success copy; do not silently discard conflicts to make the UI quiet.

Reorganize the mobile transaction presentation so category/date are above the calculator's tall section. Render one existing calculator implementation, with compact token-based spacing and 48px keys. Mobile amount uses the app calculator without opening another IME (inputMode none on that surface); it remains a labelled editable input, supports hardware input, and retains existing expression validation. Text fields still invoke the actual IME. Web retains its optional details calculator and three-column desktop fields; Electron retains desktop entry geometry.

Use a reachable mobile save action within the modal scroll context; a sticky action, if used, must reserve space and not hide details. Keep vh fallback and supported dvh override for dialog heights. Do not add a viewport listener unless actual IME evidence requires it.

## UI state contract

Preserve setup/loading/empty/ready/error branches, summary privacy, mutation-disabled controls, image staging protection, nested modal focus, draft retention and existing native BACK behavior. Keep visible labels and locale catalogs. Compact styling must not hide actionable errors or overflow long text.

## Design-system adaptation

Research: `research/ui-ux-pro-max.md`. Apply touch targets, safe-area spacing, content priority, accessible labels, semantic colors, and reduced motion. Reject generated horizontal journey, dark palette and remote font recommendations: the established product is a light finance ledger with local system fonts, Lucide and vertical scrolling. Do not migrate to React Native or change icon libraries.

## Compatibility and rollback

Presentation and production-status visibility changes only; existing automatic scheduling stays host-owned. Existing Android landscape regression at1098×578 and unsupported-dvh simulation remain useful. Review CSS specificity across mobile/Web portal selectors and adjust production offline tests to assert actual readiness/persistence rather than requiring visible success prose. Rollback consists of reverting only this task's presentation/test changes; no schema migration or device reset is needed. Rebuild `.lan` APK with the existing Docker JDK21 path; retain isolated package data across upgrades.

## Evidence boundaries

Phone baseline is the existing 2026-09-23 artifact. Final APK must be built from changed source and hashed. Native IME/BACK and restart evidence comes only from `192.168.9.11:44643`; browser mobile-marker tests prove shared rendering but not Capacitor/native behavior. All records are synthetic in `majo.im.luna.lan`.

Final target update: user supplied `192.168.9.11:34971` after the original port closed. Same device was verified and final checks used that serial; retain the original address only as baseline history.
