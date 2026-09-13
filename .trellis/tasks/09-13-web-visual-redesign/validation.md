# Web 端视觉重构：最终验证（含反馈修订）

更新时间：2026-09-13

## 验证范围

- 目标 surface：普通浏览器 Web；后端、账号、账本、同步、权限和金额逻辑未改。
- 合成数据：本地创建工作区，加入收入 2500.00、支出 18.50/42.00/12.50，英文 `en-US`；未使用真实账号或个人财务数据。
- 视口：`1440×900`、`1024×768`、`768×900`、`375×812`、`320×800`，另补 `812×375` 横屏。
- 截图目录：`/tmp/luna-web-visual-redesign/`。包含 setup、空账本、账单、录入、统计、设置及最终各视口截图；代表文件包括 `final-home-1440.png`、`final-entry-320.png`、`final-statistics-768.png`、`final-settings-375.png` 和 `final-home-812x375.png`。截图仅作人工视觉证据，不作为像素快照合约。
- 本轮反馈修订：Web 侧栏只保留一级导航；`#primary-record` 移到账单页；账本/账号/同步说明归入设置；录入弹层改为“类型 → 分类 → 金额/日期 → 保存 → 更多信息”的完整宽度流程。
- 最新反馈修订：Web 去掉独立的 `#record-expense` / `#record-income` 入口，月份切换改为胶囊式期间控件，摘要改为轻量信息条，筛选改为紧凑 disclosure，Settings 改用齿轮图标并保留 `#open-secondary-menu`。
- 月份/状态修订：切换期间保留页面壳但以所选月份 loading/error 替换旧内容；账单严格按月份过滤；统计首屏改为紧凑图表与环图，逐桶明细可展开；预算从 Web 一级导航移入设置工作区，语言和本地保存说明归入设置，首页只在动作后显示临时状态。
- 本轮反馈截图：`feedback-home-1440-zh.png`、`feedback-entry-collapsed-1440-zh.png`、`feedback-entry-calculator-1440-zh.png`、`feedback-settings-1440-zh.png`、`filter-open-1440-zh-final.png`，以及 `feedback-home-{1280x800,1024x768,768x900,375x812,320x800}-zh.png`。

## 自动化通过

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run web:build` | 通过；仅有依赖的 `use client` bundle 警告及既有 chunk 体积警告 |
| Web 定向 Playwright（ledger/privacy/accessibility/react-state/intuitive，开发服务） | `44 passed`；其中本次受影响的 focused 命令实际运行 `34 passed` |
| `LUNA_TEST_BASE_URL=http://127.0.0.1:4175 npm run test:web`（production preview） | `76 passed`、`2 skipped`；`server-account.spec.ts` 两个 worker 启动即 `SIGSEGV` |
| `git diff --check` | 通过 |

完整开发 Web 套件复核为 `70 passed`、`2 skipped`；其中必须使用 production
service worker 的 offline/update 场景在开发服务器上不适用，另有两个
`server-account.spec.ts` worker 启动即 `SIGSEGV`。production preview 全量复核为
`76 passed`、`2 skipped`，仅保留同一两个 server-account worker 的 `SIGSEGV`
环境残留；离线、service worker、同步和备份场景均通过。

原生/共享单测 `npm test`（并以已安装 `tsx` 串行复核）：`190` 个测试中 `187 passed`、
`3 failed`。失败固定为 `src/main/ledger-store.test.ts`、
`src/main/profile-host.test.ts`、`src/main/store.test.ts` 的 native SQLite worker
`SIGSEGV`；当前运行时为 Node `v20.19.2`，而项目 `engines` 要求 `>=22.18.0`。

## 视觉与几何复核

- 所有目标视口的 `document.documentElement.scrollWidth` 均等于 viewport 宽度，无横向溢出。
- 1440px 截图中 Web 侧栏只有一个齿轮 Settings 入口，账单页只有一个实心“添加交易”主按钮；不再渲染独立的支出/收入快捷按钮，月份控件收拢为同一枚胶囊。
- Web 筛选默认只显示一行带滑杆图标的触发器；展开态为紧凑双列，正则/文本复选框保持 44px 可操作区域且不再被全局输入宽度规则拉伸。
- Web 录入弹层在 1440px 下类型、分类、金额/日期、保存、更多信息形成连续流程；计算器展开后横跨弹层全宽，不再占用一列制造空白。窄视口下分类选择、日期字段仍在保存栏之前完整可达。
- Web 账单截图不再展示账本选择器、账本名称、账号说明或持久同步卡片；设置首页承载本地账本、账号、同步/备份和冲突处理入口。
- Web 设置概览承载“已保存在当前设备”本地存储状态、语言入口和每月支出上限入口；首页顶部不再出现持久语言/保存说明，保存或同步动作只产生一条短暂状态反馈。
- Web 1440px 账单截图中月份控件为单一胶囊式选择器，hero 仅有一个添加交易按钮；375px 下该按钮完整横向显示，固定底部导航之外仍预留正文空间。
- 月份隔离回归使用当前月与上月各一笔交易：切换期间显示 loading，加载完成后列表和计数仅包含所选月份。
- `768` 月统计趋势卡约 `518px` 高；`375` 约 `799px`；`320` 约 `1119px`，分类与最大支出不再被异常等高布局推到无意义空白之后。
- `812×375` 横屏下 Web 紧凑顶栏、一级导航、主内容和设置入口均保持在页面宽度内；无固定元素遮挡正文。
- 页面保留摘要独立隐私遮罩、交易详情/编辑/删除/图片、筛选、预算、统计钻取/排序、设置子页、同步/备份/冲突和旧 deep link；375px 两条交易在固定底部导航上方完整可见。

## 未运行 / 人工待验

- Electron/Android 打包级运行、真实 Android/iOS 专属交互和真实设备文件选择未作为本轮 Web 视觉交付条件运行。
- 真实屏幕阅读器、辅助技术、浏览器 200% 缩放和用户主观视觉认可仍需人工验收；不能用截图替代这些边界。
- SQLite worker 的 `SIGSEGV` 需在项目要求的 Node 版本或修复 native 运行环境后单独复测。
