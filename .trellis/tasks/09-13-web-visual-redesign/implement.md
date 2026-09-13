# Web 端视觉重构与响应式体验：执行计划

状态：in_progress；已获得实施批准并完成实现，当前记录最终验证与交付边界。

## 0. 接管与基线

- [ ] 运行 `git status --short`、`git diff --stat`、`python3 ./.trellis/scripts/task.py current`，确认只处理本子任务，保护父任务和其他 dirty 基线。
- [ ] 阅读并核对本任务 `prd.md`、`design.md`、`research/ui-ux-review.md`，以及 frontend index/component/state/quality/web-host/type-safety 规范。
- [ ] 用合成数据重新运行 Web 开发服务，确认 `375` 证据只作既有窄屏安全基线；新视觉主验收使用 `768`、`1024`、`1280`、`1440` 和横屏。
- [ ] 记录现有 E2E locator、路由、setup/空态/摘要隐私/录入/统计/设置入口，禁止通过隐藏控件维持旧测试。

## 1. Web surface 与桌面 shell

责任文件候选：`src/web/main.ts`、`src/renderer/renderer.ts`、`src/renderer/app/shell.tsx`、`src/renderer/components/app-navigation.tsx`、`src/renderer/styles.css`、必要的 `src/renderer/app/*`。

- [ ] 增加 typed `client-surface` 判定，Web、Capacitor mobile、Electron 入口各自明确标记；确认不会向 API/Query/远端 payload 泄漏。
- [x] 把 Web 左侧一级导航、品牌组织成独立 chrome；Web 记账按钮、账本 picker 和同步状态分别移到账单页/设置页；native/mobile 保留当前导航路径。
- [ ] 重做 Web setup/recovery masthead，保留 setup 的字段、错误、语言、默认币种和恢复入口。
- [ ] 以 `>=1024px` 左侧栏为主，`768–1023px` 提供 Web 紧凑收缩方案；处理 sticky/fixed offset、横屏、键盘焦点和 route focus。
- [ ] 添加 surface/导航行为回归：Web 左侧栏 active route、旧 deep link、浏览器返回、切换账本和 dirty blocker。

退出条件：Web 桌面 shell 可从 setup、账单、统计、预算、设置进入；mobile/Electron 未出现 Web 左侧栏；无业务 API 或数据状态变更。

## 2. 首页账单与公共视觉层级

责任文件候选：`src/renderer/features/ledger.tsx`、`src/renderer/components/*`、`src/renderer/styles.css`、`src/renderer/i18n.ts`。

- [x] 将账单页面改成 Web page header + summary + transaction-first content；去掉重复的 desktop primary CTA 和竞争性状态区。
- [ ] 重新整理 summary cards、月份控制、过滤器、空态和日期交易行的 spacing/typography/surface 层级；不改变隐私遮罩及金额数据边界。
- [ ] 保留交易详情、编辑/删除、图片、筛选和失败/成功状态，更新 locator 与中英文文案。
- [ ] 用合成数据检查 768/1024/1280/1440/横屏以及 320/375 安全降级；不得让固定/粘性 chrome 遮住交易内容。

退出条件：首页在 Web 桌面第一屏优先显示账单，只有一个视觉 primary CTA，行为回归覆盖摘要、交易详情和账本切换。

## 3. Web 录入面板

责任文件候选：`src/renderer/features/entry.tsx`、`src/renderer/styles.css`、相关 i18n/test。

- [ ] 在不改变 Radix Dialog/focus/dirty/revision/attachment contract 的前提下，为 Web 宽屏实现连续的完整宽度 entry panel；收缩窗口自动单栏。
- [ ] 保持类型、分类、金额表达式、日期、更多字段、图片 staging、保存 loading/error/success 的真实状态。
- [ ] 用单一“记一笔”入口进入表单，在表单内部保留收入/支出切换；若保留直接类型快捷入口，明确降级为次级操作，不再与主入口争夺视觉层级。
- [ ] 覆盖空草稿、旧交易编辑、切换类型确认、无效金额、图片处理中、保存失败、关闭焦点返回和键盘路径。

退出条件：桌面 Web 录入流程首屏可理解，表单不会丢草稿/附件/原 revision，现有 entry 领域测试与 Web E2E 通过。

## 4. 统计密度与设置信息架构

责任文件候选：`src/renderer/features/budget.tsx`（必要时拆出 `statistics.tsx`）、`src/renderer/app/shell.tsx`、`src/renderer/styles.css`、i18n/test。

