# 原生页面与重要子流程清单

调查日期：2026-09-26。**本文件全部为只读源码调查，不是已操作证明。**
实际手机访问、截图和状态以 `page-audit.md` 为准。调查未操作 ADB、未启动
服务、未修改产品源码。目标是为逐页审查提供完整导航清单与无损边界。

## 路由与入口

`src/renderer/app/router.tsx:14` 注册 14 个路径；Android 使用 hash history。
`src/web/main.ts:23` 将原生 presentation 标记为 `mobile`；因此
`shell.tsx` 的 `isWebSurface` 为 false。原生正常工作区有 4 个主导航、中央
录入动作、8 个设置子页。原生设置总览没有分类分组，子页上方有平铺
`.settings-navigation`。下表 selectors 均针对**可见**元素；关闭后的录入
portal 会留在 DOM 中，不能把查询到元素当作弹窗正在打开。

| 注册路径 | Android 可见入口 / 标签 | 首要 selectors / 区域 | 可无损检查的交互 | 必要状态、限制 |
| --- | --- | --- | --- | --- |
| `/` | 首次启动欢迎；有账本时自动转 `/luna` | 无账本：`#welcome-title`、`#workspace-form` | 看欢迎、展开高级创建选项、进入恢复/账号再返回 | 已有账本时不能无损访问欢迎；源码会 replace 到 `/luna` |
| `/setup` | 无账本创建页的注册别名，无单独正常导航入口 | `#setup-title`、`#workspace-name`、`#workspace-currency`、`#setup-precision-summary`、`#setup-advanced`、`#workspace-precision`、`#workspace-budget` | 展开高级项、打开币种 select、观察输入/IME；不创建 | 无账本才显示 Setup；已有账本没有对应主内容（不是一个可用的新建账本入口） |
| `/luna` | 底部“最近账单”；顶部 Luna 品牌 | `#page-title`、`#month-picker`、`#previous-month`、`#next-month`、`#summary-grid`、`#transactions-title`、`#transaction-list-region` | 月切换、三个金额显示切换、筛选、交易详情/菜单、录入 | 有账本；内容状态含月加载/错误、空月、有交易、冲突提示。月份必须恢复审查基线 |
| `/statistics` | 底部“分类统计” | `#category-title`、`#statistics-anchor`、`#statistics-period-*`、`#statistics-type-*`、`#statistics-category-view-*`、`#category-breakdown` | 周/月/年、支出/收入、条形/环形、时间 bucket、分类明细及排序、最大支出列表 | 有账本；非空数据才能看完整明细；Android 趋势为完整 bucket 列表，Web 图表及 bucket select 不存在 |
| `/budget` | 底部“每月支出上限” | `#budget-editor-title`、`#budget-month-label`、`#budget-status`、`#budget-progress`、`#budget-input`、`#save-budget`、`#budget-help` | 看已设/未设/超额状态；聚焦输入观察 IME，保持原值；不保存 | 有账本；Android 页内没有 WebMonthPicker，月份从已有路由 search 继承，可先在账单切月再进入 |
| `/settings` | 底部“设置”或顶部 `#open-secondary-menu`（ARIA“打开区域”） | `#settings-title`、`.settings-overview-grid`、`a[data-settings-area]` | 打开每个卡片、滚动到底、原生返回 | 有账本正常显示 8 张卡片；没有 `.settings-navigation`；无账本时该路径退化显示 Setup |
| `/settings/ledgers` | `a[data-settings-area="ledgers"]` / “本地账本” | `#ledger-directory-title`、`.profile-directory-list`、`.profile-card` | 看当前副本/可切换副本信息；不切到真实账本、不移除副本 | 有账本；无 `window.lunaLedger.server` 时仅有当前本地标识说明；有 server 时列所有 profiles |
| `/settings/categories` | `a[data-settings-area="categories"]` / “分类管理” | `#categories-title`、`#category-name`、`#category-type`、`#save-category`、`[data-category-id]`、`#category-group-expense`、`#category-group-income` | 看两组及启用/停用状态；打开类型 select；打开重命名系统 prompt 后取消 | 有账本；添加、启停、删除、替换均写数据；使用情况弹窗无独立只读入口，见下表 |
| `/settings/preferences` | `a[data-settings-area="preferences"]` / “偏好设置” | `#settings-title`、`#settings-language`、`#hide-default`、`#settings-alert` | 看语言选项、隐私说明与控件；如切语言必须记录并恢复；隐私也直接持久化 | 有账本；select / checkbox onChange 立即写设置，没有保存按钮 |
| `/settings/account` | `a[data-settings-area="account"]` / “账号”；欢迎页 `#setup-connect` | `#server-account-title`、`#server-connection-help`、`#server-session-help`、`#server-local-copies`、`#server-account-state`、`#server-login-form` | 展开连接说明/会话说明/本地副本；密码显隐；打开 IME；不登录、登出、移除或撤销会话 | 无 server API 则只有不可用说明；有 server 未登录显示表单，已登录另显示同步 panel 与会话列表；欢迎入口无需预建账本 |
| `/settings/sync` | `a[data-settings-area="sync"]` / “账本同步与备份” | 有 server：`#server-sync-title`、`#server-sync-guide`、`#server-sync-status`、`#server-sync-mode`；无 server：`#ledger-tools-title`、`#ledger-session-status`、`#ledger-connection-details` | 展开向导/连接表单、观察 select 选项/字段、密码显隐；不提交或改模式 | server 存在用 ServerSyncPanel，否则 LedgerTools(sync)；模式 select onChange 立即写；登录、绑定、解锁、连接状态决定下方表单 |
| `/settings/sync/advanced` | `a[data-settings-area="advanced"]` / “高级同步设置” | `#settings-title`、`#sync-all`、`#sync-status-text`、`#config-sync-details`、`#config-sync-form`、`#sync-platform-note` | 展开对象存储表单、观察禁用/可用说明与底部动作；不启用、测试、保存、同步、清除 | 原生已注册且有可见卡片，**不是 Web-only**；实际 configSyncAvailable 决定字段是否禁用；此页同步显示配置，独立于账本同步 |
| `/settings/backup` | `a[data-settings-area="backup"]` / “加密备份”；欢迎页 `#setup-restore` | `#ledger-tools-title`、`#ledger-backup-details`、`#ledger-export-form`、`#ledger-import-form`、`#ledger-tools-alert` | 看说明、展开/折叠、聚焦密码、打开文件选择后取消；不导入或恢复；若只审查布局不提交导出 | 有账本显示导出和导入；无账本只有恢复；欢迎入口顶部 `#setup-back`；Android 导出可能启动真实 SAF 保存页，不能把渲染按钮当已验证保存 |
| `/settings/conflicts` | `a[data-settings-area="conflicts"]` / “冲突处理”；账单冲突提示仅说明 | `#ledger-tools-title`、`#ledger-conflicts-loading`、`#ledger-conflicts-empty`、`#ledger-conflict-inbox`、`.ledger-conflict-candidate` | 观察空/加载/失败或候选；失败时只读 retry；不点“选择 N” | 候选需要真实本地冲突状态；若当前合成账本无冲突则只能验证空态，候选详情列源码推断 |

