# Web 端视觉重构与响应式体验：技术设计

版本：2026-09-13

2026-09-23 续接决定：本设计的 Web `/ledger` 入口、旧路由兼容和桌面双栏 Setup
已被后续验收取代。当前注册账单入口为 `/luna`；欢迎页在所有视口采用品牌说明位于
表单上方的居中单列；新用户从欢迎页直接进入恢复或连接。具体证据见本任务
`validation.md` 与现行 frontend 规范。以下各节已按此更新。

## 1. Design Intent

Web 是本轮唯一的产品设计目标，面向桌面浏览器和较宽的 Web 窗口。它使用与其他客户端相同的后端、账号、账本、同步、权限、金额和状态逻辑，但允许拥有独立的页面壳、一级导航和信息密度。Android/iOS/mobile 保留现有 presentation surface，后续另行设计。

视觉方向保持 Luna 的月白背景、靛蓝主色、收入绿、支出棕橙和危险红；通过减少重复容器、建立内容优先的桌面栅格、统一控件层级和压缩无效空白提升质感。动效只保留状态反馈，默认低动效。

## 2. Surface Boundary

### 2.1 Presentation mode

在 Web 入口加载共享 renderer 前设置明确的 `client-surface` 标记：

- `web`：普通浏览器的 HTTP/HTTPS Web 客户端，使用本任务的新桌面 Web 壳。
- `mobile`：Capacitor Android/iOS 等原生承载的 Web 资产，保持当前移动端 presentation，暂不改导航和手势。
- `electron`：Electron file 入口，继续使用当前桌面壳，除非共享行为修复确有必要。

标记只决定 presentation，不进入 `window.lunaLedger`、账本 DTO、账号状态或远端协议。`src/web/main.ts` 在动态导入 renderer 前写入 `web` 或 `mobile`；Electron renderer 入口写入 `electron`。渲染器通过一个小型 typed helper 读取标记，避免在 feature 组件中散落平台探测。

### 2.2 Shared state boundary

- `AppContext`、TanStack Query、`window.lunaLedger`、路由 search、草稿 dirty/revision、隐私 visibility 和同步 action 保持现状。
- Web 只替换 navigation/chrome 和布局 class；不建立第二份财务 state，不在组件内重新计算总额，不把凭据或原始存储数据送入 UI。
- 所有 host/API 调用仍由现有 `shell.tsx`、`data/local.tsx` 和 feature hooks 承担。新的视觉组件接收已存在的安全 DTO 和 `message` 函数。

## 3. Web Information Architecture

### 3.1 Desktop shell (`>=1024px`)

```text
┌──────────────────────┬──────────────────────────────────────────────┐
│ Luna                 │ 页面标题                 期间 / 页面操作       │
│                      ├──────────────────────────────────────────────┤
│ 账单                 │ 页面内容                                     │
│ 统计                 │                                                │
│ 设置                 │                                                │
└──────────────────────┴──────────────────────────────────────────────┘
```

- 左侧栏是唯一一级导航，宽度使用 token（约 240–272px），`position: sticky` 而不是遮盖正文的 fixed overlay。
- 左侧栏只放品牌和三个带图标/文字的一级入口（账单、统计、设置）；记账 CTA、预算、账本切换、同步状态和账号管理不塞进一级导航，分别由账单页和设置页承载。
- 主区域顶部只放当前页面上下文、月份/期间控件和页面级次级操作。同步状态不再与账单标题竞争。
- 主区域使用稳定的最大内容宽度和响应式 gutter；页面卡片不默认等高。

### 3.2 Web fallback (`768–1023px`)

保留 Web 的桌面语义但收缩左侧栏为紧凑 top bar/可展开导航；不引入移动端 bottom tab 或手势。正文只保留一个滚动区域，所有固定/粘性元素都有对应安全间距。

### 3.3 Setup / recovery

没有 workspace 时使用简化 Web masthead（品牌和语言），恢复与连接入口位于欢迎说明区；不显示无效的设置入口、空账本选择器或占据首屏的同步状态卡。Setup 表单保留现有字段、默认 CNY、错误和恢复语义，在所有视口采用说明在上、表单在下的居中单列。

## 4. Page Composition

### 4.1 Ledger

- 页面标题区只保留“当前账单/期间”语境、月份控制和唯一的页面级“添加交易”主 action；Web 不再同时展示“记一笔支出/收入”，收入/支出由录入弹层中的类型切换完成。
- 月份切换保留页面壳并显示所选月份的 loading/error 状态；账单交易、摘要和计数只读取并展示所选月份，不能在新月份标题下暂时复用旧月份内容。
- 三个 summary card 共享同一几何、标签和 eye control；隐藏状态只改变视觉值，不改变占位或 DOM 隐私边界。
- 交易面板是首页主体，按日期分组，使用紧凑的行/卡片层级。详情、编辑、删除和图片入口继续使用现有 semantic controls。
- 空态只突出一个“记一笔”路径；过滤器默认收起并以结果状态/条件 chips 呈现。

### 4.2 Transaction entry

保留 Radix Dialog、焦点管理、dirty confirm 和现有草稿生命周期；Web 宽屏使用完整可读宽度的单一连续流程：类型、分类、金额/日期、保存，再进入更多信息。类型切换仍在表单内，收入/支出不再各自占一个同级 primary CTA。计算器横跨表单宽度作为可选展开区，更多字段、备注和附件保持渐进展开；收缩窗口自然单栏，保存区不遮挡输入。

