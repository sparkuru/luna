# 账单筛选体验

## Goal

让用户能用清楚、可预测的条件快速缩小当前月份的账单范围，并能立即看懂结果数量与筛选汇总；筛选面板的层级、控件密度和反馈方式与 Luna 当前“安静、内容优先、轻量 surface”的账单页面统一。

## Background and confirmed facts

- 用户希望继续完善账单筛选功能，检查现有遗漏并统一到用户页面风格偏好；截图显示的是展开后的 Web 账单筛选面板。当前账单实现使用 `/ledger`，本任务迁移后使用 `/luna`。
- `src/renderer/features/ledger.tsx:346-631` 已在 renderer 内维护类型、分类、关键词、日期范围、金额上下限和文本/正则模式，并通过 `queryLedger` 即时过滤当前快照；`src/shared/ledger-query.ts:87-202` 已定义类型、分类 OR、日期边界、金额边界、文本字段和正则查询语义。
- 当前月份边界会被强制加入查询（`src/renderer/features/ledger.tsx:391-419`），因此日期筛选不能越出页面当前查看月份；顶部月度摘要仍代表整个月，主动筛选的结果汇总另行显示。
- 分类选项由当前交易的 stored category id 派生（`src/renderer/features/ledger.tsx:380-390`），但 checkbox 直接渲染 id（`src/renderer/features/ledger.tsx:947-961`），会在界面显示 `expense:2`、`income:2` 等内部值。已有 `labelCategory` / `labelCategories` 可将 catalog id 投影为用户可读名称，并对旧/缺失分类保留 id fallback。
- 分类输入目前将逗号分隔文本直接并入 exact category id 查询（`src/renderer/features/ledger.tsx:400-405`）；这与交易录入已经使用分类目录选择器的交互不一致，也要求用户知道内部 id。
- 展开面板当前把日期结束字段标成“所选月份”、金额上限标成“已用预算”（`src/renderer/features/ledger.tsx:981-1003`），与真实的“结束日期 / 最大金额”语义不匹配；字段还会被大面积白色容器和较高间距放大。
- 当前 Web CSS 已规定低强调 disclosure、轻量背景、紧凑双列、语义色和 44px 操作目标（`src/renderer/styles.css:3636-3953`）；历史视觉任务也明确要求筛选默认收起、展开后保留条件 chips、重置、状态和结果语义（`.trellis/tasks/09-13-web-visual-redesign/design.md:104-117`）。
- 现有回归只覆盖 disclosure 可发现性、URL 不泄漏自由文本、空正则和查询领域单测；没有覆盖 renderer 中实际的类型/分类/文本/日期/金额/组合筛选、清除、错误状态或正则异步状态。
- 账单 UI route 当前在 `src/renderer/app/router.tsx:15-37` 注册 `/ledger` 与 `/ledger/menu/*`；`src/renderer/app/shell.tsx:135-147,381-391,419,567-572,668,821-862,958-960` 仍把它作为 root redirect、导航、返回和 Web announcement 入口；生产 Nginx 的应用入口规则在 `deploy/nginx.conf:60` 允许旧账单路径。相关 Playwright 账单 deep link/断言分布在 `tests/e2e/react-state.spec.ts:85-100,328,421`、`tests/e2e/intuitive-ledger.spec.ts:228`、`tests/e2e/entry-form-polish.spec.ts:246,267` 和 `tests/e2e/privacy-and-web.spec.ts:133`。

## Requirements

### R6. 月份上下文与筛选操作的后续修正（2026-09-17）

- Web 账单顶部的月份显示使用不可直接编辑的月份选择控件；用户通过年份和月份选项切换，保留前后月份快捷按钮，不呈现可输入的月份文本框。
- 账单页已有 hero 和月份导航作为当前月份上下文，不再重复显示通用 Web 顶栏中的“最近账单/月份”信息；统计、预算和设置页面也由各自内容承载标题/期间上下文，不再渲染通用顶栏。
- 筛选面板底部的“清除筛选”在填满整行时仍须使用清晰可读的文字、边框和焦点对比度，不能因为铺满区域而变成难以辨认的深色文字按钮。

### R7. 筛选控件与分类密度的截图反馈（2026-09-17）

