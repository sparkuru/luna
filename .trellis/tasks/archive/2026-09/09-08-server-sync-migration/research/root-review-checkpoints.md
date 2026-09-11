# C root review checkpoints

## Independently observed

- B accepted after root production build/typecheck and64/64 browser tests.
  C renderer integration delegated to implement_ui only after that gate.
- Root existing regression command ./hako npm test passed146/146 at the C
  foundation checkpoint; log /tmp/luna-root-regression.log. Final C additions
  and integration tests still need their own acceptance.
- Root inspected shared/server-api.ts, ServerHost, BrowserProfiles and
  NativeProfiles. Main has requested deterministic regressions for the items
  below; an implementation report is not yet independent final acceptance.

## Findings sent to implementer

1. Serialize login/logout/select/connect transitions; cancel previous generation,
   block new old-profile dispatch and drain accepted local writes before swap.
   Preserve old-profile commits without misreporting rollback.
2. Assert original session at each activation await; status projection must not
   combine an old profile with a new account/generation after asynchronous reads.
3. Cached repository open is not reopen verification: read durable state through
   a fresh IDB transaction or separate SQLite connection. Close new SQLite
   profiles at native shutdown as well as the original store.
4. Direct localStorage getter may throw at construction; restore safe access.
5. S3 sync methods return failure status without throwing. Unless the user
   explicitly allows local-only migration, reject an unconfirmed old S3 sync.
6. Runtime-check server API version and login token/safe identity before storing
   a session; generated TypeScript types do not validate arbitrary HTTP JSON.
7. Profile picker should use safe workspace display names and origin, not raw
   implementation IDs as product labels. Credentials remain memory-only.

The implementer reports transition queue, source freeze/check and independent
durable reads are added. Final source and deterministic tests will be reviewed
before marking C accepted. D native/key-back and restore evidence remains
separate from this host foundation review.

## Final acceptance

C is accepted after the independent checker findings and fixes documented in
[review.md](review.md). This includes preserving S3 configuration until an
explicit migration decision, returning the actual receipt of a committed local
write when a concurrent request revokes the session, and invoking injected
browser fetch without a custom receiver. Root reproduced the receiver failure
in actual Chrome before the fix; Node-only transport mocks had not exposed it.

Final production browser run passed 68/68, including both viewport projects and
real account integration (`/tmp/luna-c-final.log`). Root reran unit tests 150/150
(`/tmp/luna-final-unit.log`), generated-client reproducibility
(`/tmp/luna-final-api-check.log`) and SDK contracts 4/4
(`/tmp/luna-final-contracts.log`). The independent real-PostgreSQL sync run
passed 5/5 without skips. Strict typecheck and production build passed.
Native package validation remains D's separate gate.
