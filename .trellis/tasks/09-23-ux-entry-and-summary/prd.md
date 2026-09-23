# 修复首次恢复入口与手机摘要金额遮挡

## Goal

让新用户无需先建空账本就能恢复或连接已有账本；让手机首页摘要在隐藏、显示和长金额时都清晰可读。

## 状态和证据

2026-09-23 用户已批准本规划；A–D 可实施，E 仅设计研究。实际执行状态以 task.json 为准。问题编号：F01、F02。父任务 [总体 PRD](../09-23-ux-journey-improvements/prd.md) 与 [原始审计](../09-23-ux-journey-improvements/research/体验评估与修改计划.md) 为来源，所有截图/JSON 在父任务 research 下。

## 已确认问题

- F01/P1：全新 context 从欢迎页点击设置，URL 为 /settings 但仍是 Setup；备份卡片和登录控件均为 0。直接 /settings/backup 才能看见恢复，且在建账表单后。锚点 src/renderer/app/shell.tsx:799；证据 probes.json 的 fresh-user-restore-entry、probe-setup-settings-dead-end.png。
- F02/P1：375px 显示 ¥28.50 时金额 x=286.61～347.81、眼睛按钮 x=309.41～353.41 且纵向交叉。锚点 src/renderer/features/ledger.tsx:1236 与 styles.css；证据 layout.json、prod-mobile-revealed.png。

## Requirements

- 欢迎页明确区分新建、恢复备份和连接已有账本；不要求已有数据用户先创建无关空账本。
- 无 workspace 时可访问恢复和账号功能；恢复成功进入原账本，取消有返回路径。
- 摘要金额、辅助说明与隐私按钮互不遮挡，隐私语义不变。

## Acceptance criteria

- [x] A01：新 context 从欢迎页点击可见入口导入另一 context 生成的备份；不得 goto 深链接或 API 预建 workspace 绕过入口。原金额/图片读回，重载仍可用。
- [x] A02：新 context 从欢迎页进入账号登录和已有副本恢复，使用本地合成账号/服务；无额外空账本被创建。离线/错误口令/取消保持原状态。
- [x] A03：320/375/768px，中英文，隐藏/显示、大额、负数和 JPY 场景的金额与隐私控件包围盒不相交，按钮至少 44×44。
- [x] A04：隐藏摘要的文本/ARIA/title/dataset/live 区不泄露金额；只改变单项会话显隐，详情仍可见。

## 约束与依赖

保留离线写入、备份/同步、最初观察的 revision/heads、草稿、防重提交、中英文、现有 URL、summary-only 隐私及键盘/低动效。既有未提交设置整理属于用户基线，不可覆盖。

无前置子任务；后续 B/C 依赖此任务的无账本入口结构。

## Out of scope

不新增注册服务、不改变备份格式/跨工作区合并限制、不自动上传本地账本、不扩大隐私范围。

## 规划边界

交互方案已获用户批准并完成实施，具体证据见 validation.md；实际设备与辅助技术按父任务边界另行验收。

实施与针对性自动化验收见 [validation.md](validation.md)；父任务集成门禁及真实设备/辅助技术边界仍适用。
