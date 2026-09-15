# 记账弹窗附件、计算器与分类目录：执行计划

状态：已完成（2026-09-15）。实施已获得批准并完成，任务当前进入提交/归档阶段。

完成摘要：共享账本图升级为 v3 分类目录；native/Web 新建交易仅接受启用且同类型的分类；设置页支持新增、重命名、启停、引用清单和逐条/多选/批量替换后删除；计算器支持四则运算及额外循环小数提示；上传入口改为 Luna 风格 surface；月份切换保留稳定加载 frame，录入日期默认本地今天。

验证摘要：`npm run typecheck`、`npm run server:typecheck`、`npm run web:build`、`git diff --check` 通过；共享/Web/同步测试 160 项通过；录入、分类和加密恢复 Chrome 回归 3 项通过；生产离线/更新回归 6 项通过；完整 `npm test`/`npm run api:check` 仍受当前环境 `better-sqlite3` SIGSEGV 限制，详见收尾记录。

## 0. 启动与基线

- [ ] 获得本规划摘要的实施批准后，运行 `python3 ./.trellis/scripts/task.py start .trellis/tasks/09-15-entry-form-polish`，确认 task 状态与工作树只包含本任务允许的变更。
- [ ] 运行 `git status --short`、`git diff --stat`、`python3 ./.trellis/scripts/task.py current`，保护已有 dirty 基线和其他 Trellis 任务。
- [ ] 再读本任务 `prd.md`、`design.md`、`research/current-contract.md`、`research/category-catalog-design.md`，并按 manifest 核对 frontend/backend/guides 规范。
- [ ] 记录现有 Web/native 测试入口、设置路由、附件 locator、计算器行为和 workspace 初始化结果，作为回归基线。

## 1. 共享分类契约与图 schema

责任范围：`src/shared/category-catalog.ts`（新文件）、`src/shared/domain.ts`、`src/shared/api.ts`、`src/shared/ports.ts`、`src/shared/ledger-sync.ts`、`src/shared/ledger-public.ts`、`src/shared/ledger-data.ts`。

- [ ] 定义 `CategoryDefinition`、`CategoryCatalog`、`CategoryUsage`、创建/更新/批量替换输入和分类错误码；名称、类型、ID、启停、tombstone、同类型去重和长度边界在 shared decoder 统一校验。
- [ ] 给 `AppSnapshot` 增加目录安全投影和 category head；交易 `category` 字段在新契约中明确存 ID，避免把名字当引用。
- [ ] 将账本图扩展为 v3：加入 workspace 对应的 `category-catalog` 修订，补齐 decoder、head/parent 校验、projection、merge、resolution、大小限制和 attachment inventory；保留 v1/v2 的明确兼容/重置路径。
- [ ] 扩展 public conflict 与 conflict choice，使目录多 head 不被任意投影；冲突页可以选择整份目录 resolution，目录冲突期间目录写入必须停用。
- [ ] 为新 workspace 提供按创建 locale seed 的默认目录；locale 后续变化不重写目录名称。
- [ ] 在 `src/shared/category-catalog.test.ts`、`src/shared/domain.test.ts`、`src/shared/ledger-sync.test.ts`、`src/shared/ledger-v2.test.ts`、相关 crypto/full-backup 测试中覆盖：合法/非法目录、ID 稳定性、重命名不改引用、v3 merge/conflict、tombstone、旧版本 fresh reset、备份解码和目录 head 乐观锁。

退出条件：shared 层能构造带目录的 v3 图，能投影目录和交易 ID，并能拒绝坏目录、跨类型引用、冲突 head 和旧协议的隐式迁移；金额/附件既有单测不改变语义。

## 2. native/Web 宿主与原子分类用例

责任范围：`src/main/store.ts`、`src/main/local-api.ts`、`src/main/ipc.ts`、`src/preload.ts`、`src/shared/ipc.ts`、`src/web/web-api.ts`、schema/migration 代码和 host tests。

