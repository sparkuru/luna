# Bug Analysis: cross-platform delivery boundaries (2026-09-05)

## 1. Root Cause Category

- **A/E — missing contract / implicit environment assumption:** Docker gave
  QEMU a soft/hard nofile limit of1,073,741,816. Startup scanned each descriptor;
  the watchdog deliberately crashed after35s. The APK had not been involved.
- **B/D — cross-layer / coverage gap:** WebView's network observer required
  `ACCESS_NETWORK_STATE`, absent from the generated manifest. WiFi was off but
  `navigator.onLine` stayed true; browser tests never crossed this native gate.
- **B/D — cancellation boundary:** disconnect guarded the sync service after
  awaiting merge, but a queued IDB transaction could already commit remote data.
- **B/D — native file boundary:** ordinary browser Blob downloads did not prove
  Android WebView wrote an exported file. Native completion must mean file close.
- **B/D — stale financial input:** transaction guards existed, but budget drafts
  lacked observed-head tokens; same-process atomicity alone cannot stop stale
  user intent from overwriting a newer budget.
- **B/C/D — settings scope and asynchronous state:** old desktop-only settings
  sync used a pre-GET local snapshot, had no disable-in-flight cancellation and
  recreated financial forms. A supported Web/Android client needs the same
  portable settings contract, not merely ledger sync.

## 2. Why Fixes Failed

KVM/software CPU, Vulkan, init and emulator-version changes did not alter the
descriptor scan. The discriminating evidence was the minidump thread stack,
watchdog disassembly and inherited limits. Setting nofile65536 produced an
actual guest boot in49.616s. This contradicts the earlier APK/KVM attribution.
Likewise, graph unit tests could not establish WebView permissions or downloads,
and same-process storage mocks could not establish browser cross-page atomicity.

## 3. Prevention Mechanisms

| Priority | Mechanism | Action | Status |
| --- | --- | --- | --- |
| P0 | Bounded environment | Compose nofile65536 plus real boot health check | DONE |
| P0 | Native contract | Network permission plus offline-before-first-launch smoke | DONE |
| P0 | Transaction cancellation | AbortSignal reaches IDB open/queue/put/commit; four regressions | DONE |
| P0 | Native durable result | SAF encrypted export, close before resolve, actual cancel/save/decrypt | DONE |
| P0 | Observed financial state | Budget expected heads, including inherited-month changes | DONE |
| P0 | Cross-end settings | Compatible portable crypto, latest-state merge, cancellation | DONE |

## 4. Systematic Expansion

Do not equate a queued operation with a committed effect. Apply the rule to
transactions, settings, file providers, migrations and status indicators.
Inspect environment inherited values before expanding privilege or disabling
safety. Keep native/runtime/provider gates separate, and retain failed evidence
instead of weakening tests. SAF pending ciphertext must not enter saved Activity
Bundles; process death requires retry.

## 5. Knowledge Capture

- Updated backend ledger-sync contract and frontend Android runtime contract.
- Added cross-platform thinking guide and cross-layer cancellation/observed-state
  reminders. Final validation record will name actual artifacts and gate results.
- Template synchronization: not applicable; this app has no
  `src/templates/markdown/spec` tree. Do not create a fictitious template mirror.
- Spec commit deferred to the final reviewed task checkpoint: the worktree mixes
  the user's pre-existing untracked app with this delivery work. Do not fabricate
  a spec-only clean baseline or commit unrelated files to satisfy a skill step.

Evidence: emulator dump/decoded stack under
`/tmp/luna-emulator-dump.FSJm1NfO`, actual boot logs and Android smoke JSON;
source regression tests and final check report. Temporary evidence is not a
durable backup; executable safeguards live in source/specs.