### 4.3 Statistics

- 顶部把期间、anchor、收支和视图切换组成一条清楚的工具栏，减少多个孤立 segmented controls。
- 趋势卡使用固定的可读图表区域展示全部日/月桶；月视图用紧凑 plot 表达 30 天，不让每个桶占据 44px 以上的纵向行高。选择某个桶后仍显示现有前三笔交易明细。
- 逐桶完整文本数据放入同一统计卡中的可展开明细，不删除未来/零值语义；默认视觉层级只强调已发生数据和当前期间。
- 分类卡和最大支出卡按内容自然高度排列；桌面不使用会把右侧卡片拉到趋势卡高度的等高布局。分类钻取保留金额/日期排序和类别金额口径。
- SVG/HTML 交互继续提供 visible labels、键盘路径和 screen-reader summary，不新增重型 chart library。

### 4.4 Settings

左侧一级导航进入设置后，页面内使用紧凑的二级导航/分组列表；概览卡只呈现入口和关键状态，详细表单在子页中展开。账本、偏好（含语言）、预算、账号、同步、备份、冲突能力全部保留，危险操作与普通入口分离。“已保存在当前设备”只在设置概览的本地存储模块说明；首页只在保存/同步动作后短暂显示一条状态反馈。

## 5. Styling System

- 复用 `src/renderer/styles.css` 的 CSS variables；新增 Web shell token（sidebar width、workspace gutter、content max width、surface elevation）集中定义在 `:root`，不在 JSX 中写 raw hex 或 inline style。
- 以背景、边框和间距建立层级，减少连续嵌套白卡和过强阴影；卡片圆角沿用现有 radius token。
- 文字使用系统字体；标题、label、helper、numeric amount 使用稳定的类型尺度和 tabular figures。
- 所有按钮/链接保留 44–48px 的可操作区域、hover/pressed/focus/disabled 状态和 Lucide 图标。颜色不是唯一语义。
- Web surface 的样式必须以 `client-surface-web` 前缀或等价 scoped class 隔离，避免改动移动端既有布局；共享语义组件的必要样式才放在无 surface 前缀的公共规则。

## 6. Routing and Compatibility

- 继续复用现有 TanStack Router 路由和 search 校验；Web 一级入口映射到 `/luna`、`/statistics`、`/settings`，预算保留 `/budget` 路由并由设置工作区分组进入。
- `/ledger` 与 `/ledger/menu/*` 已不在注册路由中，不能作为兼容路由渲染；Web 侧栏按钮使用同一 `goto`，不直接改 `window.location`。
- 进入/离开设置、月份、统计期间或打开录入面板时保留 blocker、dirty 草稿、焦点返回和浏览器 back 行为。
- `client-surface` 只影响 chrome；如果 Web feature 需要新 DOM id，保留稳定语义标记并同步中英文 catalog 与 E2E locator。

## 7. Validation and Rollback

- 每个工作包先运行对应的 renderer 单测/Playwright，再进行全 Web build 和浏览器回归；截图只作为人工视觉证据，不替代行为验收。
- 关键场景用合成数据：setup、空账本、少量交易、30 天统计、设置子页、录入 dirty/attachment。
- 若 Web 壳回归导致 Electron/Android 行为变化，优先回滚 surface-specific markup/class，而不是改变共享 API 或数据协议。
- 若统计压缩难以同时满足可读性和键盘/文字替代，保留现有数据输出作为展开明细，先回滚装饰性 plot，不减少财务信息。

## 8. 用户反馈细化（2026-09-13）

后续浏览器复核确认，第一版 Web 壳仍把过多产品管理上下文放进了工作区；随后对账单首页、月份、筛选和设置入口再次复核。本轮细化采用以下呈现契约：

- Web 左侧栏只负责一级导航，不再渲染记账 CTA、第二个设置控件、账本选择器或账号/同步详情卡片。
- 账单页面拥有一个实心的“添加交易”主按钮；Web 不再渲染独立的“记一笔支出/收入”快捷按钮，类型选择统一收进录入弹层。
- 月份切换使用一个连贯的胶囊式期间控件，左右按钮保留图标和可访问名称，中间保留可直接编辑的月份输入。
- 摘要从三张高卡片压缩成带分隔线的轻量信息条；金额、独立隐私遮罩和三个稳定 ID 均保留。
- 筛选默认收起为带滑杆图标的单行 disclosure；展开后使用紧凑双列表单，条件 chips、重置、状态和结果语义不变。
- Web 设置导航使用齿轮图标，不再要求旧的三横线 `.menu-icon` 子节点；`#open-secondary-menu`、可访问名称和导航行为保持稳定。
- 工作区/账本名称、账本切换、账号状态和同步详情仍从设置进入，不在账单页面壳中重复出现。
- Web 录入弹层使用“类型 → 分类 → 金额/日期 → 保存 → 更多信息”的完整宽度流程；计算器作为该流程中的可选展开区，不再占用一列并制造无关空白。
- Web 月趋势默认以紧凑交互图表表达，逐桶数据放入同一张卡的可展开明细；分类和大额支出初始只展示前五项，并通过明确的“查看全部”操作访问其余项目。
- Web 预算不再占用一级导航位置；预算入口位于设置首页的“工作区”分组，仍可通过 `/budget` deep link 进入并保留原有编辑/冲突语义。
