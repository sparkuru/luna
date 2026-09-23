# Android 实机键盘与原生对话框验证

## Goal

在用户提供的 Android 实体开发板上，补齐键盘、软键盘和原生系统对话框的人工验收，并记录真实设备结果。

## Confirmed Background

- Electron、Web 与 Android 共用 React renderer；Android 实机验证遵循 `.trellis/spec/frontend/android-runtime.md`。
- 最近 UX 集成的浏览器自动化明确不能证明真实设备 IME、原生 DocumentsUI 或 Android 系统确认框行为，见 `.trellis/tasks/archive/2026-09/09-23-ux-journey-improvements/validation.md`。
- 用户提供实体 Android 开发板，ADB 目标 `192.168.9.14`；屏幕镜像/交互命令为 `/home/wkyuu/cargo/bin/scrcpy/monitor.sh 192.168.9.14`。
- 只读探查确认设备为 T-CHIP AIO-3568J、Android 11 / API 30、1920×1080、280 dpi，默认输入法为 `com.android.inputmethod.latin/.LatinIME`。
- 用户目前没有 Windows/macOS 测试机；当前执行环境没有桌面图形会话，Electron 桌面人工验收暂不可做。

## Requirements

- 按 Android runtime 指南构建独立 `.lan` 包并安装到实体板；安装前检查目标包是否已存在，不覆盖未知的既有应用数据。
- 使用实体设备的可用输入方式检查表单输入、焦点移动、字段错误定位、软键盘显示，以及系统返回键先关闭 IME 再处理应用对话框并保留录入草稿的行为。
- 实际操作 Android 原生确认框和系统文件选择器，覆盖取消与成功路径；确认文件保存/选择后应用显示的结果符合 Android runtime 契约。
- 使用合成账本数据，不连接真实账号或远端服务；记录构建提交、设备/系统、实际输入方式、复现步骤、结果及必要证据。
- 本任务只做人工验证和记录。发现产品问题时提供复现证据和后续建议，不在本任务中修改产品代码。

## Acceptance Criteria

- [x] Android 实体板上的键盘/IME 场景及实际系统对话框场景均有通过/失败记录；未执行项说明原因。
- [x] IME 返回行为、录入草稿留存的已测/未测状态，以及原生文件和确认框取消、成功结果均按场景记录；未以浏览器自动化或 DOM 模拟替代真实设备证据。
- [x] 本轮未连接或操作独立实体键盘；仅覆盖设备软键盘及 ADB 注入事件，不声称硬件键盘已验收。
- [x] 失败/限制项记录了复现步骤、影响范围和后续建议；没有把未测场景虚构为通过。
- [x] 已记录设备与构建信息；本任务未修改产品源代码或触碰真实账本/分类数据。设备端应用数据写入仅限隔离的 `.lan` 测试包中的合成账本/分类和唯一命名测试备份；本机 APK 生成产物的覆盖情况见验证记录。

## Decisions

- 本任务不包含屏幕阅读器人工验证；不安装或启用 TalkBack、eSpeak NG 或其他辅助应用。Luna 不新增语音播报/TTS 产品功能。
- Android、Windows/macOS 及 Electron 桌面均不做屏幕阅读器验证；不使用 NVDA、VoiceOver 或其他读屏器。
- Windows/macOS 和 Electron 桌面键盘及原生窗口检查因测试环境暂缺而延期，不能由 Android 结果代替。

## Out of Scope

- 产品代码修复、浏览器自动化重跑、远端部署验收、删除撤销实现。
- 所有平台的屏幕阅读器或语音引擎验证，以及 Windows/macOS Electron 桌面键盘/原生窗口验证。
