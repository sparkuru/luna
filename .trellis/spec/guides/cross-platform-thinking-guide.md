# Cross-Platform Thinking Guide

- Separate portable domain/crypto proof, actual network protocol proof, real
  provider proof and installed runtime proof. Which boundary did each test run?
- Before blaming an application for pre-boot failure, inspect the crashing
  process/thread, inherited resource limits, permissions and readiness signal.
  A working acceleration device does not imply emulator startup is healthy.
- Does a WebView provide the same behavior as a browser for connectivity,
  downloads, file pickers, secure origin and persistence? Verify the native
  permission/host integration; feature-detect OPFS on the actual WebView and
  verify an explicit native-only IndexedDB compatibility path when it is
  missing; do not replace a failing assertion with a mock.
- Does “success” mean a committed transaction/closed file, or only a scheduled
  operation? Test cancellation and the final durable boundary.
- Does a native callback retain large input in saved Activity state? Keep large
  payloads out of IPC state Bundles and make process-death retry explicit.
- When a native picker opens several provider streams before returning a
  result, is ownership explicit during validation? Keep uncommitted handles in
  a local collection, publish only after the full result is built, and close
  both local and published resources on every failure; clear temporary byte
  buffers in `finally` blocks. A successful single-file smoke does not prove
  the later-item failure path.
- Do not claim physical macOS/Windows/Android coverage from Linux Compose or
  desktop Chrome. Record the actual OS, image/WebView and artifact hash.
- Does an injected native Web API acquire the wrong receiver when stored on a
  class? Chrome rejects `holder.fetcher()` when fetcher is raw window.fetch,
  while Node fetch can appear to work. Call a captured standalone function (or
  deliberately bind the documented platform receiver), and test the real browser
  after wrapping transport for authentication/error handling. Passing Node HTTP
  tests does not establish WebIDL invocation compatibility.

## Async page transitions across surfaces

- When a route context changes, inspect both the data-isolation boundary and
  the rendered loading branch. Sanitizing a cached snapshot prevents stale
  financial data leakage, but it does not prevent a visible flash if the
  loading branch removes the ready page's hero, controls, summary, or panel.
- For an interactive page with route-scoped data, keep the same page-level
  geometry while the new snapshot is pending. Use static, non-financial
  placeholders; put status/error/retry in that frame; and avoid a shimmer
  animation when the reported defect is a layout flash.
- Prove the transition by delaying the real host read in a browser test. Assert
  the old sentinel record and aggregate are absent during the delay, the
  loading frame's major regions remain present at the same positions, and the
  new month's record appears after release. Exercise the narrow Web layout as
  well as the desktop layout when the CTA or fixed navigation is involved.
- If Web and native share the feature component, verify that host-specific
  controls remain separated: a Web page keeps one page-level record action,
  while native shortcuts and their semantics do not become Web loading DOM.

Executable contracts: [Android runtime](../frontend/android-runtime.md),
[Web host](../frontend/web-host-and-validation.md),
[ledger sync](../backend/ledger-sync-guidelines.md).
