# D 实现与验证

2026-09-23，用户批准的 D01–D04 已完成。

## 实现

- `features/ledger.tsx` 将搜索置于类型/分类之前，日期和金额收进原生 details；清除按钮在高级折叠之外，chips 在外层筛选折叠之外，所有条件仍由原有状态持有。
- `features/budget.tsx` 仅 Web 复用 WebMonthPicker；shell 将现有 setMonth 传入，保留路由 dirty blocker、按月份重挂载、保存期间禁用选月和最初 observed heads。
- `i18n.ts`、`styles.css` 添加双语高级条件文案与响应式布局。原生日期行为不变。
- 现有 react-state/intuitive-ledger 测试适配嵌套 disclosure；新增 ux-query-budget 定向回归。

## 验证命令与结果

- `./hako npm run typecheck`：通过。
- `./hako npm run test:web -- tests/e2e/react-state.spec.ts tests/e2e/ledger-sync.spec.ts tests/e2e/settings-interface.spec.ts tests/e2e/intuitive-ledger.spec.ts tests/e2e/ux-query-budget.spec.ts --workers=4`：80/80 通过（chrome/chrome-narrow，1.1 分钟），完整日志 `/tmp/luna-d-tests.log`。
- `git diff --check`：通过。

## 验收证据

- D01：en/zh 搜索不需高级展开；日期/金额条件折叠后仍有 chip，可移除；一次清除重置全部条件。
- D02：既有 react-state 组合条件、非法区间、当前月边界、regex 状态和原生日期回归全部通过，异步 query owner 与结果逻辑未修改。
- D03：预算页 previous/next 与月份弹层可用；取消切月保持月份和 321.09 草稿，确认后进入目标月；保存 456.78 只影响所选月，返回原月为空。
- D04：第二标签提交 2000 后旧草稿 1500 连续两次提交均拒绝，输入与已提交 heads 保持。既有 ledger-sync 的另一标签和加密同步并发保护亦通过。

## 边界

完整单元测试、生产构建、完整生产浏览器套件与截图由主协调集中执行；未改变 schema、协议或预算并发契约。真实移动设备/辅助技术验收仍按父任务边界另行进行。未提交或归档。
