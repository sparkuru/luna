# 直观记账 UI：当前源码续接验证

日期：2026-09-24；基线 `2c40315`。本轮仅使用本地生产 Web 构建和隔离合成账本，
没有连接 VPS 或操作物理 Android。

## 自动化结果

- 首次运行 `tests/e2e/intuitive-ledger.spec.ts` 的 Chrome 项目：11/12 通过。
  “收入录入和高级字段键盘可达”一项失败时，分类弹窗仍在关闭并恢复焦点；测试
  已在弹窗关闭、焦点回到分类按钮后再按 Enter。应用交互代码未改动。
- 修正测试等待边界后，生产 Web 桌面 Chrome 和 375px 窄屏共 **24/24 通过**。
  覆盖空账本、收入/支出、金额计算、分类、高级字段键盘路径、次级导航、
  统计与图片、1280/1440/768/375/320px 布局。
- `./hako npm run typecheck`、`git diff --check` 和
  `python3 ./.trellis/scripts/task.py validate intuitive-ledger-ui` 通过。

## 现行范围与剩余验收

后续获批的 Web 视觉重构已将普通 Web 的三横线弹窗替换为设置路由，并把账单页
收敛为一个主记账入口；旧设计的弹窗和双入口不再是 Web 验收目标。当前自动化
证明了可观察的页面行为和键盘路径，不能证明新用户几秒内理解页面，也不能替代
桌面原生窗口、屏幕阅读器或物理 Android 的人工验收。因此 PRD 的复合验收项
继续保持未勾选，任务仍为 `in_progress`。

本轮没有新增组件实现契约：`.trellis/spec/frontend/component-guidelines.md`
已规定分类弹窗关闭后的焦点还原，以及相应浏览器断言。
