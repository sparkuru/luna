# B independent root review — 2026-09-08

Main reviewed B's React shell/router, Query ownership, persistent shadcn Dialog
adapter, financial draft/heads and error semantics against approved artifacts
and frontend specs. A follow-up to the previous checker agent was rejected by
the orchestration thread limit; root performed the independent review directly
instead of treating that unavailable review slot as a user approval blocker.

## Findings and fixes

- Android hardware back lacked an application callback despite the approved
  route contract. Root added cancellable luna:navigate-back handling in the
  shell: category -> entry -> menu child -> menu -> home, leaving home unhandled
  for the native fallback. Browser regression proves ordering and draft retain.
  D owns the trusted-origin native callback and actual KEYCODE_BACK evidence.
- Root had already added recognized-route offline shell fallback; the new
  production test also proves API/missing assets never receive cached shell.
- Desktop/narrow visuals were compared with preserved baseline. Heading weight
  reset by Tailwind Preflight was corrected by B; layout/theme retained.
- Existing frontend specs describing vanilla DOM/no Query were updated to the
  implemented React, shadcn/Tailwind, Query and Router boundaries. C profile
  query keys and account integration remain a subsequent acceptance scope.

## Verification

- Root production web:build passed; log /tmp/luna-root-b-build.log.
- Complete production browser suite **64/64 passed**, both desktop and375px,
  with LUNA_TEST_PRODUCTION=1 and task preview4274. Log
  /tmp/luna-root-b-review.log; artifacts /tmp/luna-root-b-review.
- The full run includes original financial/crypto/privacy/storage/offline-update
  assertions plus committed-refresh failure, nested keyboard/CSP, validated
  route search, discard blocker, native-event ordering and offline deep links.
- Source remains uncommitted. C account/profile integration and D actual native
  packaging/keyboard/backup validation are not certified by this checkpoint.