所有设置子页都能从 `.settings-navigation button`（对应以上中文标题）
跳转；原生 BACK 将任意 `/settings/**` 返回 `/settings`，再返回 `/luna`。
统计和预算 BACK 也返回 `/luna`；主页 BACK 交回原生宿主。
交易详情/图片 Dialog 没有 ledger 层的 `luna:navigate-back`/`luna:back`
监听，而 shell 此处只判断 `entryOpen`；其实际 Android BACK 必须单独
操作验证，不能把 Esc 或关闭按钮行为当作原生返回证据。

## 账单、录入与统计的子流程

| 子流程 | 可见入口与 selectors | 可无损动作 | 状态/不可操作边界 |
| --- | --- | --- | --- |
| 摘要金额隐私 | `#toggle-income-amounts`、`#toggle-expense-amounts`、`#toggle-net-amounts` | 逐个显示/隐藏、检查前后布局，再恢复 | 仅本会话 visibility；交易、预算和统计金额仍显示 |
| 月份选择 | `#previous-month`、`#month-picker`（native `input[type=month]`）、`#next-month` | 上/下月、打开系统选择器、返回原月份 | 此控件在账单页面；Web 自定义十二月面板不适用于 Android |
| 普通筛选 | `#filter-details > summary`、`#filter-query`、`#filter-regex`、`#filter-type`、`#filter-category-options input[type=checkbox]` | 展开、文字/regex 切换、类型筛选、多分类、删 chip、重置 | 分类选项取当前月实际使用分类，空月没有完整 catalog 列表；`#filter-chips` 在 disclosure 外；重置按钮用可见 localized 文本定位 |
| 高级筛选 | `#filter-advanced > summary`、`#filter-date-from`、`#filter-date-to`、`#filter-minimum`、`#filter-maximum` | 展开、日期系统弹窗取消、填合成条件再重置、看空结果/错误 | 不写账本；日期只缩小选月；query 错误/working 时保留上次 ready 列表 |
| 交易详情 | `.transaction-main-button` / `#transaction-details-{id}` → `#transaction-detail-dialog` | 打开、滚动备注/分类/商户/付款、关闭；打开编辑不保存 | 需要合成交易；有图时才显示 `#transaction-detail-images` |
| 单行操作菜单 | `.transaction-actions-trigger` → `.transaction-actions-menu` | 展开/关闭、“编辑”→录入；有图可查看 | 不点删除；`#edit-transaction-{id}` 可稳定定位；窄屏菜单是否 compact 取 actual media query |
| 图片查看 | `#view-images-{id}` 或 `#transaction-detail-images` → `#transaction-image-dialog` | 图页数字 tab、关闭、已有失败状态 retry | 需要带合成附件的交易；无附件不能从列表验证。loading/error/成功为独立状态 |
| 记一笔 | 底部 `#primary-record`；宽 native 可能还有 `#record-expense` / `#record-income`，空账单 `#empty-record-*` | 打开 `#transaction-dialog`、切 `#quick-expense` / `#quick-income`、计算器试算、类别、日期；关闭 | Android 金额 `#transaction-amount` 为 inputMode none，预期不弹 OS 数字键盘；`.calculator-grid button` 为计算器键；不保存 |
| 分类选择 | `#choose-category` → `#category-dialog`，`#category-search`、`#category-options .category-option` | 搜索、无匹配、选择合成分类、`#close-category` | 只列当前收支类型启用分类；没有可用分类显示管理分类链接；搜索会触发真实文本 IME。选择改变草稿，不提交 |
| 更多信息 | `#transaction-advanced-details > summary` | 展开、聚焦 `#transaction-merchant`、`#transaction-payment`、`#transaction-notes`；IME/滚动可达 | 新建默认折叠；编辑已有交易默认展开；文本输入不应沿用金额的 IME 禁用 |
| 附件选择/草稿预览 | 录入更多信息里的 `.attachment-picker-action` / `#transaction-images`，`.attachment-preview-list` | 若只看原生选择页，可启动后取消；看已有合成附件缩略图 | 原生 image input 可用时走 DocumentsUI；普通 file input 分支是兼容路径；选中会 stage 草稿图，不保存不会变 committed 交易，仍需主审查约束决定是否进入 |
| 编辑/多分类锁定 | 行菜单编辑或 `#transaction-detail-edit` → `#transaction-dialog` | 观察金额/日期/更多信息，关闭 | 多 split 交易 locked，不能用单分类 editor 改；需要该种合成交易才能实际测此提示 |
| 草稿返回 | `#close-category`、`#close-transaction`、`#cancel-edit`、真实 Android BACK | 分类关闭→录入关闭→重开观察草稿 | 关闭录入保留未提交草稿；切换到不同类型/另一交易且草稿 dirty 会 `window.confirm(discardDraft)`，可取消；不要把关闭当丢弃 |
| 统计时间明细 | `.statistics-bar-row` → `#statistics-bucket-detail` | 周/月/年按钮、选择日期/月 bucket、读交易列表 | Android 为完整趋势列表；`#statistics-bucket-select`、`#statistics-bucket-previous/next`、`#statistics-trend-details` 只属于 Web 分支 |
| 统计分类明细 | 分类条目 button → `#statistics-drilldown`；`#statistics-sort-amount/date` | bars/ring 切换，选分类，排序 | 需要该 period/type 有交易；各排名初始最多 5 项，超过 5 项时显示 `#statistics-categories-toggle` 和 `#statistics-largest-toggle`，Android 也适用 |

