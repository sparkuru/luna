# React 查询路由与组件迁移 — implementation

## Entry gate

用户已明确批准实施；A兼容性/契约和B本地UI已完成验收。共享文件保持单一写入者。

## Ordered work

- [x] B1/B2 接入 React/Query/Router/shadcn/Tailwind，维持本地 API 和 CSP。
- [x] B3 迁移首页、列表、录入/分类及隐私状态。
- [x] B4 迁移所有二级面板、导航和草稿阻止离开行为。
- [x] B5/B6 完成 Web 行为回归与视觉证据后移除被替代 DOM/CSS。

## Validation

既有 typecheck、test、web:build、test:web；重点 intuitive-ledger、privacy-and-web、accessibility、ledger-tools。

完整验收归属：AC2/AC7/AC9。以父 implement.md 定义的环境和数据隔离执行，不能将尚未新增的 scripts 当作已运行。

## Dispatch and completion

激活本子任务后再委派 trellis-implement/trellis-check，prompt 首行必须是 Active task: 本子任务路径；使用已整理 JSONL。质量检查后更新父进度和证据，人工残余门按父计划。严禁无证据宣称整个父任务完成。

## Implementation evidence — 2026-09-08

- Replaced shared renderer DOM composition with React feature components, local TanStack Query, code-based TanStack Router and validated month/type search. Both Web/Electron entry assets use external Tailwind CSS; hash history is selected for packaged/native hosts.
- Actual upstream shadcn new-york-v4 Button/Input/Dialog sources live in components/ui with upstream MIT notice. Radix modal focus semantics retained. Overlay adapted to external scroll-lock CSS because stock RemoveScroll injects CSP-blocked style elements; no script/style CSP exception added. Persistent React portal content preserves financial drafts and original revisions/heads while modal scopes close.
- Migrated setup/home/privacy/filter/entry/category, budget/statistics/settings/config-sync, S3 ledger sync/backup/conflict choice. Removed unused DOM ledger-tools.ts. Query writes distinguish committed writes from failed post-write refresh. Account screen is explicit local-only capability pending C integration.
- Root typecheck and Web build passed before C overlap; final typecheck re-run recorded at /tmp/luna-b-typecheck.log. Build /tmp/luna-b-build.log succeeded.
- All 9 financial settings/ledger sync/backup/conflict browser cases passed. Production desktop+narrow suite: 59/60 passed at /tmp/luna-b-production.log; sole new nested Escape timing failure fixed using React key handlers (native Radix effect listeners can install after first autofocus). The corrected case passed 6/6 repetitions across both sizes at /tmp/luna-b-focus.log. Draft route blocker passed 2/2 at /tmp/luna-b-blocker.log. Main/checker should run final full suite on final integrated build.
- Tests retain original financial/privacy/crypto assertions. Updated only lazy-dialog advanced-field assertion placement, aria-hidden background control query, deep-link second-page menu opening, and replaced native showModal() test hook with actual Edit action. New react-state tests cover saved-but-refresh-failed no duplicate, strict CSP/nested keyboard focus, validated search/private filters, and explicit discard blocker.
- Production SW deep-link case owned and independently verified by main session; not modified by B implementer.
- Native Electron/Android packaging/runtime and real screen-reader review remain D/human integration gates; no claim of those checks here.

Root独立检查完成：生产64/64、严格typecheck通过；详见research/review.md。
