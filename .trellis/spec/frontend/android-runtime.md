# Android Runtime Contract

## 1. Scope / Trigger

Changes to Capacitor configuration, Android permissions/plugins, embedded Web
assets, or the isolated emulator must follow this contract. Browser success
does not prove WebView networking, file export, or installed APK persistence.

## 2. Signatures

```text
docker compose -f compose.android.yaml build android-apk
docker compose -f compose.android.yaml run --rm android-apk
LUNA_ANDROID_APPLICATION_SUFFIX=.lan docker compose -f compose.android.yaml build android-apk
LUNA_ANDROID_APPLICATION_SUFFIX=.lan docker compose -f compose.android.yaml run --rm android-apk
docker compose -f compose.android.yaml --profile smoke up -d --build android-emulator
docker compose -f compose.android.yaml --profile smoke run --rm android-smoke
```

App ID `majo.im.luna`; artifact `artifacts/android/luna-debug.apk` plus SHA256
sidecar. API24 minimum, compile/target36. Native-only optional API:
`saveLedgerBackup(password: string): Promise<void>`. The Web host encrypts via
the existing export API; `LedgerBackup.save({json})` receives ciphertext only.
For a non-destructive physical-device check when another signature already owns
the standard package, set `LUNA_ANDROID_APPLICATION_SUFFIX=.lan`; the export is
`artifacts/android/luna-lan-debug.apk` with package `majo.im.luna.lan`.

## 3. Contracts

- All Web assets ship in the APK. Origin is `https://localhost`; release builds
  do not permit remote cleartext traffic or mixed content. A debug build may
  connect to an explicitly entered RFC1918 IPv4 API over HTTP for trusted-LAN
  development; its debug-only bundled CSP permits HTTP connections, the client
  still rejects public/hostname insecure endpoints, the server must opt in with
  `LUNA_ALLOW_INSECURE_LAN=true`, and the API origin remains `https://localhost`.
  The bundled SQLite-WASM Worker uses OPFS `opfs-sahpool` when the WebView
  exposes the required APIs, which keeps durable SQLite storage available even
  though the Capacitor virtual origin is not cross-origin isolated. Older
  Android WebViews without `navigator.storage.getDirectory` use the explicit
  IndexedDB compatibility adapter on the secure bundled origin; this fallback
  is native-only and ordinary HTTP Web hosts still fail closed.
- Shared Web code must use `assertNotAborted(signal)` from
  `src/shared/abort.ts` instead of calling `AbortSignal.throwIfAborted()`;
  older Android WebViews do not implement that method. The helper preserves an
  abort reason when present and throws a compatible cancellation error otherwise.
- The Android 11 WebView on AIO-3568J reports
  `CSS.supports("height: 100dvh") === false`. Fixed scrollable dialogs need a
  `max-height: calc(100vh - 32px)` baseline, with
  `max-height: calc(100dvh - 32px)` only inside a separate
  `@supports (height: 100dvh)` rule. A lone `dvh` declaration is discarded on
  that WebView, leaving `max-height: none` and placing editor controls outside
  its scrollable viewport. Mobile entry uses full-height `100vh`/supported
  `100dvh`, with internally scrolling `#transaction-form` and a separate save
  footer. It stacks `.quick-core-fields` in one column before its single keypad;
  amount/expression/result share one amount control, not a second LCD. Mobile amount
  input uses `inputMode="none"`: automatic focus must not open a second OS
  number keyboard. Hardware arithmetic retains the evaluator path; category
  search, merchant and notes retain real text IME. Amount/category/date/type,
  calculator keys and save/close targets are at least 48px. Web keeps its optional
  calculator and desktop three-column core form; Electron keeps its own layout.
- Request `INTERNET` and `ACCESS_NETWORK_STATE`. The latter enables WebView's
  network-change observer, including `navigator.onLine`; do not fake this flag
  in tests. Android backup is disabled in the manifest; no storage permission
  is needed for user-selected Storage Access Framework documents.
- Emulator is the disposable `luna-smoke` AVD, Linux/KVM with only `/dev/kvm`
  delegated; no privileged container or host USB/ADB access. Host ADB listener
  is loopback5038. Set Compose `ulimits.nofile.soft/hard` to65536: inherited
  billion-descriptor limits made QEMU scan descriptors until its startup
  watchdog crashed, despite working KVM.
- Smoke refuses physical devices and other AVDs before install/reset. Disable
  WiFi/data and wait for `dumpsys connectivity` to show no default network
  before first launch; restore test radios in `finally`.
