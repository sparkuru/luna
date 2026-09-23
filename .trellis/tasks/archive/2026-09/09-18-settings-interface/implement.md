# 设置界面整理：执行计划

状态：implementation-complete；产品代码已随 `f40f0dd` 提交，任务文档尚未提交或归档。

## 0. 实施前门槛

- [x] 重新阅读本任务 `prd.md`、`design.md`、`research/uupm-design-system.md`，并确认只处理 Web-first 设置整理，不扩展到 Electron/Android 外壳。
- [x] 运行 `git status --short`、`python3 ./.trellis/scripts/task.py current` 和 `python3 ./.trellis/scripts/task.py validate .trellis/tasks/09-18-settings-interface`；保护已有任务目录与用户变更。
- [x] 复核 `implement.jsonl` / `check.jsonl` 已包含真实规范和研究文件；收到用户批准后运行了 `python3 ./.trellis/scripts/task.py start .trellis/tasks/09-18-settings-interface`。
- [x] 开始编码前加载 `trellis-before-dev`，读取 renderer/frontend 相关规格和项目本地开发边界。

## 1. 统一设置区域目录

候选文件：

- 新增 `src/renderer/features/settings-navigation.ts`；
- `src/renderer/features/settings.tsx`；
- `src/renderer/app/shell.tsx`；
- 如目录行为需要单测，新增/更新 `src/renderer/features/settings-navigation.test.ts`。

- [x] 定义 typed area key、path、title/help message key、group 和 Web-only metadata。
- [x] 把 `SettingsOverview` 与 `SettingsNavigation` 中重复的设置路径、分组和预算入口改为读取同一份 catalog。
- [x] 保留 router `paths` 作为独立注册清单；确认 catalog 不引入 `/settings` 之外的新 route，也不改变 `/budget`。
- [x] 保留冲突数量等动态文案在组件/`AppContext` 中计算，不能把 snapshot 或 settings value 放入静态 catalog。

退出条件：概览和二级导航共享同一份路径/分组定义，类型检查能发现漏项或无效 message key。

## 2. Web 首页与子页导航收敛

候选文件：`src/renderer/app/shell.tsx`、`src/renderer/features/settings.tsx`、相关 E2E。

- [x] 在 Web `/settings` 首页停止渲染 `SettingsNavigation`，保留页面标题、状态摘要和分组卡片作为主要入口。
- [x] 在 Web `/settings/**` 子页继续渲染分组二级导航，保留当前项、设置首页入口、`aria-current`、键盘路径和 back fallback。
- [x] Native/Android 保留当前平铺设置导航的显示方式；只共享 catalog，不引入 Web 首页隐藏逻辑到其壳层。
- [x] 检查 `#open-secondary-menu`、设置首页卡片链接、`/settings/preferences`、`/settings/sync/advanced`、`/settings/backup` 和 `/settings/conflicts` 的 locator/深链，并同步修复账号回归 locator。
- [x] 更新 `tests/e2e/react-state.spec.ts` 中从设置首页进入偏好与返回的路径，避免依赖首页不再存在的 nav button；不通过隐藏旧 DOM 冒充兼容。

退出条件：Web 首页只有一套主要入口；任意设置子页仍可横向切换并能通过 back 回到 `/settings` 再回 `/luna`。

## 3. 视觉层与文案

候选文件：`src/renderer/styles.css`、必要的 `src/renderer/i18n.ts`、`src/renderer/features/settings.tsx`。

- [x] 保留现有 Luna 轻色 token、Lucide/system font、semantic colors、focus-visible 和 reduced-motion 约束。
- [x] 保留 Web 设置首页的组标题、卡片网格、状态摘要和 action hierarchy；通过现有断点验证桌面三列、中等宽度和窄屏布局。
- [x] 保留 Web 子页二级导航的分组间距和 active/focus/disabled 状态，所有交互区域至少符合既有 44px 级约束。
- [x] 本次不需要新用户文案；现有 en/zh-CN catalog、可访问名称和状态文案继续复用，未引入 UUPM 的暗色/远程字体建议。
- [x] 检查设置表单、`<details>`、同步错误、桌面专属状态和危险确认的现有 markup 未被视觉重构破坏。

