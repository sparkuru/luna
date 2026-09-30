# Research: Android re-unlock returns pending through public HTTPS

- Query: Why does `server.unlock(passphrase)` fail after a local Android edit on a previously bound ledger, and what is the safest repair?
- Scope: mixed (source inspection plus reported public-route/WebView observations)
- Date: 2026-09-24

## Findings

### Observed failure and exact path

The validation operator reports that Android WebView received an encrypted-object GET response with `ETag: W/"9c26fd4eb59a67f6b04c870cb2b3d49f"`, then the corresponding conditional PUT repeatedly received HTTP 412. The same object's ETag was strong (`"9c26..."`) through direct loopback and a Node public HTTPS fetch using `Accept-Encoding: identity`. The restored synthetic ledger has no attachments. These observations support an intermediary changing the *validator strength* according to response compression; the specific intermediary setting remains unverified.

The account UI calls `server.unlock(password)` from `src/renderer/features/account.tsx:601-614`. `ServerHost.unlock()` checks the current profile's binding and passes that profile as `sourceProfileId` into `connectNow()` (`src/sync/server-host.ts:1094-1112`). On an ordinary unlock transition, `stop(false)` first clears the current profile's S3 ledger session (`src/sync/server-host.ts:115-137`, `:458-475`); the pre-migration `source-unconfirmed` guard at `:858-865` should therefore not fire under this sequence. The Chinese message “无法确认原同步目标...” is the mapping for `server-pending` (`src/renderer/features/server-i18n.ts:199`, `:222-245`). `server-source-unconfirmed` is not present in that mapping and would show the generic unavailable message. Capture the raw error to distinguish them in future reports.

`HttpLedgerObjectStore.get()` returns the HTTP ETag verbatim (`src/sync/http-object-store.ts:131-150`); `put()` sends that value as `If-Match` (`:151-182`). The server sends its stored strong object ETag on GET (`src/server/app.ts:893-923`) and checks the PUT precondition against the stored ETag (`src/server/db/operations.ts:722-741`). A weak `If-Match` therefore yields 412. The client classifies 412 as a conflict (`src/sync/http-object-store.ts:185-192`); `LedgerSyncSession.syncNow()` retries four times, then returns `pending` (`src/sync/ledger-service.ts:208-212`, `:279-345`). `connectNow()` converts any non-`synced` initial result into `server-pending` (`src/sync/server-host.ts:981-999`). Since `connected` means a live ledger session (`src/sync/server-host.ts:670-699`), failed unlock leaves the account and local bound profile visible while sync is disabled in the UI (`src/renderer/features/account.tsx:630-644`). The new local transaction remains in the local profile; this failure does not prove it reached the server.

This is a real public-route compatibility failure. The local ledger merge and CAS logic are protecting against a lost update; the UI wording misidentifies the failure as an old source confirmation problem. The code has no handling for weak ETags on this CAS path. Preferences use the same GET-ETag/PUT-If-Match pattern (`src/sync/http-object-store.ts:320-383`) and need the same validation.

### HTTP and edge behavior

[RFC 9110, If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1) requires strong ETag comparison for lost-update protection. A weak validator cannot simply be sent as a strong `If-Match`. [Cloudflare's ETag documentation](https://developers.cloudflare.com/cache/reference/etag-headers/) explicitly describes strong-to-weak ETag conversion when it transforms compression. [Cloudflare Compression Rules](https://developers.cloudflare.com/rules/compression-rules/settings/) can disable compression for matched requests; its strong-ETag option has conditions and still permits weak conversion in some cases. [Cloudflare's cache-control documentation](https://developers.cloudflare.com/cache/concepts/cache-control/) describes `no-transform` as preventing payload transformation. Luna currently sets `Cache-Control: no-store` in `src/server/app.ts:129-140`; that alone does not express `no-transform`.

### Safest reproduction and repair

1. On a disposable ledger, record the GET object response ETag, `Content-Encoding`, `CF-Ray`/proxy headers, and the PUT `If-Match` plus status through the same Android WebView and public route. Compare with a direct-origin request for the same version. Do not expose the encrypted body, account token or passphrase in the report.
2. For the temporary public-route acceptance, configure the intermediary to preserve a strong ETag on encrypted-object GETs, or disable its response compression for these endpoints. Verify *in the WebView* that GET yields a strong ETag and the following conditional PUT succeeds. This is a deployment-level remedy; a Node fetch with a different `Accept-Encoding` is insufficient proof.
3. Product hardening: add `no-transform` to CAS object responses and test it through the actual edge. If an edge can still weaken ETags, give the client an explicit origin-issued strong CAS token in a dedicated response header or use the existing object-status JSON ETag with a version-consistency check before PUT. Update the ledger and preferences adapters, CORS exposure, and regression tests as needed. Reject a weak-only validator with a clear error instead of retrying the same guaranteed 412 four times.
4. Do **not** strip `W/` blindly or send `If-Match: *`: both would assert a condition the client has not proven and could permit a lost update. A status token workaround must prove the fetched ciphertext and strong token refer to the same object version, then keep the normal 412 retry behavior for genuine concurrent writes.

## Files Found

- `src/sync/server-host.ts` — unlock, migration guard, initial sync and status transitions.
- `src/sync/http-object-store.ts` — GET ETag and conditional PUT transport for ledger, attachment and preference objects.
- `src/sync/ledger-service.ts` — CAS conflict retry and pending result.
- `src/server/app.ts`, `src/server/db/operations.ts` — object HTTP response and server-side condition check.
- `src/renderer/features/account.tsx`, `src/renderer/features/server-i18n.ts` — unlock UI and translated error display.

## Related Specs

- `.trellis/spec/backend/ledger-sync-guidelines.md` — conditional graph sync, source confirmation and failure preservation.
- `.trellis/spec/backend/http-api-guidelines.md` — HTTP object CAS contract.
- `.trellis/spec/frontend/android-runtime.md` — physical WebView and real TLS are separate acceptance gates.

## Caveats / Not Found

- This research agent did not change code, proxy settings, device state or VPS state. Subsequent main-session WebView tracing confirmed `Content-Encoding: gzip`, weak GET ETag, the same weak value in four `If-Match` requests, and four HTTP 412 responses. The exact Cloudflare zone rule responsible was not inspected.
- The main session then deployed `Cache-Control: no-store, no-transform` on the isolated Web gateway. A WebView probe returned a strong ETag with no `Content-Encoding`; the previously blocked Android unlock succeeded, and a separate browser restored the Android-created transaction. The temporary public route and test stack were then removed. Full commands and cleanup evidence are in [validation.md](../validation.md).
