# 第二轮执行计划

- [x] 核对第一轮验收结果/共享规格和最新diff，再start本child。
- [x] trellis-implement按jsonl加载；紧凑统计与完整bucket披露/选择替代。
- [x] 分类首屏/钻取、条形环图/排名，日期标签与收入空态。
- [x] 原生预算月份通过Router blocker；预算三种状态和写入恢复。
- [x] focused风险回归：聚合/重复split防重、明细切换、脏草稿取消切月、
  后台刷新head不升级、pending不可切、月份加载防旧数据。
- [x] ./hako npm run typecheck；./hako npm test；./hako npm run web:build。
- [x] ./hako npm run test:web -- tests/e2e/ux-query-budget.spec.ts
  tests/e2e/intuitive-ledger.spec.ts tests/e2e/ux-mobile-navigation.spec.ts
  --project=chrome；结束时./hako npm run test:web。
- [x] 适用Electron package/smoke；.lan APK覆盖保留账本，真实统计各
  周期/类别/空态、预算输入IME/BACK及切月，合成预算fixture演示超额。
- [x] 两locale窄屏及457×999新截图，对照原统计y2406问题；checker复核
  真实结果，更新稳定spec，再交第三轮。

shell/styles/i18n共享文件由本轮单agent串行修改。复杂split/预算冲突
场景放浏览器独立fixture，不污染手机现有合成基线。

- [x] 用户于2026-09-30确认视觉反馈通过。
- [ ] 父任务 Phase 3.4 exact-hunk 提交/归档门仍待完成。
