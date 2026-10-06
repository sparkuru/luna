# Revocation test ordering correction — 2026-10-06

## Scope and reproduced cause

V6 resumption changes only `tests/e2e/server-account.spec.ts` and this evidence.
The production application, authentication, timeouts, fixture server and build
are unchanged. Parent/reviewer preserved the original production account/offline
run: 8 passed, 2 failed. Both online complex variants exhausted their existing
120-second deadline while clicking an already removed `#server-sync-now`.
The real sessions-list 401 preceded that click by approximately 31ms on desktop
and 23ms on narrow Web. Source and trace diagnosis are recorded in
[resumption-check-20261006.md](resumption-check-20261006.md).

Account route entry starts a sessions query. A real 401 invalidates the current
account and removes its embedded sync controls. That is the expected security
outcome; clicking Sync afterward is an invalid ordering assumption. The current
reproduction already demonstrates failure, so another 120-second negative run
was not repeated.

## Correction and deterministic coverage

Both existing parameterized complex cases now register a response waiter before
the first browser revokes the second session and require the real DELETE to
return 204. Before navigating the second browser to Account, they register an
exact sessions-list GET waiter and require its real response to return 401.
They then assert signed-out state, cleared displayed identity and absence of
the sync control, without clicking that control. The existing renewed login,
local transaction, image bytes/restart, encrypted transfer, profile recovery
and production cold-offline assertions remain intact, as does the original
120-second timeout.

This exercises the early-401 path in the existing real-server flow; it adds no
mock, synthetic successful sign-out, catch around a failed click, arbitrary
sleep, extra mirror case, dependency or application behavior change. Network
fetches run page-side; the SharedWorker owns only the session vault, so the
Playwright page response waiters observe these requests directly.

The retained successful desktop-online trace confirms ordering: the 204 waiter
completed at monotonic 17,296.033ms; the 401 waiter was registered at
17,297.703ms before Account navigation and completed at 17,401.433ms. The
signed-out assertion started at 17,426.033ms, followed by identity/sync absence
checks and renewed login. Both asserted statuses came from the real fixture.

## Verification and artifacts

- `./hako npm run typecheck`: exit 0. Log:
  `/tmp/luna-revocation-typecheck-20261006.log`.
- `./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/server-account.spec.ts --grep 'real server login|production server copy' --project=chrome --project=chrome-narrow --workers=1 --reporter=list --output=.devhome/revocation-20261006/test-results --trace=on`:
  **4 passed, 0 failed/skipped**, 1.4 minutes. Desktop online/offline: 19.4/19.9s;
  narrow online/offline: 20.1/18.6s. Log:
  `/tmp/luna-revocation-browser-20261006.log`.
- `git diff --check -- tests/e2e/server-account.spec.ts`: passed.
- Success traces copied to `/tmp/luna-revocation-20261006/test-results/`;
  ignored container intermediate `.devhome/revocation-20261006/test-results/`
  retained. List reporter and isolated output preserve previous root reports
  and the original failures under `/tmp/luna-visual-resumption-20261006/`.

Normal sandbox execution could not connect to the Docker socket; scoped hako
escalation ran the checks successfully. Reused the parent's current production
build; no preview lifecycle, published host port or real data was changed.

For this test-only correction, human review is not required: the changed
ordering and final state are observed automatically in both supported browser
projects. Independent revised account/offline checking remains parent/reviewer
owned. These four passes do not claim a fresh full-suite, CI, native device,
remote deployment or long-term operation result. No commit/archive/status
change was performed by this implementer.