- Web 筛选面板中的“类型”选择控件铺满筛选栅格整行，避免半宽控件产生孤立的视觉空白；native 布局不随之重排。
- Web 筛选日期为空时不显示浏览器的 `yyyy/mm/dd` 占位串，选中日期后仍显示实际日期，并保留日历入口、键盘编辑和共享 `DateField` 的 picker 行为。
- Web 顶部月份触发器不显示中间下拉箭头；左右月份按钮仍保留为明确的快速切换入口。
- 使用现有分类目录的合成交易覆盖多分类换行与边界，不向产品默认账本写入虚假交易或重复扩充已有目录。

### R5. Follow-up interaction corrections (2026-09-17)

- Changing the transaction type inside the open filter must be treated as an
  in-place filter update: keep the disclosure open, preserve the current
  viewport and return focus to the type control after the route search update.
- The category picker is type-aware. `all` can show both spending and income
  groups; `expense` shows only spending categories and `income` shows only
  income categories. A previously selected category from the other type stays
  active as a removable chip so the condition is never silently lost.
- Filter date fields keep native `input[type=date]` semantics but use the same
  field-level calendar opening behavior as transaction entry. Pointer fallback
  must remain available when `showPicker()` is missing or rejected, and
  keyboard editing must continue to work.
- Text search follows the familiar Find-widget model: one labelled search
  input with an inline `.*` regular-expression option button. The mode is
  represented by `aria-pressed` and accessible text, not by a detached
  text/regex checkbox row.

### R1. 查询行为保持可预测并补齐验证

- 保留当前月份范围、类型筛选、分类多选、关键词文本/正则、日期范围、金额上下限和条件组合的既有业务语义，不修改账本/API/存储协议。
- 类型与其他条件使用 AND，多分类之间使用 OR；一笔多分类交易只计数一次，金额边界包含首尾，筛选结果汇总必须与列表使用同一结果集。
- 明确 ready、加载/计算中、无匹配、无效日期或金额范围、非法正则、Worker 超时/不可用和清除后的状态；错误或暂时没有结果不能伪装成普通空账本。
- 条件变化后，结果数量、结果汇总、条件 chips 和列表内容保持一致；清除操作一次清空所有筛选条件并恢复当前月份全部交易。

### R2. 分类筛选与分类目录统一

- 分类筛选改为分类目录选择为主，移除要求用户输入 `expense:2` / `income:2` 等内部 ID 的自由文本框；分类选择与交易录入使用同一分类目录语义。
- 分类选项以当前月份出现过的分类为主，按分类目录的收支类型分组并展示可读名称；当前已选但目录缺失、已删除或历史记录不再有定义的 ID 仍保留在“其他分类”或等价 fallback 分组中，可选择、显示和移除。
- 类型与分类保持独立条件：类型与分类集合 AND，分类集合内部 OR；切换类型不隐式清空已选分类，也不隐藏已生效条件。
- 正常分类不显示 stored id；只有目录缺失时才显示可识别 fallback。分组标题、checkbox 名称、chips、移除操作和空选项提示必须有中英文文案及可访问名称。

### R3. Web 账单筛选的视觉与交互统一

- 默认收起的筛选触发器继续保持低强调；有条件时明确显示启用条件数量。展开态使用现有 token、轻量 surface、清晰分组和紧凑栅格，不形成独立后台式“大白卡”。
- 日期、金额和搜索控件使用与真实含义一致的可见 label：开始日期、结束日期、最小金额、最大金额；条件 chips 能读懂、可单项移除，并在窄屏自然换行。
- 正则检索期间保留最近一次稳定结果并显示状态，不能短暂把列表变成零条；完成、超时和 Worker 不可用分别有可识别状态和恢复路径。
- 所有控件保持键盘可达、可见 focus、至少 44px 交互区域、双语消息和无横向溢出；不使用 emoji 或新增重型组件/依赖。

### R4. 账单入口路由语义

- Web 与共享 renderer 的账单首页使用 `/luna` 作为唯一对外路由；root 启动流程、导航、页面标题语境、返回 fallback、测试和相关 deep link 保持一致。
- `/ledger` 及其旧的 `/ledger/menu/*` 页面路由不做兼容，不再注册、重定向或映射为账单入口；根路径 `/` 仍可按应用启动流程进入 `/luna`。
- 只迁移 UI route literal；`/api/v1/ledgers`、对象存储路径、领域变量和同步协议中的 `ledger` 保持不变。

## Acceptance Criteria

