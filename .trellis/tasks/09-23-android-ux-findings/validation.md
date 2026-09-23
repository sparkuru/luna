# Android 交互修复验证

状态：本任务的自动化与实体设备复验通过（2026-09-23）。以下实机触屏、文字和返回键均为 ADB 注入；WebView DOM 读数由 Playwright CDP 获取，不代表实体键盘操作。

## 构建与边界

- 设备：`192.168.9.14:5555`，T-CHIP AIO-3568J，Android 11/API 30，横屏 1920×1080；WebView CSS 视口 1098×578，DPR 1.75。设备上 `CSS.supports("height: 100dvh")` 为 `false`。
- 测试对象仅为隔离包 `majo.im.luna.lan` 和已有合成账本 `TestLedger`；标准包 `majo.im.luna` 未安装。本轮未连接账号、未保存交易，也未清除应用数据。
- 执行 `LUNA_ANDROID_APPLICATION_SUFFIX=.lan docker compose -f compose.android.yaml build android-apk` 和同环境的 `run --rm android-apk`。导出的 `artifacts/android/luna-lan-debug.apk` 为 5,154,660 bytes，SHA-256 `48b66af3cdc32bb925c5755bbe3eeb35280dec405faa3e60fef8ad0d1e705afd`，sidecar 校验通过。构建后比对设备上已安装的 `.lan` `base.apk`，哈希完全相同，因此未重复安装；设备运行的是同一构建。
- 本任务只验收编辑器与分类删除交互。`smoke:android` 包含备份完整性等其他验收，未运行；备份文件独立解密仍沿用上次记录的未验证状态。

## 自动化

- `./hako npm run typecheck`：通过。
- `./hako npm test`：214 passed、0 failed；在项目 Node 22 容器内运行，避开宿主 Node 20 的原生存储模块崩溃。
- `./hako npm run web:build`：通过。
- 完整 Web Playwright：182 passed、6 skipped、0 failed。两个目标 E2E 文件的最终复跑：8 passed、0 failed，覆盖 `chrome` 与 `chrome-narrow`。
- 横屏 `mobile` surface 用例断言计算器仍显示、核心字段单列、对话框限高并可内部滚动；另在 CSSOM 中移除 `100dvh` 支持规则，验证 `100vh` 回退仍限制高度及保证下方控件可到达。Web surface 仍为原有三列。
- 中英文删除用例均检查实际分类名、取消不改变分类 ID 集合、接受只删除点名的合成目标 ID。
- `python3 ./.trellis/scripts/task.py validate .trellis/tasks/09-23-android-ux-findings` 与 `git diff --check`：通过。

## 实体设备观察

1. 在 `TestLedger` 打开支出编辑器，系统数字 IME 出现；ADB 注入一次 `KEYCODE_BACK` 后 `mInputShown=false`，编辑器仍打开。IME 出现时弹层计算限高约 236 CSS px；收起后限高约 546 CSS px（视口高 578），内容高 1236 CSS px，弹层自身可滚动，核心字段为一列。
2. 在弹层内 ADB 注入滑动，`scrollTop` 到达约 414 后分类与日期可见；继续滑到约 690 后日期与保存按钮均位于弹层可视区域。未再出现先前阻断类别操作的大块空白列。
3. 用金额计算器输入合成草稿 `42.00`。打开分类选择器后，第一次返回仅收起搜索 IME，第二次返回关闭选择器；编辑器仍打开且金额仍为 `42.00`。选中内置支出分类“餐饮”后切换到收入，原生确认框出现。取消后保持“支出 / 42.00 / 餐饮”；再次切换并接受后为“收入 / 42.00 / 空分类”，未保存交易。
4. 中文环境创建无交易引用的合成分类 `UXVerifyZH0923`。原生删除确认点名该分类并说明取消、继续及历史保留效果；取消后相同 ID 仍在，接受后仅此 ID 消失，其余分类 ID 集合不变（16 → 15）。
5. 临时切换英文，使用另一无交易引用合成分类 `UXVerifyEN0923` 重复验证；英文原生确认点名该分类，取消后保留，接受后仅该 ID 消失（16 → 15）。两个合成分类均已删除，应用语言恢复为原来的 `zh-CN`。

设备截图保存在本机临时目录：`/tmp/luna-android-ux-after-second-tap-20260923.png`、`luna-android-ux-ime-hidden-20260923.png`、`luna-android-ux-editor-scrolled-20260923.png`、`luna-android-ux-editor-bottom-20260923.png`、`luna-android-ux-category-open-20260923.png`、`luna-android-ux-native-type-confirm-20260923.png`、`luna-android-ux-category-zh-confirm-20260923.png`、`luna-android-ux-category-en-confirm-20260923.png`。自动化断言与实体设备观察分别记录，不把 Chrome CSSOM 模拟当作 Android 实机证据。

## 未覆盖项

- 未接入独立实体键盘；本轮只验证 Android 软键盘和 ADB 注入返回键。
- 未执行备份独立解密、屏幕阅读器、桌面原生窗口或 `smoke:android` 的其他场景；这些不属于本任务的两项交互修复。