- Native export launches `ACTION_CREATE_DOCUMENT` on the UI thread and writes
  the chosen `content:` URI on the bridge worker. Validate bounded encrypted
  envelope (12MiB max); no arbitrary path/URI argument, plaintext or password
  crosses this plugin. Resolve only after write/flush/close succeed.
- Native image input launches `ACTION_OPEN_DOCUMENT` with the supported image
  MIME allowlist and multiple selection. Keep each `content:` URI inside the
  plugin; JavaScript receives only short-lived opaque handles and bounded
  receipts/chunks (20MiB source and 1MiB bridge-chunk limits), and a cancelled
  or failed selection releases every handle. Build the complete uncommitted
  handle set before publishing it to the shared map; if a later URI or metadata
  check fails, close every stream in that local set as well as every published
  handle. Zero temporary chunk buffers from a `finally` block on both success
  and provider failure. No storage permission or raw path may be added to make
  this picker work.
- Remove large ciphertext from `PluginCall` data before opening the picker:
  Capacitor saves pending call data into an Activity Bundle. Keep pending bytes
  in memory, single-flight; clear them after cancel/success/failure. Process
  death means retry, never recovered-success without bytes. A failed provider
  write may leave an incomplete document; report failure honestly.
- Debug signing is local-cache-owned, not a release identity. Back up before
  uninstall/clearing data. Changed signing keys require reinstall; never commit
  signing keys or imply store readiness.
- Hardware back enters the shared router through one fixed cancellable
  `luna:navigate-back` CustomEvent. MainActivity's lifecycle-owned AndroidX
  callback evaluates it only in the bundled `https://localhost` WebView.
  `preventDefault()` means handled; otherwise temporarily disable that callback
  and invoke the native dispatcher. Never expose arbitrary JavaScript execution
  or consume home back without a renderer handler. Since dispatch targets
  `window`, capture does not establish listener priority on that same target.
  Shell routing defers to an actual visible dialog; its owner consumes the
  event: image → its detail,
  detail/filter → ledger, category → entry, entry → retained draft. Then route
  child → parent, main route → ledger, and unhandled home → native fallback.
  Consumers check `defaultPrevented`; hidden/inert/aria-hidden, closed,
  visibility-hidden and zero-rect persistent portals are not active. Category
  usage BACK closes that dialog and restores its opener before any route change.
- Mobile period inputs retain the real native month/date control beneath an
  aria-hidden UTC/localized centered display. Android can ignore desktop
  datetime pseudo-element alignment. The interactive input remains labelled,
  focusable and at least48px; actual center and indicator touches must open the
  system picker, whose BACK cancellation leaves the period unchanged. An input
  frame center alone is not proof that its visible text is centered.
- The mobile transaction date keeps a labelled, focusable native
  `input[type="date"]` with its ISO value and native picker. Its visible text
  uses a separate aria-hidden `YYYY/MM/DD` projection so the order stays fixed
  across Android WebView locale settings; the calendar indicator and native
  pointer/keyboard path remain available. The isolated Android smoke opens the
  system date dialog, selects a date, verifies the projected text and ISO value,
  then checks saved and restarted data. Narrow Web viewports below 768px use the
  same visible projection while retaining browser date input behavior. Desktop
  Web and Electron keep their native date display. A browser `showPicker()` stub
  verifies only activation wiring, not the system dialog.
- The three mobile period headers use matching 48px previous/next arrows.
  Statistics moves the selected month, week or year through existing Router
  handlers. Native QA must click those arrows on the installed app and inspect
  the resulting input/route, alongside glyph alignment and picker cancellation;
  desktop viewport assertions alone do not prove Android touch behavior.

## 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| No network on first installed launch | embedded UI usable, secure context, offline writes commit |
| Native WebView without OPFS | secure `https://localhost` origin uses IndexedDB compatibility storage and offline writes commit |
| Native WebView without `100dvh` | dialog uses the `100vh` height limit and its own scrolling reaches category, date and save controls |
| Process force-stop/relaunch | Selected SQLite-WASM/OPFS or IndexedDB records and privacy default restored |
| `AbortSignal.throwIfAborted` missing | Cancellation checks do not raise a compatibility `TypeError` |
| `ACCESS_NETWORK_STATE` missing | fail network-state smoke; no navigator override |
| Emulator exit139 before guest boot | inspect crash thread and limits; do not infer APK failure |
| SAF cancel | `ledger-backup-cancelled`; no success message |
| Invalid envelope/no bytes/provider failure | `ledger-backup-failed`; local ledger retained |
| Native save success | actual destination file closes, Node decrypts same ledger |
| Native image selection | disposable Android DocumentsUI selects a supported image; renderer validates, stages and saves it, and a relaunch reads the same normalized bytes |
| Hardware back with open IME | Android dismisses IME first; keep app dialog |
| Mobile amount initially focused | Application calculator visible, OS IME closed, category/date precede calculator |
| Notes or category search focused | Real OS text IME available; amount suppression must not leak to text controls |
| Hardware back with nested editor | Close category first, then hide entry while retaining its draft |
| Hardware back with image/detail/filter | Close only the top visible layer; keep app and underlying parent |
| Hardware back at home | Native fallback; reopen retains committed data |

