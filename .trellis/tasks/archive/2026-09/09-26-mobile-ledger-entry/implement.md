# 第一轮执行计划

前置：父最终规划获后续确认、task.py start本child、context注入有效；
Phase2默认trellis-implement/trellis-check。父任务及其他child保持planning。

- [x] 保存起点diff，读取父design和本jsonl specs；记录既有dirty归属。
- [x] 移动字体/token/短底栏与上下文；紧凑摘要/交易列表。
- [x] 筛选专用面板与已有月范围/清空/结果数行为。
- [x] 录入金额/分类网格/日期/更多信息/计算器/底部保存，focus与IME。
- [x] 详情信息布局；详情/图片/分类/录入统一可见层BACK优先级。
- [x] 聚焦语义和真实风险的回归：保留草稿、隐私DOM、长金额、过滤范围、
  原生presentation焦点/旧vh；不写纯复刻CSS数值的测试。
- [x] ./hako npm run typecheck；./hako npm test；./hako npm run web:build。
- [x] ./hako npm run test:web -- tests/e2e/android-entry-layout.spec.ts
  tests/e2e/ux-entry-summary.spec.ts tests/e2e/entry-form-polish.spec.ts
  tests/e2e/ux-mobile-navigation.spec.ts --project=chrome。
- [x] 按shell/过滤差异补用例；更新的是已改变的产品呈现断言，不删除
  隐私/草稿/恢复语义断言；结束时./hako npm run test:web全量。
- [x] 适用./hako npm run package与./hako npm run smoke:electron；环境
  失败保留证据与风险，不虚报全部验证通过。
- [x] 构建.lan隔离APK（android-runtime命令）；核对hash；仅原合成账本
  安装覆盖，不清数据；实机金额IME/文本IME/返回/草稿/长列表/截图验收。
- [x] trellis-check合规、diff/check及UUPM视觉检查；主会话更新稳定spec。
- [x] 独立复核完成，并记录供第二轮复用的组件/样式契约与验收结果。
- [x] 用户于2026-09-30确认视觉反馈通过。
- [ ] 父任务 Phase 3.4 exact-hunk 提交/归档门仍待完成。

风险文件shell/styles/i18n跨端共享；必须串行。需要同时触及host/IPC
时先报告原因并复核范围，不把UI重做扩成数据层重构。