## 设置内部重要状态

| 区域 | 首要 selectors / 展开动作 | 前置状态 / 无损边界 |
| --- | --- | --- |
| 分类重命名 | 分类卡片“重命名”→ `window.prompt(categoryName, currentName)` | 系统 prompt，不是 React Dialog；取消或原名返回不写数据 |
| 分类使用情况 | `#category-usage-dialog`、`#category-usage-select-all`、`#category-batch-target`、`#category-usage-{transactionId}` | **没有独立查看入口。** “删除”→确认→实际 delete API 拒绝 category-in-use 后才打开。未使用类别确认会直接删除；本审查不确认删除，因此此弹窗列源码推断；不替换、不删除 |
| 登录表单 | `#server-url`、`#server-username`、`#server-login-password`、`#server-login-password-visibility`、`#server-device` | server API 可用且 signed out；只看/聚焦，保持输入原样，不提交 `#server-login` |
| 本地副本列表 | `#server-local-copies > summary`、`#server-profiles-title`、`#server-profiles-removal-warning` | 可以展开；chooseProfile 会切工作上下文，remove 会删副本。保持在“移动布局测试” |
| 已登录设备会话 | `#server-sessions-title`、`#server-sessions-refresh` | 只有 account 存在才显示；刷新调用实际服务，非本轮默认无损范围；revoke / logout 不执行 |
| 同步向导 | `#server-sync-guide > summary`、`#server-sync-steps` | signed out 也可展开；查看 account → connect → action 分步骤说明 |
| 未绑定、已登录连接 | `#server-connect-form`、`#server-source`、`#server-ledger-password`、`#server-ledger-password-visibility`、`#server-local-only` | 需登录且未 bound；source 可选择远端或本地副本；connect/本地迁移不提交 |
| 已绑定待解锁 | `#server-unlock-form`、`#server-unlock-password`、`#server-unlock-password-visibility`、`#server-unlock` | account 与 binding 匹配，connected false；不提交密码 |
| 已连接同步 | `#server-sync-now`、`#server-disconnect`、`#server-sync-mode` | account/bound/connected；mode 修改即 setSyncMode；sync/disconnect 不执行 |
| 服务器偏好同步 | `#server-preferences-status`、`#server-preferences-form`、`#server-preferences-password`、`#server-preferences-enable` 或 `#server-preferences-sync/disable` | account/bound 才显示；enable/sync/disable 均实际操作，不执行 |
| 兼容账本对象存储同步 | `#ledger-connection-details`、`#ledger-endpoint`、`#ledger-region`、`#ledger-bucket`、`#ledger-prefix`、`#ledger-access-key`、`#ledger-secret-key`、`#ledger-session-token`、`#ledger-sync-password`、`#ledger-path-style` | 仅无 server API 的 sync 分支；Android 当前 host 是否进入该分支由主审查读实际状态判定 |
| 高级显示配置对象存储 | `#config-sync-details`、`#sync-endpoint`、`#sync-region`、`#sync-bucket`、`#sync-prefix`、`#sync-access-key`、`#sync-secret-key`、`#sync-session-token`、`#sync-passphrase`、`#sync-path-style`、`#remember-secrets` | 看 session-only/secure/unavailable 帮助；configSyncAvailable 决定禁用；不要测试连接或改 `#sync-all`；输入变化标 dirty，返回可能出现放弃草稿 confirm |
| 加密导出 | `#ledger-export-password`、`#ledger-export-password-help`、`#ledger-export-submit` | 有 workspace；提交可进入 Android SAF，属于额外流程，不能假定已经验证保存 |
| 导入 / 首次恢复 | `#ledger-import-file`、`#ledger-import-password`、`#ledger-import-confirm`、`#ledger-import-submit` | 已有 workspace 为 merge/import，无 workspace 为 restore；文件选择可取消；确认勾选不替代实际提交，提交不执行 |
| 冲突候选 | `.ledger-conflict`、`.ledger-conflict-candidate`、`.ledger-conflict-data` | budget / category-catalog / transaction 三种；“选择 N”直接提交 resolution，没有单独 confirm，不执行 |

