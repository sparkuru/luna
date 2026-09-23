# 账单筛选体验：技术设计

版本：2026-09-17

## 1. 设计边界

本任务把账单筛选的共享查询语义、renderer 状态呈现和 Web 账单入口一起收敛。Web 是视觉验收目标；Electron/Android 继续消费同一套筛选状态和查询结果，但不复制 Web 的 surface 重排。`/luna` 是所有共享 renderer host 的唯一账单路由，旧 `/ledger` 及 `/ledger/menu/*` 不注册、不重定向。

不修改账本 schema、`LunaLedgerApi`、存储协议、同步协议或 `queryLedger` 的领域规则。查询仍然是：类型与其他条件 AND，多分类之间 OR，命中的交易只计数一次；金额按绝对值比较，日期边界包含首尾。

## 2. 数据流与状态所有权

```text
AppContext snapshot + selected month
        │
        ├─ derive category options / display labels
        ├─ build month-bounded LedgerQueryInput
        │       └─ queryLedger(snapshot.transactions, input)
        └─ render stable result + filter status + chips + list
```

- `LedgerHome` 仍是筛选 UI state 的 owner；表单的原始输入留在 renderer，不能写入 URL、浏览器历史或远端请求。
- 查询只接收 `snapshot.transactions` 中的安全字段；正则 Worker 继续只接收 `LedgerQueryRecord`，不发送附件、凭据、原始存储字节或 host-only 数据。
- 当前月边界继续作为隐含条件与用户日期条件求交。日期控件以当前月起止为 `min`/`max`，手动输入越界或起止倒置时显示可恢复错误，不静默把用户输入改成另一组查询。
- 结果汇总、`shown count` 和交易列表均从同一个已完成的 `LedgerQueryResult` 派生。顶栏月度摘要仍是整个月摘要；筛选结果金额只保留现有 detail/category totals 的可见性边界，不复制被隐私遮罩的三项首页汇总。

### 2.1 筛选评估状态

renderer 需要把“没有结果”和“尚未得到结果”分开：

| 状态 | 列表行为 | 可见反馈 |
|---|---|---|
| `ready` | 使用当前 query result | count、筛选汇总、空结果文案按实际结果显示 |
| `working` | 保留最近一次 ready 列表，避免正则 debounce/Worker 期间闪成空列表 | `role=status` 显示正在搜索 |
| `invalid` | 不把错误转换为普通 filtered-empty；保留最近一次 ready 结果作为上下文 | `role=alert` 显示日期、金额或正则错误，并给出修改/清除路径 |
| `failed` | 保留最近一次 ready 结果 | 区分超时与 Worker 不可用；切回文本模式或清除可恢复 |

第一次渲染和月份切换以当前月的无筛选结果作为稳定基线；切换月份时遵守现有 loading 边界，不能复用上一月列表。只有 `ready` 状态才更新 `transaction-count` 的筛选数量和 `filter-result-summary`。当没有任何交易时，才显示普通空账本；有交易但合法筛选命中零条时，才显示 filtered-empty。

## 3. 分类选择契约

### 3.1 选项来源与显示

- 删除筛选页要求输入 `expense:2` / `income:2` 的自由文本分类字段；筛选输入只保留目录 checkbox。
- 选项 ID 来自当前月份交易的 split category，并与当前已选 ID 合并，避免快照刷新后已选的未知/历史分类消失。
- 每个 ID 通过已有 `labelCategory(snapshot.categories, id)` 显示。存在目录定义时显示目录名称；目录缺失、已删除或历史记录不再有定义时显示 stored id fallback，仍可勾选和通过 chip 移除。
- 选项按目录定义的 `type` 分为“支出”“收入”两组；无法解析类型的 fallback 放在“其他分类”组末尾。每组保留目录 `position`，名称相同的显示仍由 ID 唯一标识。
- 类型 select 与分类分组是两个独立条件，不因切换类型自动清除分类。类型过滤继续与分类过滤 AND；已选分类集合内部继续 OR。这样不会隐藏已生效的条件，也不会改变既有 `queryLedger` 语义。

