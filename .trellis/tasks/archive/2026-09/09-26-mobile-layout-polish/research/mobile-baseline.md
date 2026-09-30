# Physical mobile baseline, 2026-09-26

ADB exact target `192.168.9.11:44643` is connected (`22041216UC`, xagapro). Other attached device excluded. Installed pre-existing `artifacts/android/luna-lan-debug.apk` (2026-09-23 artifact) into initially absent `majo.im.luna.lan`; synthetic ledger name 移动布局测试. No reset/uninstall or real account actions.

1080×2460, physical density420, override378. WebView reports457×999 and DPR2.36249995. Native topbar148px; hero112px; summaries107px; transactions heading y424. Bottom nav y912,h75. Opening entry focuses decimal amount and activates OS IME, shrinking innerHeight to709. Panel bottom≈701, while category y783, date y904, save y972. Native calculator is permanently nested inside amount field, producing a duplicated numeric keypad and pushing required fields down.

Screenshots: `/tmp/luna-mobile-baseline-setup.png`, `/tmp/luna-mobile-baseline-entry.png`. They establish a previous APK baseline, not current source validation.

Playwright standard connectOverCDP fails on this WebView with Browser.setDownloadBehavior context-management unsupported. Android API works; CDP `{noDefaults:true}` also works. Forward used: local tcp9224→`webview_devtools_remote_7377`, belonging to this isolated package. Native surface screenshots use exact-serial `adb exec-out screencap -p`. A temporary Node Android diagnostic hung after closing device and was interrupted; subsequent diagnostics explicitly exit.

## Implementation target update

Initial `:44643` disconnected/refused during implementation. User supplied replacement `192.168.9.11:34971`; use this new exact serial for final testing, verifying the same22041216UC/xagapro before install. The original serial above remains historical baseline evidence.