## 不能误算为已覆盖的页面

- **欢迎/空工作区恢复**：当前手机已有账本；`/` 转账单，`/setup` 不能
  用作新建流程。需独立无数据浏览器上下文，明确这是模拟，不能清手机
  数据。欢迎恢复与正常备份共享组件但导出表单/文案/返回入口不同。
- **启动账本选择**：不是注册路由。`server` API 存在，初始化 profiles
  数量大于 1 时覆盖 shell，`#local-ledger-start`；当前 profile 的
  “当前”按钮仅关选择页，其他项切 profile。没有从正常导航重新打开该
  启动页的入口；不额外创建或清副本来强行覆盖。
- **Web-only 呈现**：`.web-sidebar`、Web 自定义月份面板、设置分组和
  `#settings-section-switcher`、统计 compact chart/bucket select/展开
  list、Web 可折叠 calculator。它们不是额外原生路由；排名 view-all 为两端共享。
- 设置 registry 的 `budget` 项标记 `webOnly: true`，指**设置卡片/导航项**
  仅 Web 有；`/budget` 路由仍在 Android 底部导航可见。条件分支里的
  `/settings/budget` 未在 router 注册、也不在 native SETTINGS_PATHS，
  不能作为“已注册原生设置子页”。
- 已登录/绑定/解锁/设备会话、附件、multi-split、冲突候选、平台错误均需
  特定数据或账号状态。未到达应写“源码推断/未测 + 原因”，不能从正常
  空态推定这些状态体验良好。