### 3.2 可访问交互

使用 fieldset/legend 和真实 label；分组标题、checkbox accessible name、选中状态和移除 chip 全部来自 en/zh-CN catalog。没有可选分类时不渲染空白大容器，而是保留清楚的无选项提示或只显示已选 fallback。选项和 chip 至少 44px，窄屏自然换行，不能依赖颜色识别选中状态。

## 4. 控件、文案与反馈

- disclosure 默认收起；未筛选时保留低强调的“可选”，有条件时显示启用条件数量，避免截图中 `data-filter-state=active` 已变色但文字仍声称“可选”。
- 可见 label 与真实语义一致：开始日期、结束日期、最小金额、最大金额。`所选月份` 和 `已用预算` 不再借用作筛选字段标签。
- 搜索 label 继续只承诺备注、商户和支付方式；分类通过目录选择，不暗示用户需要输入内部 ID。搜索值和所有用户输入通过 React text children 输出。
- chips 使用可读的分类名称、locale 日期格式和明确的最小/最大金额语义；每个 chip 是独立 button，保留清除单项和一键清除全部两条路径。
- 错误、Worker 状态、filtered-empty 和普通 empty 使用不同文案和 ARIA live region。没有结果时提供清除筛选/修改条件的恢复动作；错误时不显示“没有符合筛选条件”作为唯一解释。
- 所有新增或改名文案同时加入 `en` 与 `zh-CN`，包括可访问名称、分组标题、active count、越界日期和“筛选尚未应用”状态。

## 5. Web 视觉与响应式方案

- 继续使用现有 `client-surface-web` scoped CSS、月白背景、靛蓝 primary、收入绿、支出语义色和控制项 token；不新增远程字体、emoji、重型筛选组件或装饰动效。
- 筛选 disclosure 是交易面板内的轻量 surface，不再叠加一张占据大面积的独立白卡。展开内容使用紧凑双列：类型、日期、金额按两列排列；分类和搜索按整行排列；分组标题和选项保持低对比辅助层级。
- 输入、select、checkbox、chip、reset 和焦点环沿用现有 44px 目标与 `:focus-visible` 规则。状态色不能是唯一信息来源，错误继续使用文本和 `role=alert`。
- `1440px`/`1024px` 保持紧凑双列，`768px` 以下自然单列；`375px`/`320px` 检查 chip、中文长文案、金额和分类组不撑破容器。不能通过横向滚动解决布局问题。
- 不改变 native/Electron 的整体页面壳；公共 renderer 语义和必要的筛选控件样式保持兼容，Web-specific spacing 使用已有 surface 前缀隔离。

### 5.1 Follow-up search and transition interaction

The type selector remains a real route-backed control, but changing it is not
presented as navigation. The router update uses `resetScroll: false`; the
open disclosure and local criteria stay mounted, and the completed update
restores focus to the selector without scrolling. Category groups are derived
from the selected type, while a mismatched already-selected category remains
represented by its chip and query state.

The search row is one control group: a labelled text input and an inline `.*`
button at the trailing edge. The button is a real keyboard control with
`aria-pressed`; it communicates regex mode without adding a standalone filter
field or a second visible mode label. Date filter fields use the shared
field-level `showPicker()` behavior used by transaction entry, retaining the
native input fallback and ISO value contract.

### 5.2 Month context and reset action follow-up

- The Web ledger's visible month value is a button, not an editable month
  input. Its in-place panel uses the existing month navigation as the fast
  path, exposes year navigation plus twelve month choices, and returns focus to
  the trigger after Escape, outside dismissal, or selection. Native hosts keep
  the existing `input[type="month"]` implementation.
- Every workspace Web page owns its own heading and period context, so the
  shell omits the generic `WebPageTopbar` for ledger, statistics, budget, and
  settings. Statistics keeps its in-page anchor/date control and budget keeps
  its month label; settings has no month context. The setup topbar and native
  hosts remain unchanged.
