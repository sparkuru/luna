# Android 实机验收发现的两个交互问题

## Goal

修复 Android 横屏记账编辑器中核心控件不可达的问题，并让分类删除确认明确指出目标分类；通过自动化覆盖和实体开发板复验确认结果。

## Background

- 上一轮验收设备为 T-CHIP AIO-3568J，Android 11/API 30，横屏物理分辨率 1920×1080。完整步骤和结果见 `.trellis/tasks/archive/2026-09/09-23-manual-ux-platform-validation/validation.md`。
- 打开支出编辑器后，金额计算器显示在面板左侧，右侧大片空白；类别控件不可达。收起 IME、等待和滚动后仍无法操作类别。该问题阻断了类别选择、类别返回后的草稿保留及类型切换确认检查。实机截图位于 `/tmp/luna-android-validation-20260923/entry-form-settled.png`、`entry-ime-hidden.png` 等文件。
- 编辑器 DOM 在 `src/renderer/features/entry.tsx`。`.quick-core-fields` 声明单列，但后续通用 `.form-grid` 规则以相同选择器权重声明双列；Android 的 Capacitor host 使用 `mobile` surface，且金额字段中的计算器默认展开。首次恢复实机连接后，通过 WebView CDP 读取到 `CSS.supports("height: 100dvh") === false`、弹层计算 `max-height: none`、实际高度 1236 CSS px 而视口高度 578 CSS px。日期和保存控件因此位于可视区外，滑动命中了页面背景。需要为弹层高度增加 `100vh` 回退声明，并保留现代 WebView 的 `100dvh` 声明。
- 分类删除位于 `src/renderer/features/categories.tsx`，目前调用不带目标名的通用确认文案；中英文文案位于 `src/renderer/i18n.ts`。`.trellis/spec/frontend/quality-guidelines.md` 要求破坏性确认指出目标，并说明取消与接受的效果。
- 上一轮操作由 ADB 注入触屏、文本和返回键；没有连接或操作独立实体键盘。本任务不能据此声称物理键盘验收通过。

## Requirements

### R1. Android 横屏记账编辑器可操作

- 解决实体开发板横屏下编辑器核心控件不可达的问题，避免金额计算器的高内容列把类别字段挤出可操作区域。
- 金额、类别、日期和保存控件必须可见或能通过编辑器自身的正常滚动到达；不得要求盲点坐标操作。
- IME 显示和收起时编辑器保持打开；打开并关闭类别选择器后，未保存草稿保留。
- 能完成类型切换确认的取消与接受流程，分别确认取消不改草稿、接受后按现有行为清空不适用的分类。
- 保留现有计算器功能，不借此任务扩展为记账表单重设计。

### R2. 分类删除确认指明目标

- 中英文确认文案均显示将删除的实际分类名。
- 取消不改变该分类；接受只作用于确认文案中点名的目标分类。被交易引用时，沿用现有引用处理流程。

### R3. 验证边界

- 自动化覆盖 Android `mobile` surface 在宽横屏视口下的核心字段布局，以及中英文动态确认文案和取消/接受结果。
- 使用隔离的 `.lan` 包和合成数据在实体开发板复验；准确记录设备、构建和所有 ADB 注入操作，不把模拟器或 DOM 事件写成实体键盘证据。

## Acceptance Criteria

- [x] 在 T-CHIP AIO-3568J、Android 11、横屏 1920×1080 下，金额、类别、日期和保存控件均可见或能通过编辑器内正常滚动到达；收起 IME 后不存在阻断控件操作的大块空白列。
- [x] 在同一设备上，IME 返回后编辑器仍打开；打开并关闭类别选择器后合成草稿保留；类型切换确认取消和接受结果均符合 R1。
- [x] 自动化断言宽横屏 Android `mobile` surface 的核心表单为可读、可滚动的单列布局，且 Web surface 的现有专用布局不回归。
- [x] 中英文分类删除确认均显示实际分类名；使用合成分类验证取消后仍存在，接受后仅该分类消失。
- [x] 实机结果、自动化结果及未执行项分开记录；不声称实体键盘已验收。

## Out of Scope

- 备份文件独立解密、恢复和账本等价性验收。本决定将它留在本任务之外；上一轮 Android 保存完整性仍是未完成项，不得描述为已通过。
- 屏幕阅读器、TalkBack、VoiceOver、NVDA、语音播报或 TTS。
- 桌面阅读器、Windows/macOS 原生键盘或原生窗口人工验收。
- 一般性表单重设计、无证据支持的 WebView 或 IME 改造。