- [ ] 当前月份中按类型、一个/多个分类、关键词文本、日期起止、金额上下限分别筛选时，列表、shown count、筛选汇总和条件 chips 与实际结果一致。
- [ ] 任意合法条件组合使用 AND 关系、多个分类使用 OR 关系；多分类交易不会重复计数；筛选结果金额汇总与列表结果一致。
- [ ] 展开分类选项按支出/收入分组并展示分类名称而非 `expense:n` / `income:n` 内部 id；旧分类目录缺失时仍能选择、显示 fallback 并移除对应条件。
- [ ] 类型切换不会隐式清空已选分类；不匹配的类型+分类组合显示明确的合法无匹配结果，而不是丢失筛选条件。
- [ ] 结束日期、最大金额等字段的标签与实际语义一致；输入非法范围或非法正则时显示明确错误与恢复路径，不将错误状态呈现为普通“无匹配”。
- [ ] 清除筛选后所有输入、checkbox、chips、结果汇总和列表恢复到当前月份未筛选状态；筛选自由文本不写入 URL 或浏览器历史。
- [ ] 正则异步搜索期间不会把现有列表短暂误呈现为无匹配；完成、超时和 Worker 不可用时分别有可识别状态。
- [ ] 默认/active disclosure、错误/working/live-region、键盘操作和可见 focus 符合既有语义；Web 在至少 `1440px`、`1024px`、`768px`、`375px` 和 `320px` 下保持既有账单风格、无横向溢出。
- [ ] Web 工作区的账单、统计、预算和设置页面不重复渲染通用上下文顶栏；统计/预算的期间信息仍由页面内控件或标签提供，初始化页顶栏和原生壳不受影响。
- [ ] 直接访问 `/luna` 能打开账单，root redirect、站内导航与浏览器返回保持正确；`/ledger` 及旧 `/ledger/menu/*` 不再被注册为账单路由，相关旧链接按未找到页面处理。
- [ ] 运行并记录与改动范围相符的 typecheck、相关单测、Web build、筛选 Playwright 回归和 `git diff --check`；未运行项说明实际原因。

## Out of Scope

- 不修改账本 schema、查询 API、SQLite/OPFS/IndexedDB 存储、加密、同步、附件或金额/日期领域规则。
- 不把筛选条件写入 URL，不新增服务端搜索，不引入远程字体、emoji、重型筛选/表格组件或复杂动效。
- 不重做统计、设置或交易录入页面；只复用已有分类目录与视觉 token，必要时修复共享 renderer 的筛选兼容行为。
- 不对 native/Electron 进行同范围视觉重排；它们只继续消费共享查询行为和兼容的 renderer 逻辑。路由名称迁移是明确的共享入口变更，不等同于原生壳视觉重构。

## Key Decisions

- 本次以账单页当前实现（原 `/ledger`，迁移后 `/luna`）为主要视觉改造目标；共享查询行为继续兼容 Electron/Android，native/Electron 不进行同范围视觉重排。
- 分类筛选使用目录选择、按收支类型分组；去掉内部 ID 文本输入框。分类选项优先来自当前月交易，未知/历史分类保留 fallback，类型和分类条件不互相隐式清除。
- 用户确认不保留 `/ledger` 或 `/ledger/menu/*` 的兼容入口；只保留根路径按启动流程进入 `/luna` 的应用行为。
- 视觉方向沿用 Luna 已确认的月白/靛蓝、低动效、内容优先和轻量 surface；UI/UX Pro Max 检索中的 newsletter / exaggerated-minimalism 深色营销风格不适用，本任务只采用其关于渐进披露、可访问标签、无结果反馈、触控尺寸和响应式检查的通用规则。

## Risks and deferred validation

- 正则 Worker 的 timeout/unavailable 在浏览器测试环境中需要可控 fixture 或受控 Worker stub；如果运行环境不能稳定触发，应记录未执行边界并保留产品上的显式状态与恢复路径，不能降低行为要求。
- `/ledger` 无兼容是有意的不兼容迁移，必须成组更新 router、shell、Nginx 和 E2E；不会为未知旧链接增加隐式跳转。
- 筛选状态修复可能触及共享 renderer，但不应改变 query API 或财务数据协议；若 native/Electron 出现布局回归，优先隔离/回滚 Web scoped CSS。

## Technical Notes

- `design.md` 固定状态机、分类 fallback、Web surface、路由迁移和回滚契约；`implement.md` 固定实施顺序、候选文件、验证命令和 review gate。
- 复杂任务在实现批准前只维护规划 artifacts；当前阶段不运行 `task.py start`，不修改产品代码。
