# 分类目录方案比较与选型

## 1. 需要同时满足的约束

分类必须按账本隔离；新交易只能引用当前类型且已启用的目录项；重命名不能破坏历史引用；删除要能发现全账本引用并支持逐条、多选、批量替换；目录变更要能被 native/Web 共同读取，并与账本同步/备份保持一致。

## 2. 方案比较

### 方案 A：放进全局 RendererSettings

不选。`src/shared/settings.ts` 目前承载语言、隐私和配置同步等设备/用户偏好，而分类是账本内容。放在这里会导致切换账本串目录，也无法与 `ledger_graph` 的交易引用建立同一并发边界。

### 方案 B：native SQLite 表 + Web state 字段，各自本地保存

不选作为最终方案。它能较快实现设置 CRUD，但会产生两套目录投影；当前 `LocalStore`/`WebLedgerApi` 的权威数据仍是账本图，分类无法自然进入现有加密备份和账本同步。多设备上同一交易引用还可能拿不到同名目录项。

### 方案 C：账本图中的单一 `category-catalog` 实体（选用）

选用。把完整目录作为 workspace ID 对应的一个图实体：目录项拥有稳定 `id`，以及可变 `name`、不可变 `type`、`enabled`、`position`、`deletedAt`；交易拆分继续使用现有 `category` 字段名，但其值改为目录 ID。目录 head 与交易 revision 一起做乐观并发检查，图投影成为 native/Web/同步/备份的唯一来源。

引入 `LedgerDocument` schema v3 表达新修订类型，同时保留 v1/v2 解码代码用于旧协议测试和明确的开发期重置分支；不做旧交易的逐条名称迁移。新 workspace 直接 seed v3 目录和默认分类，已有旧 v1/v2 本地状态不作为本任务的数据兼容目标。

## 3. 选定的数据与 API 契约

共享层新增以下概念（具体命名以实现时现有风格为准）：

- `CategoryDefinition`：`id`、`type: income | expense`、`name`、`enabled`、`position`、`deletedAt`。
- `CategoryCatalog`：完整目录（包括停用项和删除 tombstone），用图修订的实体 ID 绑定 workspace；renderer 快照只公开安全目录字段和 `categoryHeadIds`。
- `CategoryUsage`：交易 ID、revision、日期、类型、金额、商户/备注摘要和源拆分金额，用于设置页的处理清单；不把原始图 head 或密钥暴露给 renderer。
- typed API：创建、更新（重命名/启停）、删除、查询使用情况、批量把指定交易中的 source category 替换为同类型 enabled target category。批量 API 接收目录 head 和每个交易的 expected revision，由 host 在一个写事务中重检。

删除 API 永远在 host 再查引用：有引用返回可识别的 `category-in-use` 结果/错误，不执行隐式替换；设置页使用 usage 清单让用户逐条或勾选多条选择目标，再调用批量替换，最后重试删除。替换后若一个交易同时已有 target split，则合并两项金额并保留总额，避免产生重复同类拆分。

停用项不能被新交易选择，但编辑已有引用时仍要可见，以免停用操作强迫用户在另一个表单中隐式改账。删除保留 tombstone，防止历史分支或冲突 head 出现无法解释的 ID；只有当前有效交易引用清零才标记删除。

## 4. 默认目录与展示规则

- 新 workspace 在创建时按当时 locale seed 当前内置收入/支出分类；这些名称成为账本数据，之后切换语言不重写目录名称。
- 自定义项名称按收入/支出类型去重并有长度上限；类型不可重命名，避免把收入引用改成支出引用。
- 录入选择器按交易类型过滤 enabled、未删除项，使用搜索加滚动列表而不是把完整目录铺在主表单；设置页按收入/支出分组展示 enabled、停用和删除状态。
- 列表、详情、统计、预算和筛选内部仍按 ID 查询/聚合，但在 renderer 通过当前目录映射 name；目录缺失或冲突时显示稳定的安全回退，不把 ID 当作用户可编辑自由文本。

## 5. 目录冲突与旧数据边界

同一目录实体在同步合并时出现多 head，应复用现有 ledger conflict 管道：设置页不在冲突目录上继续写，冲突页显示目录两份候选并允许选定整份目录生成 resolution revision。这样 `conflictCount`、图 head 和设置页实际目录不会分叉。

schema v3 需要同步更新 ledger crypto envelope、server capability/version gate、流式完整备份和 restore sink。开发期已有 v1/v2 ledger 可以显式走 fresh reset（丢弃旧交易和旧目录后 seed 新目录）；不在本任务中做旧的自由文本分类到新 ID 的猜测式迁移，也不维持隐藏自由文本输入来兼容旧 E2E。