退出条件：设置首页和子页在 375/768/1024/1440px 有一致的层级、无横向溢出和可恢复状态。

## 4. 测试与质量门

- [x] 添加 focused Playwright 覆盖：设置首页分组卡片、卡片导航、子页 active nav、返回、375/768/1024/1440px overflow。
- [x] 更新 `react-state`、`server-account` 等受导航入口影响的 locator；保留同步错误时草稿、秘密字段清理和 backup/conflict 行为断言，并通过完整 Web 回归。
- [x] 为 catalog 纯函数补最小单测，默认 `npm test` 已收集并通过。
- [x] 运行 `./hako npm run typecheck`。
- [x] 运行 `./hako npm test`（211 passed）并运行 `./hako npm run web:build`。
- [x] 运行设置 focused Playwright；完整 `./hako npm run test:web -- --workers=4` 通过（114 passed、6 skipped）。
- [x] 运行 `git diff --check`、任务 context validate；8-worker 首次全量的单次账号超时已由低并发全量和独立双视口回归复核为资源争用，失败 trace/screenshot 保留在 `test-results/`。

## 5. 最终 review gate

- [x] 对照 PRD 验收项逐项检查：入口完整、URL 不变、业务能力不变、状态完整、双语/键盘/响应式/隐私边界不退化。
- [x] 使用 `trellis-check` 做 spec compliance、类型、测试、跨层数据流、复用和一致性复核。
- [x] 完成 Web 主观视觉 review：检查 1440px 首页、375px 偏好页，自动回归覆盖高级同步/备份/冲突路径；未见重复 nav、横向溢出或不可发现入口。
- [x] 按 Trellis Plus submit-ready gate 标记：自动化和本地视觉检查完成；`human-required` 残余为真实辅助技术、200% 缩放、真实设备和 Electron/Android 外壳人工复核。

## 6. 追加主页反馈实施

- [x] 在 `LedgerHome` / `LedgerMonthLoading` 移除标题区重复月份行，保留右侧月份控件和加载状态语义。
- [x] 新增独立 renderer 提示词库，使用 `MessageKey` 和可注入随机源；主页挂载时选择一次，路由重新进入时重新选择。
- [x] 更新 en/zh-CN catalog，补充简短可轮换提示语，并添加词库选择单测与主页文案/月份 E2E 断言。
- [x] 运行 typecheck、共享单测、Web build、受影响 Playwright 回归和 `git diff --check`。
- [x] 原任务的产品改动随后经用户批准，已随 UX 集成提交 `f40f0dd` 纳入版本历史；本任务记录仍待独立收尾。

## 7. 风险与回滚点

- Web 首页不再显示二级 nav 是刻意的交互变化；若用户测试显示卡片发现性不足，优先恢复首页 compact nav 或增加清晰的“所有设置”入口，不恢复两套同时竞争的入口。
- catalog 重构若导致 native 路径/文案变化，回退为 native 专用投影或只修正 Web 分支；不得为解决视觉问题改动 settings API。
- CSS 回归优先通过 Web scoped selector 回退；不要用全局规则覆盖 native/Android 的现有布局。
- 如果同步/备份 Playwright 因 selector 变化失败，先修复语义 locator 或 `aria-label`，不要隐藏旧表单或绕过实际状态。

## 8. 2026-09-23 续接复核

- [x] 确认原设置目录、导航、主页提示语及回归用例已随 UX 集成提交 `f40f0dd` 纳入版本历史；本任务目录仍独立保留。
- [x] 最终复核发现设置概览卡片拦截修饰键点击；仅让普通主键点击走客户端路由，Ctrl/Meta/Shift/Alt 等点击恢复原生链接行为，并增加浏览器回归。
- [x] 重跑类型检查、214 项单测、Web 构建、设置专项浏览器测试及受影响子集；具体结果和环境限制见 `validation.md`。
- [x] 在前端组件规范记录设置首页/子页导航职责和真实链接的修饰键行为。

收尾顺序：先提交本次修复、规范与任务记录，再由 Trellis 归档当前任务并记录会话。
