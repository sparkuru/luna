# Production SAH fixture correction — 2026-10-04

## Original failure and reproduction

The complete production suite finished with **326 passed, 2 failed, no skips**
in 9.8 minutes. Both failures were the SAH reload/backing-file case in
`tests/e2e/local-ledger-catalog.spec.ts`, desktop Chrome and Chrome 375×800.
At the original line 29, the expected workspace `SAH separate` became
`undefined` after the first reload. Original traces, screenshots and contexts
remain under `test-results/production-final/local-ledger-catalog-SAH-p-fcd5b-ile-inside-an-existing-pool-{chrome,chrome-narrow}/`.

The unmodified focused reproduction used:

```sh
./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/local-ledger-catalog.spec.ts -g 'SAH profiles' --workers=1 --reporter=list --output=test-results/sah-production-followup
```

Both cases failed identically. Artifacts remain in the separate output above.
No original output directory was overwritten.

## Verified cause

The fixture strips COOP/COEP from navigation responses to exercise actual
SQLite-WASM `opfs-sahpool` rather than the cross-origin-isolated OPFS VFS.
The production trace shows the first `/` response has no isolation headers,
but the later `/luna` and `/` responses again contain
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`.

The production Service Worker precaches the original HTML response and serves
it during reload, bypassing the page route's header rewrite. A runtime probe
added a `crossOriginIsolated === false` assertion immediately after the first
reload. It failed with **expected false, received true** after 1.0 seconds.
That diagnostic trace remains under
`test-results/sah-production-isolation-probe/`.

The unchanged Worker initialization selects regular `OpfsDb` when
`crossOriginIsolated` is true and otherwise selects `opfs-sahpool`. Changing
isolation midway through this fixture changed its storage backend. These
failures did not demonstrate a production SAH persistence defect.

## Minimal correction

Only the SAH case is inside a `non-isolated SAH storage` describe with
Playwright's `serviceWorkers: "block"` fixture. Embedded SAH hosts use bundled
assets without the production Web shell Worker; this explicit test boundary
keeps the non-isolated storage scenario coherent through reloads. The two
ordinary catalog tests retain their default production Worker behavior.

The test still runs the real compiled production application, real
SQLite-WASM, OPFS filesystem, profile catalog, switching and public host APIs.
No storage backend, existence scanner or missing-file check is stubbed. Every
original assertion remains: profile persistence after reload, actual deletion
of the matching `.opaque` backing file while its pool exists, unavailable
listing before/after rejected selection, and original active-profile retention.
The test now additionally asserts non-isolation after both reloads.

No product file changed. This is browser fixture evidence, not an additional
Android installation or production offline-shell assertion. Separate
production offline tests retain the real Service Worker.

## Checks

- `./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/local-ledger-catalog.spec.ts --workers=1 --reporter=list --output=test-results/sah-production-fixed`:
  **6/6 passed**, 13.5 seconds, no skips.
- `./hako npm run test:web -- tests/e2e/local-ledger-catalog.spec.ts --workers=1 --reporter=list --output=test-results/sah-dev-fixed`:
  **6/6 passed**, 20.6 seconds, no skips.
- `./hako npm run typecheck`: passed.
- `git diff --check`: passed.

The main session owns final complete-suite reconciliation and archive
eligibility. The earlier 326/2 result remains a failed historical run, not a
retroactively green suite.

Ignored trace artifacts contain synthetic fixtures and are not promoted into
tracked evidence. This record retains only sanitized states and asset paths.
