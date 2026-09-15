# 记账弹窗附件、计算器与分类目录：技术设计

版本：2026-09-15

## 1. 设计目标与边界

本任务把三个用户可见问题放在同一个录入域里处理：附件入口只改善视觉承载，金额计算扩展为安全的四则子集，分类则从 renderer 自由文本升级为账本级目录。Electron、Web、Android 共用同一套 domain/API 契约；surface-specific CSS 只负责表现，不复制财务状态。

旧开发数据不做名称猜测或逐条迁移。新 workspace 从带目录的账本图开始；发现旧 v1/v2 本地图时走明确的开发期 fresh reset/升级分支，清理旧交易后 seed 新目录。旧备份协议仍可在共享层保留解码测试，但不作为本次产品验收条件。

## 2. 账本目录模型

### 2.1 共享 DTO

新增账本目录类型：

- `CategoryDefinition`：稳定 `id`、不可变 `type`（`income`/`expense`）、可变 `name`、`enabled`、排序位置和 `deletedAt` tombstone。
- `CategoryCatalog`：同一 workspace 的完整目录，包含停用项和 tombstone；renderer 只收到安全字段，不收到图修订的内部 head/value 描述。
- `CategoryUsage`：设置页处理清单所需的 transaction ID、transaction revision、日期、类型、金额、商户/备注摘要和源拆分金额。
- `AppSnapshot.categories` 和 `categoryHeadIds`：当前目录投影与目录实体的乐观并发头。

交易拆分继续使用 `category` 字段名以减少跨层改名，但它在新 v3 图中明确表示 `CategoryDefinition.id`，不再表示用户输入的名称。历史/统计查询使用 ID，renderer 在展示边界通过目录映射名称；映射缺失时显示安全的“已删除分类/未知分类”回退。

默认分类在 workspace 创建时按当时 locale seed；之后切换语言不重命名账本里的目录。自定义分类按同一收支类型做名称去重并限制长度；类型不能修改，停用/恢复和重命名可以修改。

### 2.2 图与版本

新增 `LedgerDocument` schema v3，允许 `category-catalog` 修订，实体 ID 固定为 workspace ID。v3 仍使用 stored transaction/附件描述，目录修订与交易/预算修订共用现有 parent/head、碰撞、大小和拓扑校验。

- 新 workspace 使用 `seedLedgerDocumentV3`（目录根修订 + 交易/预算根修订）。
- `appendLedgerRevision`/冲突 resolution 复用目录实体的 head 校验；目录是单一实体，因此并发目录修改会形成可检测的多 head，不会互相静默覆盖。
- `projectLedgerDocument` 同时投影目录、交易、预算和冲突；有目录冲突时不返回任意一份作为可写目录。
- ledger crypto envelope、服务器 capability/version gate、attachment inventory、完整备份流和 restore sink 一起承认 v3。v1/v2 只走兼容解码或开发期 fresh reset，不做自由文本分类到 ID 的猜测迁移。

### 2.3 宿主 API

在 `LunaLedgerApi`/`LocalStore` 增加 use-case 形状的方法：

1. 创建分类；
2. 更新分类名称或启停状态；
3. 删除分类；
4. 查询分类全账本使用情况；
5. 用一个 source/target 和所选 transaction IDs 批量替换分类。

所有写方法接收目录 `expectedHeadIds`；批量替换另外接收所选交易的 expected revision。native SQLite 事务和 Web state mutate 必须在同一提交边界内完成全部校验、交易修订和目录 tombstone。任何 head、revision、source category 或 target category 不匹配都全量失败，不留下半批结果。

## 3. 分类生命周期与设置页

### 3.1 录入选择

录入弹窗从 `snapshot.categories` 过滤当前 transaction type、`enabled === true`、未删除项；主表单只显示一个只读/选择型分类字段，二级对话框提供搜索输入和可滚动分组列表。取消选择不改草稿，选择后关闭并把焦点还给 `choose-category`。移除自由文本新增表单，不能用隐藏输入绕过目录。

收入/支出切换时，如果当前分类不属于新类型或不再可用于新交易，沿用现有确认语义并清空分类；编辑已有单拆分交易时，停用的原分类仍可显示以避免停用动作隐式改账。多拆分编辑继续保持当前锁定策略。

### 3.2 设置管理

增加 `/settings/categories`，加入 Web 设置概览、Web 顶部标题、native/Web 二级导航和 i18n。新 feature 按收入/支出分组展示启用项、停用项和删除状态，支持新增、重命名、停用/恢复和删除确认。

删除流程为：