- [ ] SQLite 和 Web state 初始化都使用 v3 seed；现存开发期 v1/v2 图走 fresh reset，丢弃旧交易/旧自由文本分类，不做猜测式名称迁移，并把状态版本明确写入迁移日志/错误路径。
- [ ] 实现 `createCategory`、`updateCategory`（重命名/启停）、`deleteCategory`、`getCategoryUsage` 和 `reassignCategory` 的双端 API/IPC/preload 映射；renderer 不直接访问 SQLite、IndexedDB 或 graph revision。
- [ ] `create/update transaction` 在 host 验证分类 ID 属于当前 workspace、类型匹配且对新交易 enabled；编辑已有停用引用时保留兼容性；多拆分锁定规则继续有效。
- [ ] 删除先在同一写边界重查非删除交易引用；有引用返回 `category-in-use` 和可供 UI 查询的使用清单，不删除、不自动替换。
- [ ] 批量替换要求同类型 enabled target、目录 head、每个交易 expected revision 和 source 仍存在；所有校验通过后才一次提交所有交易 revision，source/target 重合时合并拆分金额并保持总额。
- [ ] 把 category catalog 纳入 ledger crypto、server version/capability、full backup export/import、streamed restore 和 sync merge；恢复/同步后 `getSnapshot` 与 usage 查询看到同一目录。
- [ ] 增加 native/Web API/store tests：新建 workspace 默认目录、切换账本隔离、创建/重命名/停用/恢复/删除、引用阻止删除、逐条/多选/全选批量替换、并发 stale 全回滚、目录冲突和 backup/sync round trip。

退出条件：同一组分类用例在 native store 和 Web state 上行为一致；删除/批量替换在竞态或失败时没有半批写入；新交易无法绕过 enabled/type 检查。

## 3. renderer 分类选择与设置管理

责任范围：`src/renderer/features/entry.tsx`、新建 `src/renderer/features/categories.tsx`、`src/renderer/features/settings.tsx`、`src/renderer/app/shell.tsx`、`src/renderer/data/local.tsx`、`src/renderer/features/ledger.tsx`、`src/renderer/features/budget.tsx`、`src/renderer/i18n.ts`、`src/renderer/styles.css`。

- [ ] 删除 entry 中硬编码/历史拼接分类和自由文本 custom form；主表单使用只读选择字段，二级 dialog 用 type filter、搜索、可滚动列表和稳定 locator；保留 choose button、Escape/back、焦点回归、脏草稿、收入/支出切换、多拆分编辑锁。
- [ ] 对 `snapshot.categories` 做 enabled/type/未删除过滤；没有启用分类时显示明确空态和前往设置的入口，不允许保存无目录 ID 的新交易。
- [ ] 添加 `/settings/categories` 路由分派、Web 顶部标题、设置概览卡和 native/Web 导航；新页面按收入/支出分组展示启用/停用项，支持新增、重命名、停用/恢复和删除。
- [ ] 实现有引用删除的 usage dialog：显示全账本交易清单、每条 target select、checkbox 多选、全选、批量 target、重新查询和删除重试；清晰显示 stale/失败/取消且不丢选中草稿。
- [ ] 在 ledger/budget/statistics/filter 的展示边界复用 category label map；ID 只用于 key/query，名称只从目录读取；已删除/冲突/未知 ID 使用安全回退。分类在列表/详情显示一次，更多信息不新增重复分类字段。
- [ ] 补全中英文 message key、错误映射、空态、加载、删除确认、引用处理、冲突和最终入账提示；不以 locale 切换重命名账本目录。
- [ ] 保持 `AppContext`/TanStack Query source-of-truth；分类 mutation 成功后走现有 committed-write + `app.refresh()`，不在组件内保存第二份财务目录。

退出条件：录入只能选择设置中当前启用的同类型分类；分类数量增大仍可搜索/滚动；重命名即时反映在列表、统计、搜索和详情；引用分类不能直接删且能逐条/多选/批量处理。

## 4. 金额表达式与计算器

责任范围：`src/shared/amount-expression.ts`、`src/shared/amount-expression.test.ts`、`src/renderer/features/entry.tsx`、相关 i18n/CSS。

