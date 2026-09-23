# 账单筛选体验：执行计划

状态：in_progress；产品实现与自动化质量检查已完成，待按 Trellis Phase 3.3/3.4 完成最终提交与归档。

## 执行记录（2026-09-17）

- 已完成筛选目录化、月份边界、类型/分类组合、关键词/正则、日期/金额校验、稳定结果状态、chips、清除和 Web 响应式样式。
- 已完成 `/luna` 路由迁移；旧 `/ledger` 及 `/ledger/menu/*` 未注册、未重定向、未缓存，API `/api/v1/ledgers` 未改动。
- 已按后续截图反馈修复筛选交互：类型切换使用 `resetScroll: false` 并恢复类型控件焦点；分类组随收入/支出类型收窄但保留异类型已选条件 chip；日期筛选复用共享 `DateField` 的 `showPicker()` 与 native fallback；搜索改为输入框内的 `.*` `aria-pressed` 模式按钮。
- 通过：针对筛选/日期/空正则用例 Chrome 3/3、Chrome-narrow 3/3；使用合成记录截图复核 1440px 搜索组合和收支分类分组。
- 通过：`npm run typecheck`、`./hako npm run typecheck`、共享筛选/i18n 测试、`npm run web:build`、`./hako npm run build`、`git diff --check`。
- 通过：相关 Web 回归 36 项、最终构建包生产路由/离线/筛选回归 3 项，筛选用例 Chrome 与 Chrome-narrow 各 1 项。
- 追加修复：`SQLiteLocalStore.resetLegacyLedgerIfNeeded()` 按 `revisions → splits → transactions` 清理，满足 `foreign_keys = ON` 下的父子表删除顺序；修复后 `./hako npm test` 为 209/209 通过，legacy 定向测试为 6/6 通过。
- 宿主直接测试仍不作为有效门禁：当前 Node 为 20.19.2，而项目及 `better-sqlite3@13.0.3` 要求 Node 22；直接加载原生模块退出码 139。Node 22 hako 环境已通过类型检查与全量测试。
- 质量审查未发现当前任务需追加的代码问题；全量 Web 的 2 个 Chrome 失败属于并发/页面清理时序，相关 narrow 用例通过；人工键盘/读屏/reduced-motion 仍未执行。
- 追加修复（截图反馈）：Web 月份导航改为不可直接编辑的按钮式月份选择面板，支持年份/月份选择、Escape/外部关闭和无滚动回焦；账单页移除重复的通用 Web 顶栏；全宽“清除筛选”改用可读的 surface/ink 对比度。
- 追加验证：`npm run typecheck`、`./hako npm run typecheck`、`npm run web:build`、相关 Web Playwright Chrome/Chrome-narrow 共 60 项和 `git diff --check` 通过。
- 追加修复（工作区上下文反馈）：统计、预算、设置页面同样不再渲染重复的通用 Web 顶栏；统计/预算保留页面内已有的期间上下文，初始化页顶栏与原生壳不变。
- 追加修复（最新截图反馈）：Web 类型筛选控件铺满整行；空日期字段隐藏浏览器 `yyyy/mm/dd` 提示但保留 native picker/键盘路径；月份触发器移除中间下拉箭头。新增 15 个现有目录 ID 的合成交易回归，确认分类标签可读、可换行且无横向溢出；未修改产品默认分类或写入真实账本数据。
- 追加审查（2026-09-23）：新增受控浏览器 Worker stub 回归，分别使搜索 Worker 构造失败和持续不响应；验证 `failed` 错误文案、`role=alert`、旧结果保留、超时前 `role=status` working 文案，以及切回文本/清除后的恢复。新增键盘回归，覆盖筛选 disclosure、搜索、正则按钮、类型、分类 checkbox、高级条件、金额、日期字段焦点、chip 移除、清除及 reset 的 focus-visible。Chrome 定向 3/3 通过；`./hako npm run typecheck`、`git diff --check` 通过。仓库未定义 lint 命令。
- 仍需人工/平台确认：真实读屏器的宣读顺序、reduced-motion 的人工视觉检查、真实 Electron/Android 与打包桌面的视觉表现。日期字段由原生控件处理，自动化仅验证键盘可聚焦及键事件路径；完整的分段日期输入还需真实键盘操作复核。Worker 测试覆盖受控构造失败/无响应，未模拟所有浏览器级 Worker 异常。

## 0. 启动与基线门禁

- [x] 在启动前确认 `git status --short`、当前任务仍为 `09-17-ledger-filter-experience`、既有 dirty 文件不属于本任务；不覆盖用户在 `Dockerfile`、`hako`、`.trellis/spec/trellis-plus/index.md` 和 `src/renderer/features/entry.tsx` 的修改。
- [x] 核对本任务 `prd.md`、`design.md` 和 implement/check manifests，以及 frontend component/state/quality/web/type-safety、cross-platform、code-reuse 和 deployment 规范。
- [x] 先由用户批准本规划摘要，再运行 `python3 ./.trellis/scripts/task.py start .trellis/tasks/09-17-ledger-filter-experience`；在此之前不修改产品代码。

## 1. 筛选状态与分类目录

候选文件：`src/renderer/features/ledger.tsx`、`src/renderer/category-display.ts`（仅在确有复用缺口时）、`src/renderer/i18n.ts`、必要的共享/renderer focused tests。

