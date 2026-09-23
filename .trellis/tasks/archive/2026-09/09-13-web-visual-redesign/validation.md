# Web 端视觉重构：最终验证（含反馈修订）

原始验证日期：2026-09-13。以下原始截图名称和测试结果仅记录当时的执行，
`/tmp` 文件可能随环境清理；2026-09-23 的当前证据见文末续接复核。

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
- 页面保留摘要独立隐私遮罩、交易详情/编辑/删除/图片、筛选、预算、统计钻取/排序、设置子页、同步/备份/冲突和当时的 deep link；375px 两条交易在固定底部导航上方完整可见。旧 `/ledger` 路由的当前决定见下文。

## 未运行 / 人工待验

- Electron/Android 打包级运行、真实 Android/iOS 专属交互和真实设备文件选择未作为本轮 Web 视觉交付条件运行。
- 真实屏幕阅读器、辅助技术、浏览器 200% 缩放和用户主观视觉认可仍需人工验收；不能用截图替代这些边界。
- SQLite worker 的 `SIGSEGV` 需在项目要求的 Node 版本或修复 native 运行环境后单独复测。

## 2026-09-23 续接复核

### 决定与源码对账

- 当前 `app/router.tsx` 注册 `/luna`、`/statistics`、`/budget`、`/settings/*`，未注册旧 `/ledger` 路由；`react-state.spec.ts` 明确断言旧地址不渲染账本。09-13 的 `/ledger` 入口与旧路由 replace 设计已被后续决定取代。
- `styles.css` 的 `.setup-shell` 为居中单列，`workspace-setup-visual-polish.spec.ts` 覆盖 1280px 欢迎说明在表单上方与 375px 无横向溢出。09-13 桌面双栏 Setup 设计已被后续已接受的单列欢迎页取代。
- `styles.css` 的 Web 统计网格 `align-items: start`、卡片 `height: max-content`；`budget.tsx` 仍保留紧凑趋势、可展开逐桶文字、分类钻取及前五/全部切换。`settings-interface.spec.ts` 覆盖设置首页分组与子页导航；录入、图片与宽窄屏核心路径由 `intuitive-ledger.spec.ts`、`entry-form-polish.spec.ts` 覆盖。
- 本轮截图复核发现无账本 Web 欢迎页的 `#open-secondary-menu` 仍能进入只显示 Setup 的 `/settings`，构成无效入口。现仅在该 Web 状态隐藏按钮，保留原生宿主路径；中英文 Setup 说明改为指向实际可见的恢复/连接按钮。新增回归覆盖英文和中文欢迎页、恢复页返回，以及无效按钮缺席。
- 复核中英文欢迎截图时发现 `setup-note` 的上间距被 `.setup-card > p` 覆盖，说明文字紧贴创建按钮；已提高该规则的选择器优先级，并以浏览器几何断言保证至少 16px 间距。
- 录入第一行当前是金额、分类、日期，打开弹层会聚焦金额；与 09-13 设计的箭头示意次序有文字差异。后续分类目录任务要求单一 picker 及键盘可达，未明确要求改变字段顺序。本轮保留已测试的当前交互，主观顺序偏好留给用户视觉评审，不把现有自动化视为该偏好的验收。

### 本轮检查

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过；本机 Node 20.19.2。 |
| `npm run web:build` | 通过；仅有依赖 `use client` 与大 chunk 既有提示。 |
| 宿主机 Node 20.19.2 `npm test` | 本轮复跑 `201` 项：`198 passed`、`3 failed`；三个 native SQLite worker（`ledger-store`、`profile-host`、`store`）发生 `SIGSEGV`。此为宿主机运行时结果。 |
| 主会话 Docker `./hako npm test` | `214/214 passed`；在项目开发容器内运行，作为本轮完整单元测试的通过结果。 |
| 主会话 Docker `./hako npm run test:web` | 198 项中 `190 passed`、`6 skipped`、`2 failed`。失败为账本同步用例初始化时浏览器导航销毁执行上下文，以及账户/同步用例在 8 worker 并行下超时；两条均在下方低并行复测中通过。 |
| `./hako npm run test:web -- tests/e2e/ledger-sync.spec.ts tests/e2e/server-account.spec.ts --project=chrome --workers=2` | `6/6 passed`，包含上述两条失败用例。其余 190 条在完整套件中通过。 |
| 五个受影响浏览器文件，Chrome 开发服务 | 修复前 26/26 通过，覆盖欢迎页、设置、账单响应式、录入和 reduced motion。 |
| `npm run test:web -- tests/e2e/workspace-setup-visual-polish.spec.ts --project=chrome` | 修复后 4/4 通过，含新中英文无效入口回归。 |
| `LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/workspace-setup-visual-polish.spec.ts --project=chrome` | 间距修复后的生产预览 4/4 通过。 |
| `git diff --check`、`task.py validate 09-13-web-visual-redesign` | 均通过。 |

本轮重跑了开发服务的完整 Chrome 浏览器套件；生产浏览器套件未重跑。完整套件的两条失败在低并行条件下通过，属于本轮并行执行时的偶发/负载相关表现；这不把原始完整运行记作全绿。上表 `./hako npm test` 是主会话本轮复跑；09-23 后续集成任务先前记录的生产浏览器 180/180、单元 214/214 则是其当时的历史证据，不能当作本轮修改后的测试结果。

### 新截图与人工边界

`/tmp/luna-web-visual-redesign/manifest.json` 记录 2026-09-23 的合成数据、语言、route、截图文件、已知视口宽度与 PNG 像素尺寸：英/中欢迎页为修复间距后重拍的 `1280×900`，另有 1440px 空账本与录入、1440/375px 两笔合成支出账单、768px 统计及 375px 设置。其余截图未记录视口高度，PNG 为整页截图，不能把图片高度当作视口高度。桌面账单在临时保存 toast 消失后重拍。所有记录的视口 `scrollWidth` 等于窗口宽度；截图仅供视觉复核，不代表真实财务数据。

尚未验证真实屏幕阅读器、真实设备和浏览器 200% 缩放；用户对视觉与字段次序的主观认可也未获得，需单独人工判断。此次没有执行 Electron/Android 打包或真实部署。