- [x] 统计工具栏收拢为清晰的 period/anchor/type/view 组合，保持 URL search 语义和现有 state ownership。
- [x] 将月趋势的全部桶改为紧凑、可读、可键盘选择的 plot；保留可展开的逐桶文字明细、未来/零值和 selected bucket detail。
- [ ] 让趋势、分类、最大支出卡按内容自然高度布局，修复桌面空白；保留环图/横条切换、分类 drilldown 和排序。
- [x] 设置概览与二级导航分组化，保留账本、偏好、预算、账号、同步、备份、冲突和 desktop-only 状态；语言与本地存储说明归入设置。
- [ ] 覆盖空数据、少量数据、30 日数据、周/月/年、分类钻取和设置深链接。

退出条件：统计信息不被压缩丢失，Web 桌面滚动高度合理，设置入口完整可发现且行为未改变。

## 5. 公共质量与人工视觉复核

- [ ] 补齐 en/zh-CN catalog、ARIA、heading hierarchy、focus-visible、disabled/error/empty/loading 文案。
- [ ] 清理只服务旧 Web nav 的冗余 CSS，保留 mobile/native surface 的既有规则；不引入远程字体、emoji、重型图表依赖或不必要动效。
- [ ] 在 `prefers-reduced-motion`、键盘操作、浏览器缩放/大字号可用的范围内检查布局；真实辅助技术仍标为未验证，不能用截图代替。
- [ ] 生成 `/tmp/luna-web-visual-redesign/` 的 setup、ledger-empty、ledger-populated、entry、statistics、settings 截图，记录 viewport/locale/data。

## 6. Validation Gate

按改动范围运行并记录实际结果：

```text
npm run typecheck
npm test
npm run web:build
npm run test:web
LUNA_TEST_PRODUCTION=1 npm run test:web
git diff --check
```

跨平台打包、真实设备、真实部署、真实辅助技术和用户视觉反馈不属于本子任务的自动完成条件；如果共享 renderer 变化影响 Electron/Android，只运行与变更相关的额外检查并单独记录。

## 7. Review / Rollback Points

- [ ] shell 完成后检查 Web/native surface DOM 和导航语义，再进入页面重构。
- [ ] 首页和 entry 完成后先跑 focused Web tests；失败时回滚 CSS/markup，不改 shared API。
- [ ] 统计完成后核对数据数量、金额口径和键盘文字替代，再做视觉压缩。
- [ ] 最终逐文件检查只包含本子任务路径；不覆盖父任务的协议、部署、SDK、Android 或同步 dirty 基线。

## 8. Latest feedback pass (2026-09-13)

- [x] Web 账单页去掉独立支出/收入快捷按钮，只保留 `#primary-record`；收入/支出类型切换留在录入弹层内，原生入口不变。
- [x] 月份切换改为连贯胶囊控件，保留三个稳定 locator、月份 URL/state 和键盘可达性。
- [x] 三项摘要改为轻量信息条；独立隐私遮罩、眼睛按钮和稳定高度保留，并为 375px 固定导航补足安全空间。
- [x] 筛选默认收起为轻量 disclosure，展开态改为紧凑双列；文本/正则复选框不再被全局输入宽度规则拉伸。
- [x] Web Settings 使用 Lucide 齿轮图标并保留 `#open-secondary-menu`；旧三横线视觉约束只留在 native 兼容层。
- [x] 定向 Web 套件 `42 passed`；新增月份隔离回归后 focused 套件为 `44 passed`（本次实际受影响套件 34 passed）；production preview 全量 Web 套件 `76 passed, 2 skipped`，另有两个 `server-account.spec.ts` worker 因环境 `SIGSEGV` 启动失败。

## 9. Latest feedback pass (2026-09-13, month/state follow-up)

- [x] 月份切换使用 selected-month loading/error 状态，旧 snapshot 不作为新月份内容渲染；LedgerHome 的账单、计数、空态和筛选结果总数都限制在所选月份。
- [x] Web 统计默认以紧凑日柱图和环图表达，逐桶文字表格折叠在“查看期间明细”中；分类和大额支出保留显式前五/全部切换。
- [x] Web 一级导航移除预算；预算入口出现在设置首页工作区分组，语言出现在偏好设置，本地保存说明出现在设置概览。
- [x] 首页保存反馈使用单条短暂 toast/live status；顶部不再同时放持久本地保存文字和语言选择器。
- [x] 修复 375px Web 的 hero CTA 旧 CSS specificity 冲突，按钮保持完整宽度、横向图标和文字，并为固定底部导航保留正文安全区。