- [ ] 把 operator 类型、normalizer、parser 和 evaluator 扩展到 `+ - * /`；`×`/`÷`只作为输入/按钮显示符号，内部使用受限 canonical token；继续拒绝任意代码、输入括号和未完成表达式。
- [ ] 使用 BigInt 有理数完成乘除与标准优先级，统一处理除零、操作数/长度/分母膨胀、范围和精度错误；保留现有精确加减与负数结果测试。
- [ ] 让 inspect 结果同时提供按账本 precision 舍入的提交值和展示值：展示至少三位小数，余数存在时显示下一位括号提示，例如 `10 ÷ 3` 为 `3.333(3)`；等号写入最终可提交值，不把展示提示写入交易。
- [ ] 计算器加入 `×`/`÷`按钮并重新检查 4 列/窄宽布局、operator/equals 视觉状态、Web disclosure、native 展开、Enter 求值、aria-live 结果和 reduced-motion。
- [ ] 单测覆盖 `2×3+4`、混合优先级、有限/循环小数、`3.333(3)`、账本精度舍入、负数既有语义、除零、重复操作符、不完整表达式、输入上限和大数边界；更新 entry E2E 不依赖具体浮点显示。

退出条件：计算器展示可解释的额外精度，保存值按账本精度稳定落成整数最小单位；错误不清空可修复表达式。

## 5. 图片上传视觉层

责任范围：`src/renderer/features/entry.tsx`、`src/renderer/styles.css`、附件相关 renderer tests。

- [ ] 将默认可见 file input 改为带图标、主文案、格式/剩余张数和状态插槽的 Luna upload surface；实际 input 保留 `accept`、`multiple`、disabled 和 keyboard/system picker 语义，使用 visually-hidden 隐藏默认文件名控件。
- [ ] Android 系统选图按钮复用同一容器；无图片、处理中、预览、达到 9 张、部分失败和已有附件编辑状态在同一视觉层级内表达。
- [ ] 保持现有 staging、规范化、预览 object URL、逐项移除、关闭清理、取消 picker 和附件错误恢复；不改变附件 API/安全边界。
- [ ] 用 Web Playwright 检查鼠标/键盘/触控入口、`#transaction-images` setInputFiles、预览/删除、关闭未保存和 narrow viewport；人工截图记录新 upload surface，不以默认浏览器控件作为证据。

退出条件：截图中的 `Browse... No files selected.` 不再是主要视觉内容，且附件数据流和 native/Web 行为无回归。

## 6. 综合验证与反馈回合

- [ ] 先运行 shared/host focused tests 和 `npm run typecheck`，再跑 entry/category focused Web tests；失败时区分协议、宿主、renderer 和测试夹具问题。
- [ ] 运行 `npm run web:build`，并按 Web-first 约定运行 Chrome 和 narrow viewport focused suites；覆盖 setup、空目录、少量/大量分类、设置 CRUD、引用处理、录入、计算器、附件和详情展示。
- [ ] 运行完整 `npm test`、`npm run test:web`；若出现既有 native/server worker `SIGSEGV`，单独记录失败用例和环境证据，不把它误判为功能通过。
- [ ] 运行 `git diff --check`、`git status --short`，检查变更只涉及本任务；必要时查看 `/tmp/luna-entry-form-polish/` 的 entry/settings/usage/attachment 截图，记录 viewport、locale 和数据夹具。
- [ ] 最终核对 PRD 每一项验收：新交易目录约束、rename/delete 引用流程、展示不重复、`3.333(3)` 结果、上传状态、Web/native/ARIA/focus/reduced-motion。

## 7. 回滚与风险控制

- [ ] shared v3/分类 ID 先通过测试后再接 renderer，避免 UI 先写入无法同步的格式。
- [ ] 如果 v3 sync/backup 影响旧 attachment 流，保留旧 decoder 和隔离的 fresh reset，不放宽 graph/crypto 校验。
- [ ] 如果批量替换无法证明原子性，先收窄为宿主单事务和明确失败，不提供会逐条半提交的 UI。
- [ ] 如果视觉改动影响 mobile/Electron，只回滚 surface-specific markup/CSS；不把默认 file input 或自由文本分类作为隐藏兼容后门恢复。