## 5. Good / Base / Bad Cases

Good: install the newly hashed APK, disconnect before launch, create an expense,
restart and recover it; verify a real SAF file. Base: debug APK is usable on a
tested emulator while physical-device coverage is explicitly unclaimed. Bad:
calling Blob download success on Android without proving a saved file, treating
Chrome E2E as APK evidence, or bypassing TLS to make a storage fixture pass.

## 6. Tests Required

`scripts/smoke-android.ts` exercises actual installed WebView, offline startup,
CRUD/restart, summary privacy, viewport and no Service Worker. On a WebView
without OPFS, the installed APK must additionally prove the IndexedDB fallback
by reading settings/snapshot and starting without a global error. Shared abort
compatibility is covered by `src/shared/abort.test.ts`. SDK/WebCrypto
interoperability uses a DevTools-contained HTTPS fixture; label it as protocol
coverage, not real TLS/provider connectivity. MinIO is a separate real-provider
gate. Native save tests must cancel then retry, observe completion, read only
the exact synthetic saved file and decrypt it in Node. The native image-picker
smoke must place only a synthetic fixture in the disposable AVD, use the real
DocumentsUI flow, assert normalized bytes after offline save/relaunch, and
  clean the fixture and its media-provider row. The provider failure path must
  also be covered with a test double or integration fixture that rejects a later
  multi-selection item and proves earlier opened streams are closed. Capture
  viewport images with
`AndroidDevice.screenshot`: the WebView compositor can detach a CDP screenshot
while the IME settles.
Back assertions must send actual `input keyevent KEYCODE_BACK` on the verified
emulator and inspect real IME state. A DOM Escape event or desktop hash-router
test is not evidence of native dispatch. Verify menu parents, retained drafts
after closing/reopening, and native Cancel/OK when changing entry type would
discard a draft. BACK itself does not discard. Closed draft portals remain in
the DOM: assert visibility, not element removal. Keep a passive Playwright dialog
listener while tapping native confirmation buttons to prevent its default JS
dialog dismissal. After proving native home fallback, force-stop/relaunch the
disposable app before subsequent checks: AndroidWebView caches a closed Page
when Activity recreation keeps the same PID. Reopened committed records must
still be present; never clear data at this boundary.
For dialog layout, a current Chrome check alone cannot prove the older WebView
fallback. In a browser regression test, remove the matching `100dvh`
`@supports` CSSOM rule, then assert the `100vh` limit remains, the dialog is
internally scrollable, and lower controls are reachable. Confirm the result on
the installed Android WebView separately.
`tests/e2e/android-entry-layout.spec.ts` checks 320/375/457px, both locales,
hardware expression evaluation, nested focus and draft preservation. Its native
presentation simulation does not prove real IME state. A physical-device check
must verify initial amount IME absence, text IME, actual BACK order and committed
record readback after force-stop/relaunch without clearing application data.

## 7. Wrong vs Correct

Wrong: call `signal.throwIfAborted()` directly in code shipped to Android.
Correct: call `assertNotAborted(signal)` so old WebViews retain cancellation
semantics. Likewise, `anchor.click(); announce('saved')` is wrong on Android;
await encryption,
await the native picker/write callback, then announce saved; cancellation and
write errors remain distinct. Likewise, a Java callback must close its output
stream before resolving, not merely schedule the write.

References: [Capacitor Android callbacks](https://capacitorjs.com/docs/plugins/android#intents-with-results),
[Android SAF](https://developer.android.com/training/data-storage/shared/documents-files),
[Compose ulimits](https://docs.docker.com/reference/compose-file/services/#ulimits),
[matching WebView network observer](https://chromium.googlesource.com/chromium/src/+/refs/tags/133.0.6943.137/android_webview/glue/java/src/com/android/webview/chromium/WebViewChromiumAwInit.java).
