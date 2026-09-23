# Android 实机手工验证记录

状态：执行结束（部分场景未验证，2026-09-23）。仅记录 Android 实体板键盘/IME 与系统对话框场景。所有触屏、文字和返回键事件均由 ADB 注入；本轮未连接或操作独立实体键盘，仅覆盖设备软键盘显示和 ADB 注入事件。读屏器/TTS、桌面端不在本次范围。

## 构建与设备

- 源码提交：`fb77d94dbde8ff68256f8ef73f72c277614d20ac`。
- 按 `.trellis/spec/frontend/android-runtime.md` 检查 `compose.android.yaml` 和 `Dockerfile.android` 后执行 `.lan` 隔离构建：`LUNA_ANDROID_APPLICATION_SUFFIX=.lan docker compose -f compose.android.yaml build android-apk`，结果 `BUILD SUCCESSFUL`。
- APK：`artifacts/android/luna-lan-debug.apk`，5,154,484 bytes；SHA-256 `ca1d8610a6aeb26d5d78bff7626b0cbaa72c33d58b81d30cc132401d285577bf`。随附 sidecar 校验通过。Gradle 配置是 `applicationId majo.im.luna` 加 `.lan` 后缀，安装解析为 `majo.im.luna.lan/majo.im.luna.MainActivity`。
- 安装前通过 `pm list packages` 检查，设备没有 `majo.im.luna.lan`；未触碰标准包 `majo.im.luna`。`adb install artifacts/android/luna-lan-debug.apk` 成功。
- 设备：T-CHIP AIO-3568J（`rk3568_firefly_aioj`），Android 11 / API 30，1920×1080；当前输入法 `com.android.inputmethod.latin/.LatinIME`。
- 本次新建的本地账本使用合成名称 `TestLedger`；没有连接真实账号或服务。

## 已验证

### Android IME 显示、返回键及名称字段保留（部分场景）

在“新建账本”名称字段执行 ADB 注入触屏，设备显示系统 LatinIME；`dumpsys input_method` 为 `mInputShown=true`。注入文本 `TestLedger` 后发送 `KEYCODE_BACK`，系统 IME 收起，`mInputShown=false`，当前页面仍在，字段保留 `TestLedger`。这是设备侧 IME/返回分发的实机结果，但输入不是实体键盘操作。

证据截图及 UI 层级位于本机临时目录：

- `/tmp/luna-android-validation-20260923/ledger-name-ime.png`
- `/tmp/luna-android-validation-20260923/ledger-name-ime-hidden.png`
- `/tmp/luna-android-validation-20260923/home-ui.xml`（WebView 内部表单不会展开到 UIAutomator 节点）

随后从账本主页触发“记一笔支出”。弹出的账目编辑器中系统数字 IME 显示；注入一次 `KEYCODE_BACK` 后 `mInputShown=false`，账目编辑器仍留在屏幕上，设备端的 IME 返回优先级符合预期。未验证编辑器内草稿留存：当时没有输入内容，且后续类别控件未能到达。

### 账目编辑器可见性阻塞

设备为横屏 1920×1080（系统属性同上）。在默认中国语言设置下，账目编辑器经 ADB 触屏打开后，截图中可见金额计算器位于面板左侧，右侧出现大面积空白白色区域，账本主页仍在遮罩下。分别等待界面稳定、收起系统 IME 并尝试滚动后，类别/备注等控件仍未在可见区域出现，因此未盲点坐标继续输入，也未保存空交易。观察到的截图：

- `/tmp/luna-android-validation-20260923/entry-form.png`
- `/tmp/luna-android-validation-20260923/entry-form-settled.png`
- `/tmp/luna-android-validation-20260923/entry-ime-hidden.png`
- `/tmp/luna-android-validation-20260923/entry-form-lower.png`
- `/tmp/luna-android-validation-20260923/entry-recovery-swipe.png`（继续下滑后布局未变化）
- `/tmp/luna-android-validation-20260923/entry-closed.png`（第二次返回关闭空白编辑器，回到账本主页）

结果：此状态阻断类别子对话框、类别选择返回后的草稿留存，以及账目类型切换确认检查。复现步骤：打开应用中的 `TestLedger` 主页，点击“记一笔支出”；确认数字 IME 出现后注入一次返回键收起 IME；等待界面稳定并尝试滚动。横屏 1920×1080、默认中文语言设置下，截图中计算器位于面板左侧，右侧为大面积空白白色区域，主页仍处于遮罩下，类别/备注控件不可见。后续应在同一设备与方向复现并检查可见控件；本记录不推断原因或提出产品修复结论。本任务未改产品代码。

