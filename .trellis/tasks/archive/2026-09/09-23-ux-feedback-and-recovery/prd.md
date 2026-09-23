# 修正备份冲突页面语义与表单错误反馈

## Goal

用户进入备份、冲突和录入页面时，能准确理解当前任务与状态，遇错后知道改哪里并直接到达对应字段。

## 状态和证据

2026-09-23 用户已批准本规划；A–D 可实施，E 仅设计研究。实际执行状态以 task.json 为准。问题编号：F03、F04。父任务 [总体 PRD](../09-23-ux-journey-improvements/prd.md) 与 [原始审计](../09-23-ux-journey-improvements/research/体验评估与修改计划.md) 为来源，所有截图/JSON 在父任务 research 下。

## 已确认问题

- F03/P1：备份/零冲突页面复用登录同步说明；零冲突没有无需处理空态，设置卡片写“有 0 项冲突待处理”。锚点 src/renderer/features/tools.tsx:475、settings.tsx:425、settings-navigation.ts；证据 prod-1440-settings-backup.png、prod-375-settings-conflicts.png。
- F04/P1：金额有效而分类缺失，错误要求选分类但焦点落到 transaction-amount；欢迎页空名称只有通用错误；短密码错误包含实现术语。锚点 src/renderer/features/entry.tsx:481、:521、features/setup.tsx；证据 probes.json 的 category-required-focus、02-welcome-invalid.png。

## Requirements

- 备份、同步、冲突页分别有符合任务的标题与说明；离线备份不要求登录。
- 无冲突为正常空态，加载、失败、有冲突单独呈现，不能将查询失败当成零冲突。
- 校验错误具体到字段，聚焦待修正字段；更正字段后清理其过期错误，服务错误保留草稿与恢复动作。

## Acceptance criteria

- [x] B01：未登录也能导出并恢复加密备份，页面明确无需登录；无账本为恢复，已有账本为合并，并保留风险确认。
- [x] B02：冲突页分别验证 0/1/多冲突、加载、请求失败；零冲突明确无需处理，失败有重试，不显示伪成功。
- [x] B03：名称/金额/分类/日期/密码错误逐项验证，焦点和 aria-describedby 指向正确字段；输入修正后旧错误清除。
- [x] B04：网络/权限/旧 revision 错误保留输入；提交成功但刷新失败仍不重放写入；中英文信息完整。

## 约束与依赖

保留离线写入、备份/同步、最初观察的 revision/heads、草稿、防重提交、中英文、现有 URL、summary-only 隐私及键盘/低动效。既有未提交设置整理属于用户基线，不可覆盖。

建议在 A 完成后实施，避免同时重排 shell/tools/setup；没有 A 时须先冻结共享入口边界。

## Out of scope

不改变备份密码安全约束、加密、冲突算法或错误返回协议；不把后端错误静默转换为成功。

## 规划边界

交互方案见 design.md，用户已批准按此范围实施。实际设备与辅助技术按父任务边界另行验收。

针对性实现和验收结果见 [validation.md](validation.md)；最终集成门禁由父任务统一执行。