- [x] 去掉 category free-text state/input/query 拼接；以当前月交易 split IDs 加上 selected fallback IDs 派生选项。
- [x] 按 `CategoryDefinition.type` 分组、按 catalog position 排序、用 `labelCategory` 展示名称；无法解析的历史 ID 保留 fallback 和选择/移除能力。
- [x] 明确类型与分类的 AND/OR 组合和切换类型时不清空分类的行为；保持 queryLedger 结果去重。
- [x] 将日期/金额/搜索 label、active filter count、分类组、错误和恢复文案补齐 en/zh-CN；chips 使用 locale 日期和真实字段语义。
- [x] 把 query 评估改为显式 ready/working/invalid/failed，正则 Worker debounce、timeout、unavailable 和非法输入期间不闪成 filtered-empty；只有 ready 更新 count/summary。
- [x] 清除操作同时清空类型、目录分类、搜索、日期、金额和 regex mode；确保 chips、列表和汇总回到当前月未筛选基线。

退出条件：共享查询输入仍符合既有领域语义；可读分类目录、fallback、错误、清除和 Worker 状态在 renderer 中有稳定语义标记。

## 2. Web 筛选 surface

候选文件：`src/renderer/styles.css`、必要的 `src/renderer/features/ledger.tsx` markup。

- [x] 保留轻量 disclosure 和现有 token；收紧展开态的 surface、间距和字段层级，消除截图中的大面积空白白卡感。
- [x] 为分类收支组、状态文本、chips 和 reset 建立紧凑而不拥挤的布局；保持 44px 目标、可见 focus、语义 HTML 和 reduced-motion。
- [x] 在 1440/1024/768/375/320 宽度检查双列到单列、中文/英文长文案、金额和 chips 换行，禁止横向溢出。
- [x] 仅使用 Web scoped 规则；检查 native/Electron 不出现 Web 壳或不必要的布局改变。

退出条件：Web 账单筛选与已有月白/靛蓝页面层级一致，默认收起、active 状态和错误/空态可发现。

## 3. `/luna` 路由迁移

候选文件：`src/renderer/app/router.tsx`、`src/renderer/app/shell.tsx`、`deploy/nginx.conf`、受影响 `tests/e2e/*.spec.ts`。

- [x] 把账单 route 注册、root redirect、sidebar/brand/primary navigation、back fallback 和 Web announcement 判断统一改为 `/luna`。
- [x] 移除 `/ledger` 和 `/ledger/menu/*` route 注册及 legacy target 映射；不添加 alias、redirect 或兼容页面。
- [x] 更新 Nginx Web 应用入口规则，只允许 `/luna` 作为账单 HTML 入口；不要修改 API/object-storage 中的 domain ledger path。
- [x] 更新既有 E2E deep link 和 URL assertions，新增 `/luna` 直接入口、root redirect 和旧路径不呈现账单的回归；验证 browser back。

退出条件：直接访问 `/luna` 可进入账单，所有站内账单入口一致，旧账单路径未注册且生产入口按未找到处理。

## 4. 行为与视觉验收

- [x] 新增/更新 focused Playwright fixture，覆盖类型、单/多分类、关键词、日期、金额、组合、结果汇总、清除、无结果和错误恢复。
- [x] 覆盖正则：空 query 不启动搜索；working 期间不闪空；完成、非法、timeout、Worker unavailable 分别可识别并可恢复（timeout/unavailable 已用受控 Worker stub 故障注入验证）。
- [x] 用键盘完成 disclosure、select、分类 checkbox、金额输入、chip 移除和清除；检查日期字段键盘焦点/键事件、`role=status`/`role=alert` 和 focus-visible。原生日期分段输入及真实辅助技术宣读仍列为人工边界。
- [x] 检查筛选自由文本不会进入 URL/history；检查 category raw ID 不作为正常目录 label 暴露，fallback 仅在目录缺失时出现。
- [x] 记录关键视口的浏览器证据到任务验证目录或 `/tmp`，证据只使用合成账本，不写入真实财务数据。

## 5. 质量门禁

按改动范围运行并记录实际结果：

```text
./hako npm run typecheck
./hako npm test
npm run web:build
npm run test:web
git diff --check
```

如 shared renderer 或部署改动影响更广，再按 frontend quality/deployment contract 追加 `./hako npm run build`、server/typecheck 或 Electron smoke；未运行项必须记录实际原因。生产 Web preview、真实 Android/Electron、真实辅助技术和用户视觉验收是额外边界，不用未执行的检查冒充通过。

## 6. 实施顺序与回滚点

1. 先完成筛选 state/category/i18n 的最小行为修复，运行 shared/typecheck 与 focused Web 回归。
2. 再完成 Web scoped CSS 和 responsive/keyboard 检查；若出现原生 surface 回归，先回滚 scoped style/markup，不改 query/API。
3. 完成 `/luna` route、Nginx 和既有测试的成组迁移；route 变更必须同时更新注册、所有入口和验证断言。
4. 最后运行全范围质量门禁，检查 diff 只覆盖本任务产品文件和任务规划文件；发现路由部分无法与部署入口同步时，暂不提交半迁移状态。
5. 若需要回滚，按设计文档整体恢复 route 契约；不执行 `git reset --hard` 或覆盖其他 dirty 文件。

## 7. 完成前人工 review

- [x] 对照 PRD 每条 acceptance criterion 逐项记录证据或未验证原因；见 `validation.md`。
- [x] 复核中英文文案、未知分类、类型/分类组合、隐私边界、空/错误/loading 状态和浏览器 back；自动化证据及人工边界见 `validation.md`。
- [x] 运行 `git diff --check`，确认没有把 `/api/v1/ledgers` 等领域路径误改成 `/luna`。
- [ ] 质量检查通过后再按 Trellis finish 流程更新必要规范、提交并归档；当前规划阶段不执行这些完成步骤。