### Android 原生 SAF 保存取消与文件生成

先从“加密备份”页面输入一次性合成口令并点击“保存加密备份”，实际打开 Android DocumentsUI 的“下载”位置。第一次保留系统默认名称并发送 ADB 注入的 `KEYCODE_BACK` 取消。返回应用后显示“已取消保存，未生成备份。请选择保存位置后重试。”没有成功回执；为避免触碰未知文件，没有检查默认建议名称对应的路径，因此不对该路径是否存在作结论。

随后重新输入一次性口令并再次打开 DocumentsUI。将文件名改为唯一名称 `Luna-validation-20260923-1037.luna-backup`，点击系统“保存”。返回应用后显示“加密备份已保存。”；只对该确切路径执行 `ls -l`，看到文件存在且大小为 2,135 bytes。没有列目录、打开或读取其他文件，也未读取新文件内容。实机观察确认了取消反馈、保存成功反馈及唯一目标文件存在；没有独立解密文件或比较恢复账本，因此备份内容完整性及与原账本等价性尚未验证，不能视为 Android runtime 契约要求的完整保存验收。口令值未写入报告。

状态：取消路径的应用反馈已通过实机观察；唯一文件名保存路径只确认成功反馈和目标文件存在，完整性验收未完成。证据：`/tmp/luna-android-validation-20260923/saf-create-document.png`、`/tmp/luna-android-validation-20260923/saf-cancelled.png`、`/tmp/luna-android-validation-20260923/saf-save-success.png`、`/tmp/luna-android-validation-20260923/saf-save-app-status.png`。取消和保存操作均已执行，交互均为 ADB 注入。

### Android 确认框取消与接受（分类删除）

在隔离的 `.lan` 应用中创建无交易引用的合成分类 `ValidationOnly`。从该唯一分类行点击“删除”后，出现 Android 确认框，文字为“删除这个分类？处理完所有引用后，它会以历史删除标记保留。”提示本身没有显示分类名；确认框后方可见刚才操作的 `ValidationOnly` 行。第一次点“取消”后，该行仍在列表中。再次从同一行发起删除并点“确定”后，截图显示该行消失；仅此合成分类被删除，没有操作 `Luna` 或其他账本/分类。

观察与后续建议：确认框文案本身没有显示被删分类名称，用户需要结合打开确认框前的列表上下文识别目标。本次目标行仍可见且唯一，因此能确认操作对象；建议后续让确认文案显示分类名称，并单独复验。

证据：`/tmp/luna-android-validation-20260923/category-confirm-open.png`、`/tmp/luna-android-validation-20260923/category-confirm-cancelled.png`、`/tmp/luna-android-validation-20260923/category-confirm-accept.png`（接受前，目标行仍可见）、`/tmp/luna-android-validation-20260923/category-deleted.png`（接受后，`ValidationOnly` 已从分类列表消失）。取消和接受均为 ADB 注入点击。该结果只覆盖分类删除确认，不代表账目类型切换确认已验证。

## 尚未验证

- 账目编辑器类别子对话框、IME 返回后类别对话框/账目草稿保留，以及账目类型切换确认（被上述可见性问题阻塞）。
- 空的新建账本名称提交后的错误提示与焦点定位。当前“设置 > 本地账本”页面只显示现有 `TestLedger`，没有可见的新建入口；未清空应用数据或切换含义不明的账本以重走首次启动流程。
- 物理键盘输入；当前交互仅有 ADB 注入，不能据此声称硬件键盘验收通过。

## 操作说明与限制

- `scrcpy/monitor.sh` 未运行；界面观察使用设备侧 `screencap`，操作使用 ADB 注入触屏/文字/按键。
- 为导出构建产物临时覆盖 Docker volume 时，Compose 仍使用服务中配置的 `artifacts/android:/output` 挂载，构建将覆盖原有本地生成文件 `artifacts/android/luna-lan-debug.apk`（原文件时间为 2026-09-11）。该 APK 是被测构建产物，不是设备上既有安装；设备安装包检查仍确认不存在同 ID 应用，因而没有覆盖既有应用数据。新产物 sidecar 与文件 SHA-256 已复核。