- The full-width filter reset is a secondary surface action with an explicit
  readable ink/border pair and visible focus ring, preserving the filled-row
  layout without making the label depend on a dark background.

### 5.3 Filter control density follow-up

- On Web, the type field occupies the full filter grid row. The remaining
  controls keep the compact two-column arrangement; native hosts continue to
  use the shared form layout without Web-only grid rules.
- Empty Web filter date inputs carry a controlled empty-state marker. Scoped
  Chromium date pseudo-element rules hide only the empty format hint while
  leaving the native calendar indicator, picker API, keyboard path, and
  non-empty value untouched.
- The month trigger contains only the selected month label. Direction is
  communicated by the dedicated previous/next buttons, so a third chevron is
  not added to the trigger itself.
- The existing 8 expense and 7 income catalog entries are enough to validate
  category density. E2E uses one synthetic current-month transaction per
  catalog ID to verify readable labels, wrapping, and containment without
  changing product seed data.

## 6. 路由迁移方案

| 当前语义 | 目标行为 |
|---|---|
| `/` 且 workspace 已就绪 | shell 按启动流程进入 `/luna` |
| 账单首页 | 注册 `/luna`，继续保留 month/type search 校验 |
| Web sidebar、native brand、primary navigation、back fallback、toast 判断 | 全部以 `/luna` 为账单入口 |
| `/ledger` | 不在 router 注册；不做 alias 或 redirect |
| `/ledger/menu/*` | 全部移除旧菜单路由和 legacy map；不做兼容 |
| `/statistics`、`/budget`、`/settings/**` | 路径和 search 语义不变 |

只替换 UI route literal；`/api/v1/ledgers`、对象存储路径、领域变量和同步协议中的 `ledger` 不属于本次迁移。生产 Nginx 的应用入口白名单改为允许 `/luna`，移除旧 ledger 菜单 location；浏览器直接请求旧路径按未找到处理。更新既有 Playwright 的账单 deep link 和 URL 断言，新增 `/luna` 直接访问与旧路径未注册检查。

## 7. 验证设计

- 领域层继续运行已有 `ledger-query` 单测，并补充/保留类型 + 分类 + 日期 + 金额组合、重复 split 不重复计数和结果金额汇总断言。
- Web 增加 focused Playwright 场景：按类型、单/多分类、搜索、日期起止、金额边界和组合筛选；检查列表、count、结果汇总、chips、清除和无结果恢复。
- 视觉/可访问回归覆盖 disclosure active 状态、分类分组名称、错误/working/live-region、键盘选择、焦点环、窄屏无横向溢出和隐私 URL 不泄漏。
- 路由回归覆盖 `/luna` 直接打开、root redirect、站内导航和 back；旧 `/ledger` 及 `/ledger/menu/*` 不出现账单组件，也不注册为 router path。
- 按 frontend/web-host contract 运行 typecheck、renderer/shared tests、Web build、Playwright 和 `git diff --check`。Electron/Android 只做共享 renderer 行为边界检查，不将 Web 视觉截图当作原生验收。

## 8. 风险、回滚与兼容

- 分类目录中缺失的历史 ID 不能被过滤 UI 丢弃；选项与 selected IDs 合并、fallback chip 和清除路径是回滚前必须保留的保护。
- Worker 状态修复只改变呈现状态，不改变正则匹配算法；若 Worker 回归，可回退到 renderer 内已有的安全错误状态，但不能恢复“空数组伪装为无匹配”。
- 路由迁移是有意的不兼容变更；回滚必须整体恢复 router、shell、Nginx 和 E2E 的同一套 `/ledger` 契约，不能只恢复其中一处造成入口断裂。
- 若样式影响 mobile/native，优先撤回 Web scoped CSS；若共享查询测试失败，保留 query API 和数据协议不变，先修正 renderer 输入归一化或测试夹具。
