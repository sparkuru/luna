# 当前契约与影响面

版本：2026-09-15

本文只记录本任务规划阶段从仓库确认的事实，作为 `design.md` 和执行步骤的依据。

## 1. 录入弹窗

- `src/renderer/features/entry.tsx:48-60` 在 renderer 内按语言硬编码收入/支出分类；`296-305` 又把当前快照中历史交易的分类加入候选；`550-567` 把所有候选渲染成四列按钮。因此分类数量增长会直接撑大主表单，而且候选不是设置目录。
- `src/renderer/features/entry.tsx:613-636` 同时保留可任意输入的分类文本框和选择按钮；`790-875` 的二级对话框还允许通过 `category-custom` 新建任意自由文本分类。新契约需要移除这条绕过设置目录的入口，但应保留 `choose-category`、Escape 和关闭后焦点回归的语义。
- `src/renderer/features/entry.tsx:166-205` 以交易快照初始化草稿；多拆分编辑由 `locked` 保护。分类改成稳定标识后，单拆分编辑可选择目录项，多拆分编辑锁和脏草稿行为必须保持。
- `src/renderer/features/entry.tsx:225-280` 的计算器把输入规范化后直接调用 `evaluateAmountExpression`，目前只有 `+`/`-`；等号会把整数最小货币单位格式化回输入框。增加乘除时必须让显示精度与提交精度分开，不能把浮点数放回金额边界。
- `src/renderer/features/entry.tsx:715-775` 已有附件暂存、预览、移除、Android 选图和最多 9 张的生命周期。当前浏览器分支仅给 `<label>`，并让原生 `input[type=file]` 正常占据视觉空间，截图中的 `Browse... No files selected.` 来自此处。

## 2. 共享数据与宿主边界

- `src/shared/domain.ts:37-75` 的 `SplitInput`/`Split` 字段名仍是 `category`，交易接口以字符串跨边界；`AppSnapshot` 目前只有 workspace、交易、摘要、同步和冲突/预算头信息，没有分类目录。
- `src/shared/domain.ts:132-150` 的 `DomainErrorCode` 没有分类相关错误；共享解码器要求分类是非空字符串，但不检查目录、类型或启用状态。
- `src/shared/api.ts:49-126` 的 `LunaLedgerApi` 只有 workspace、交易、预算、设置、冲突和附件方法；`src/shared/ports.ts:80-133` 的 `LocalStore` 同样没有分类用例。新增分类操作应先落在 typed API/LocalStore，再由 Electron IPC/preload、native API 和 Web API 实现，不能让 renderer 直接碰存储。
- `src/renderer/data/local.tsx:56-155` 以 TanStack Query 的 snapshot 为数据源，写入后通过 `app.refresh()` 重新读取；分类设置页应沿用这一提交后刷新契约。

## 3. 账本图、同步与备份

- `src/shared/ledger-sync.ts:14-62` 当前有 schema v1/v2，修订值只有 `transaction` 和 `budget`；`decodeRevision`、`projectLedgerDocument`、冲突和 head 校验均按这两类分支。
- `src/shared/ledger-sync.ts:237-301` 的写入以实体 head 做乐观并发校验；同一账本的分类目录适合成为一个 `category-catalog` 实体，以保留重命名、启停、删除和批量替换的因果历史。
- `src/shared/ledger-public.ts` 与 `src/shared/ledger-data.ts` 只公开交易/预算冲突。如果分类目录进入账本图，公共冲突选择器和冲突页必须同步扩展，或在有目录冲突时明确阻止目录写入；不能让 `conflictCount` 与设置页状态不一致。
- `src/main/store.ts:329-363` 和 `src/web/web-api.ts` 都从账本图投影快照；native 通过 SQLite 投影表，Web 通过序列化状态，但图是权威来源。两端都必须从同一 `CategoryCatalog` 投影分类和交易引用。
- `src/main/store.ts:625-631`、`src/web/web-api.ts:719-724` 的完整备份路径当前要求图 schema v2，`src/shared/ledger-crypto.ts` 的 envelope 版本也只有 1/2。若采用 v3 目录修订，备份加密、流式备份、恢复和同步能力门禁必须一起升级；旧 v1/v2 交易不作为本任务的迁移验收条件。

## 4. renderer 导航与展示

- `src/renderer/app/shell.tsx:380-382` 只从 `/settings/` 解析一个子页，`739-761` 只分派账本、预算、账号、同步、备份、冲突和偏好；`src/renderer/features/settings.tsx:33` 的 `SettingsSection` 也没有 categories。新增分类管理需要路由、Web 顶部标题、native/Web 设置导航和设置概览卡同时加入。
- `src/renderer/features/ledger.tsx` 的列表、详情、标题、过滤和统计入口直接渲染 `split.category`；`src/renderer/features/budget.tsx` 的分类钻取也以该字符串作为 key 和展示文本。稳定 ID 落库后，查询仍可使用 ID，但所有用户可见位置都要通过目录映射名称，并为已删除/未知 ID 提供安全回退。
- 当前 E2E（例如 `tests/e2e/intuitive-ledger.spec.ts`、`privacy-and-web.spec.ts`、`offline-and-storage.spec.ts`、`server-account.spec.ts`）直接 `fill('#transaction-category', ...)`；分类输入改为选择器后，测试夹具必须先创建/使用设置目录项，不能保留一个隐藏自由文本框来维持旧定位器。

## 5. 规划约束

1. 分类名是可编辑的用户数据，不能使用语言切换时重新生成的 label 作为交易引用；稳定 ID 是引用，name 只在展示边界解析。
2. 新交易的启用校验必须在 host/domain 层执行，renderer 过滤只是体验层；停用目录项仍要能显示/编辑已有引用，避免停用操作制造隐式数据改写。
3. 删除检查和批量替换必须在同一个宿主写事务中重检 head、交易 revision 和源分类，避免“列表显示无引用”到“删除提交”之间的竞态。
4. 上传 UI 只改变 presentation：真实文件 input、accept/multiple、暂存/取消/清理和 Android 分支继续使用现有附件契约。
5. 计算器只扩展受限表达式语言；不使用 `eval`、JS 浮点金额或把展示用的额外小数直接作为最终入账值。