## 核对来源

- `src/renderer/app/router.tsx:14`：14 routes，native hash history。
- `src/renderer/app/shell.tsx:144`：root redirect；`:205`：多副本启动选择；
  `:374`：section 判定；`:405`：native BACK；`:617`：设置子导航；
  `:710`：feature 分派与 no-workspace 特例；`:834`：主导航；`:935`：
  原生/Web 设置导航差异。
- `src/renderer/features/settings-navigation.ts:38`：8 原生 settings areas，
  budget settings entry 的 webOnly 限制。
- `src/renderer/features/ledger.tsx:224`：native month controls；`:1209`：
  summaries；`:1270`：filter；`:1556`：交易入口；`:1664`：详情；`:1795`：图片。
- `src/renderer/features/entry.tsx:153`：草稿/locked/host 分支；`:547`：主
  Dialog；`:619`：type；`:643`：core fields；`:742`：mobile calculator；
  `:787`：更多信息；`:910`：分类子 Dialog。
- `src/renderer/features/budget.tsx:24`：预算；`:176`：统计；`:427`：Web
  compact plot 分支与 native list；`:582`：分类；`:696`：最大支出。
- `src/renderer/features/categories.tsx:100`：rename prompt；`:123`：删除
  确认后 category-in-use 才 openUsage；`:256`：使用情况 Dialog。
- `src/renderer/features/account.tsx:80`：本地账本；`:258`：账号；`:528`：
  同步及账号/绑定状态分支。`tools.tsx:506`：backup/conflicts/兼容 sync。
- `src/renderer/features/settings.tsx:228`：高级对象存储配置；`:425`：总览
  cards。`setup.tsx:61`：欢迎/创建；`:70`：恢复/连接入口。

以上是源码定位，不是视觉或交互结论。主审查报告应为每个可达 row 补
实际日志与截图编号；对于安全边界内不可达项保留原因。