1. host 重新检查 source 分类当前有效交易引用；无引用时要求确认并追加 tombstone。
2. 有引用时返回 `category-in-use`，设置页打开 usage 清单；每行显示日期、描述、金额和当前拆分信息，并提供单条目标选择。
3. 用户可逐条处理，也可勾选多条后选择同一个 target，或使用全选批量处理。target 必须是同类型且 enabled 的其他分类。
4. 批量替换完成后重新查询 usage，再允许重试删除。取消、过期 head、部分交易已被改动或写入失败均不改变原数据。

若同一交易中 source 和 target 同时存在，host 合并对应拆分金额并保持交易总额和拆分总和；不会产生重复同类拆分。删除只在当前有效交易引用清零后完成，保留 tombstone 以解释旧冲突分支。

### 3.3 展示与查询

交易列表、详情、统计、预算和筛选仍以 category ID 做过滤/聚合，但所有用户可见文本都经 `categoryLabel` 映射一次。商户、商品/事项（若现有字段承载）、支付方式和备注继续属于更多信息；录入更多信息区域不再重复渲染一个分类字段。目录冲突时设置页禁止继续写，冲突页复用现有选择 resolution 机制选择整份目录。

## 4. 金额计算器

### 4.1 表达式引擎

扩展 `src/shared/amount-expression.ts` 的受限语法为十进制操作数和二元 `+ - * /`，输入的 `×`/`÷` 归一化为内部 `*`/`/`；不支持括号、变量或任意 JavaScript。使用 tokenizer + precedence parser 和 BigInt 有理数 `{numerator, denominator}`，乘除先在精确有理数上完成，最终再转最小货币单位。

保留已有表达式长度、操作数数量、单个操作数精度和可修复草稿限制；除零、非法/不完整表达式、分子分母膨胀和超出金额范围返回 typed error，输入内容不被清空。现有负数计算结果语义继续保留，最终交易金额仍由交易 domain 做正值/范围校验。

### 4.2 显示与入账

`evaluateAmountExpression` 继续返回按账本 precision 舍入后的 canonical minor units；`inspectAmountExpression` 额外返回展示用结果。展示至少保留三位小数（或当前账本精度更高时保留账本精度），若三位之后仍有余数，就把下一位放在括号中：`10 ÷ 3 → 3.333(3)`。括号只表示舍入参考，不参与输入语法。

等号后金额输入仍写入可提交的账本精度值，例如精度 2 时是 `3.33`；旁边的 aria-live/helper 同时显示 `3.333(3)` 和“最终入账 3.33”。精确结果不显示误导性的括号。舍入使用 BigInt 的明确 half-up 规则，负数采用与现有结果一致的符号处理。

### 4.3 控件

计算器按钮加入乘法和除法，按钮文字用 `×`/`÷`，aria-label 清楚说明运算；运算符、退格、清除、等号的视觉层级沿用现有 token。Web 的可选 disclosure、native 的可见 calculator、键盘 Enter 求值和低动效状态保持不变；结果提示使用 `role="status"`，不抢焦点。

## 5. 附件入口

把当前默认文件控件替换为共享的自定义 upload surface：图标、主文案、格式/数量辅助文案和状态插槽放在带 Luna 边框/背景/间距的卡片内；有图片时在同一卡片下方显示预览和逐项移除操作。浏览器保留真实 `input[type=file]`，采用 visually-hidden 而非可见的默认文件名控件，label 仍支持键盘/触控打开系统 picker；Android 分支用同样的视觉容器承载系统选图按钮。

无图片、处理中、部分失败、达到 9 张、已有交易和关闭未保存弹窗的现有生命周期不变。只增加计数/状态可见性和 CSS，不改变 JPEG/PNG/WebP 校验、原图规范化、暂存、提交、取消清理和错误恢复。

## 6. 共享 renderer 约定

- `AppContext` 仍是 snapshot/settings/refresh 的入口；分类写入成功后先提交再 `app.refresh()`，不在组件里维护第二份目录。
- 新增中英文 MessageKey；表单错误、删除引用、并发过期、空目录、目录冲突和最终入账提示都走现有 `errorMessage`/i18n 边界。
- 不使用 inline raw color、`eval`、浏览器默认文件输入视觉、隐藏自由文本后门或未经类型保护的 JSON。
- CSS 复用现有变量，公共附件/计算器/分类选择规则与 `.client-surface-web` 的 Web 特化规则分开；保留 focus-visible、44px 操作区、Escape/back 和 reduced-motion。

## 7. 失败处理、并发与回滚点

共享图/金额单测先于 renderer；目录 API 先覆盖 host/Web 的全量提交边界，再接设置界面。若 v3 同步/备份门禁影响既有 attachment 流，保留 v1/v2 兼容解码并把失败限制在新目录写入/恢复路径，不通过放宽校验来“修复”失败。若新分类 UI 视觉回归，优先回滚 surface markup/CSS；目录 ID、host 校验和图版本不能被回滚成自由文本。
