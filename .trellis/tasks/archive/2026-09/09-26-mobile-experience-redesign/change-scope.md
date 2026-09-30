# 差异归属与提交边界

原实施前21个tracked dirty以
`/tmp/luna-mobile-redesign-implementation-baseline.patch`保存；第二/三轮
各有对应baseline。没有reset、覆盖原用户修改或把旧同步修复当作这次
新改版。统计箭头最终源码冻结后已再次逐文件段核对：原21项中12项
逐字节不变、9项混合；新增10项tracked差异与4个e2e文件。当前没有stage/commit。

## 改版本轮范围

新增tracked差异：frontend/state-management spec；features account、
budget、categories、server-i18n、settings-navigation、setup、tools；
renderer/ledger-tools-i18n。完整职责见三个child实施/检查报告。
最终原生月份修正还新增tracked差异 components/month-picker.tsx，
共享 NativePeriodInput 和 NativePeriodNavigator 仅由 mobile 分支采用；
统计箭头追加只改该共享文件、budget、styles、i18n两项必要周标签及
mobile-period-header测试，账单产品文件未再次更动。

与继承修改混合：frontend/android-runtime、component-guidelines；
renderer/app/shell、features/entry、ledger、settings、i18n、styles；
tests/e2e/android-entry-layout。不能以“整文件全部属于本任务”来暂存。

新风险测试：mobile-ledger-redesign、mobile-statistics-budget、
mobile-settings-recovery、mobile-period-header 四个e2e文件。
父/三个child任务文档是本轮工件；
其它既有untracked task目录保留，不能无差别git add全部目录。

## 继承差异保持原字节

与实施前patch各文件段逐字节比较，以下尚未被本轮改动：
backend/ledger-sync-guidelines；src/sync/server-host；src/web/index.html、
main.ts；e2e intuitive-ledger、offline-and-storage、router-offline、
server-account、ux-mobile-navigation；server-sync profiles、remote-probe、
transitions tests。这些保留在工作树但不列为本轮新增实现。

## 生成物与后续评审

APK、captures图库/验证脚本/合成备份、浏览器失败工件与缓存保持ignored，
不提交。没有读写签名私钥、真实账号秘密或其它ADB设备。若进入提交，
必须先完成最终human review gate，再检查显式候选路径/混合hunks，
不一并提交未核对的继承后端修改或protected Trellis运行脚本。

## 2026-09-30 工作区复核

本轮 `git diff` 显示 36 个 tracked 路径有变化，另有 60 个 untracked 路径，
包括 4 个移动端 E2E 文件、多个 task 工件目录和 SQLite restore 报告。既有
移动改版新增内容，也包含原先的 dirty baseline 路径。布局任务还增加
`src/sync/server-host.ts` 与 server-sync 测试差异；本次 Android AVD 复验另修正
`scripts/smoke-android.ts`、`scripts/android-image-picker-smoke.ts` 与
`scripts/android-backup-smoke.ts` 的移动端选择器。不能照旧版按路径 `git add`。

先前记录的 `/tmp/luna-mobile-redesign-implementation-baseline.patch` 当前
不存在，原始21路径的字节级起点无法在此工作区重放。提交时必须先恢复或
重建可验证的基线，再逐hunk确认需要提交的改版差异；如无法重建，整组源码
保持 unstaged，不能把此前 task 的 dirty 内容猜成当前任务产物。已核实的
当前设备和浏览器证据见各任务 validation；本次没有 stage/commit。

## 2026-09-30 x86 与收尾复核补记

本轮新增的源码变更仅在原本干净的 `src/main.ts`、`src/main/ipc.ts`、
`src/main/secret-store.ts`、`src/main/secret-store.test.ts`：限时并缓存
OS safeStorage 可用性探测、修正 basic_text 探测顺序，并让 packaged smoke
选取实际启用的记账按钮、输出无敏感数据的固定失败阶段。可作为独立候选组审阅。
共享移动 UI、同步协议、Android helper 的继承/混合差异没有因此改动。

新增的任务验收记录还涉及已跟踪的 09-08 发布、09-10 同步和 09-12 UI
验证文档；其中 09-08 与 09-10 的既有文档本来已有 dirty 内容，需按 diff
单独复核。当前 `git status --short` 共 52 项：42 个已跟踪文件变更和10个
未跟踪路径/目录；没有暂存内容。本轮没有新建统筹 Trellis task，也未 stage、
commit 或 archive。原21项混合路径仍未获得可重放基线，不能按旧版候选路径
清单整文件暂存；最终归档前仍需逐 hunk 重建并审阅组界。

2026-09-30 追加了 `tests/e2e/accessibility.spec.ts` 的 zoom-equivalent 回归，
归属 09-12 UI 验收：457×999 CSS viewport / DPR 2 下主要 Web 路由、skip link、
焦点和无横溢出通过；真实 Chrome browser-chrome 缩放当时未测。该文件此前在本轮前
干净，作为单独测试候选 hunk，不混入移动端 UI 源码组。

随后已在 2026-09-30 用 X11 全局快捷键将 headed Chrome 实际调到 200%，并通过五条
关键 Web 路由无横向溢出检查；实际截图和几何证据见
`../09-12-luna-ui-redesign/validation.md`。这补齐浏览器缩放操作证据，不改变原21项
基线补丁缺失、混合 hunk 尚不能安全暂存的提交边界。

## 2026-09-30 视觉门与可证明提交

用户已明确回复“视觉通过”。随后在 AIO-3568J Android 11 板上重建当前 `.lan`
APK，补做首页/录入/统计/预算/设置/偏好路由无横溢和控件几何检查，并完成真实
DocumentsUI 合成备份选择：`board-check.luna-backup` 在 Download 中可见，经过
设备焦点激活后回到应用，文件名读回成功；证据位于布局任务的
`research/android11-board-layout-20260930/native-picker-result.json`。

已将明确归属的移动改版整文件、新增四个移动 E2E、Android smoke helper 与稳定
state-management spec 提交为 `f51da40 feat(mobile): complete redesigned flows`。
`shell.tsx`、`entry.tsx`、`ledger.tsx`、`settings.tsx`、`i18n.ts`、`styles.css`、
两份前端 spec 以及既有 E2E 仍包含原 21 项 dirty baseline 与本轮改动的混合 hunks；
由于三个 baseline patch 已不可恢复，这些文件继续不暂存，父任务和三个 child 及
布局任务不能据此假定完成或归档。
