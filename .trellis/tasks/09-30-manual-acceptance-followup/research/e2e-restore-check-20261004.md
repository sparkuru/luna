# Server-account restore regression — 2026-10-04

## Reproduction and cause

The complete development Web run failed the desktop and narrow Chrome
server-account recovery cases at the original line 424: selecting `legacy-local` after logout and
`context.setOffline(true)` returned no readable host status. The account,
encrypted copy, second-client restore, attachment reload and session-revocation
steps had already succeeded. A focused unmodified reproduction failed at the
same assertion after 17.0 seconds.

The retained trace shows new requests for
`/sqlite-wasm.worker.ts?worker_file&type=module` aborting while the browser is
offline. The original local profile has not been opened since the page reload,
so selecting it creates a new Worker. Development deliberately registers no
Service Worker and cannot cold-load those server-hosted assets offline. This
failure does not establish corrupted profile data or failed remote restore.

An initial command placed `LUNA_TEST_PRODUCTION=1` outside `./hako`. The wrapper
does not forward that variable into Docker: the trace still loaded the `.ts`
development worker, and the same failure remained. This was a harness mistake,
not production evidence. With the variable passed inside the container using
`./hako env LUNA_TEST_PRODUCTION=1 ...`, the exact original test passed
Chrome 1/1 (10.7 seconds).

## Failure artifacts

Original complete-run failure remains under
`test-results/server-account-real-server-2512d-nd-offline-profile-recovery-chrome/`.
The equivalent narrow original failure remains in the matching `chrome-narrow`
directory. The full unmodified development run finished with **314 passed,
2 failed, 8 production-only skips** in 13.8 minutes; both failures were this
5000ms profile-status timeout, not separate product defects.
Focused unmodified development failure, screenshot, context and trace remain
under `test-results/restore-followup/`. The misconfigured attempted-production
failure remains under `test-results/restore-followup-production/`. Correctly
configured original production success used
`test-results/restore-followup-actual-production/`.

Transient traces can contain synthetic sessions, passwords and financial
fixtures. They stay ignored and are not copied into tracked evidence. This
record includes only sanitized failure stages and asset paths.

## Correction and checks

`tests/e2e/server-account.spec.ts` now registers an always-run online
local-profile recovery case and a separate production-only cold offline profile
recovery case. Both retain all original graph/image/profile assertions. The
offline case additionally waits for the precached shell and its controlling
Service Worker, then asserts `navigator.onLine === false`. The earlier
second-client offline login-disable assertion remains in both variants.
Development explicitly skips the cold offline variant because it has no
precache; production executes it. No product code or failure assertion changed.

The edit was briefly reversed while the original complete development run was
still active and then reapplied after completion. The focused production worker
had collected the proposed definitions before reversal and completed all six
cases across both projects successfully. The final reapplied patch is the same
one that was tested in production.

- `./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/server-account.spec.ts --workers=1 --reporter=list --output=test-results/restore-followup-production-fixed`:
  **6/6 passed**, 1.2 minutes. Includes automatic online/foreground hooks,
  general login/copy/restore and cold offline original-profile recovery for
  desktop and 375×800 Chrome.
- `./hako npm run typecheck`: passed.
- `git diff --check`: passed.
- `./hako npm run test:web -- tests/e2e/server-account.spec.ts --workers=1 --reporter=list --output=test-results/restore-followup-dev-fixed`:
  **4 passed, 2 production-only skips**, 47.3 seconds. Both projects retain the
  general restore, profile-isolation and active-host automatic-sync checks.

The main session owns the complete final production suite and archive decision;
the original complete development failures are preserved as diagnostic evidence.

Validation scope is Chrome desktop and Chrome 375×800, using a real loopback
Fastify/SQLite API and a controlled in-memory ciphertext store. It is not new
physical-device, real-provider, or durable-public-HTTPS acceptance evidence.
