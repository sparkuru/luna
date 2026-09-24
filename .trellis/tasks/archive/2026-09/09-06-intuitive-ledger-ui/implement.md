# 直观记账 UI 实施计划

## 实施前提

- 本任务已在 Trellis 中启动；本次范围修订已确认“预算能力保留在二级菜单”，并已获得用户批准后进入实现。
- 不修改父任务的账本同步、配置同步、加密、SQLite/IndexedDB schema 或 Android SAF 协议。
- 先在 Web host 完成可访问流程，再接入/验证 Electron 和 Android；不直接从视频推断宿主能力。
- 首页不再常驻右侧快速记账面板；“记一笔”和三横线菜单都使用可访问弹窗，预算编辑只在二级菜单出现。

## 有序清单

### 1. 建立 UI 基线

- [x] 阅读当前 renderer、style、i18n、frontend specs 和 UUPM 任务研究，记录可复用的 tokens、消息键和状态处理。
- [x] 将现有首页状态映射为 setup、empty ledger、populated ledger、quick entry、edit、stale/error 和 sync/conflict 状态。
- [x] 确认快速录入不需要新的宿主 API；如发现 API 不足，先更新 design/PRD，不在实现中偷偷扩大协议。

### 2. 重排共享 renderer 信息层级

- [x] 将首页收敛为 logo、账本/日期信息、`page-heading`、收入/支出/结余摘要、最近账单和显眼的“记一笔”入口。
- [x] 从首页摘要移除“剩余预算”，将预算编辑器和预算相关冲突处理放入三横线二级菜单，保留现有预算数据能力。
- [x] 将分类统计、设置、隐私显示控制、配置同步、账本同步/备份和冲突处理组织到可访问的二级菜单 dialog；菜单关闭时这些内容不参与首页首屏布局。
- [x] 将筛选器改为低强调、默认收起的可访问次级控制；展开后保留现有筛选和清除能力。
- [x] 桌面端与窄屏共享同一主路径，不再保留右侧常驻快速记账面板；桌面端通过账单详情和更宽的弹窗展示更多信息。
- [x] 保留现有编辑、删除、过期 revision、预算 draft head、冲突和多分类保护。

### 3. 实现渐进式快速录入

- [x] “记一笔”打开可访问交易 dialog；默认路径突出收入/支出、金额、分类和保存；更多字段使用原生可访问展开控制。
- [x] 在收入、支出、结余三个摘要标题旁提供独立的眼睛开关；每个开关只切换对应摘要卡片，隐私默认值仍由二级菜单设置。
- [x] 分类控件打开可访问选择弹层，展示已有分类并支持自定义输入；不能丢失用户自定义文本。多分类已有记录进入明确的只读/高级编辑保护状态。
- [x] 保存中禁用提交并防重复；成功后刷新当前 snapshot；失败保留草稿、焦点和可重试状态。
- [x] 两个主 dialog 实现 Escape、明确关闭、焦点进入/还原、遮罩和窄屏滚动边界；菜单与交易 dialog 互斥。
- [x] 补齐 `zh-CN`/`en` 消息键、错误文案、空状态和 aria/live-region 文案。

### 4. 验证与回归

- [x] 新增 Web Playwright 覆盖空状态理解、三项摘要且无“剩余预算”、二级菜单发现/打开/关闭、预算位于菜单、收入/支出入口、交易 dialog、分类选择、渐进字段、成功/失败/重复提交、弱化筛选、桌面、375px 窄屏、键盘和 reduced-motion。
- [x] 更新 renderer/domain 测试，仅在新增行为需要时补充；不把 UI 测试写成绕过 API 的假成功测试。
- [x] 运行 `./hako npm run typecheck`、`./hako npm test`、`npm run web:build`、`LUNA_TEST_PRODUCTION=1 npm run test:web`。
- [x] UI 跨层变更后运行 `./hako npm run build`、`npm run make`、`xvfb-run -a npm run smoke:electron`；Android APK 同步/构建已通过，隔离模拟器 Android smoke 在 DocumentsUI 阶段被 System UI ANR 阻断。
- [x] 复核 `git diff --check`、ShellCheck/shfmt、敏感信息边界和 Web bundle 不含 Node/Electron/SQLite import，并保留失败 Playwright trace/screenshot。

### 5. 人工门禁与收尾

- [ ] 在实际浏览器/桌面窗口检查首次理解、视觉层级、键盘焦点、reduced-motion、窄屏和原生目录/文件边界。
- [ ] 在 Android 真机检查触控、返回、离线持久化和快速录入；不以桌面 Chrome 替代真机证据。
- [x] 由 `trellis-check` 复核 PRD/design/implement、frontend specs、跨层状态和测试结果（主会话完成；专用 agent 未能在时限内返回）。
- [x] 由 `trellis-update-spec` 判断并将稳定 UI 模式写入项目规范；通过后才进入 Phase 3.4 提交和 `finish-work`。

## 当前实现与验证证据（2026-09-08）

2026-09-24 当前源码续接结果见 [validation.md](validation.md)：生产 Web 桌面与窄屏
24/24 通过；分类弹窗关闭后的测试焦点等待已修正。后续 Web 设置路由覆盖本计划
原有的三横线弹窗要求，物理 Android 和人工理解度门槛仍待验收。

- 共享 renderer 已收敛为主界面三项摘要、最近账单、弱化筛选和显眼收入/支出入口；交易录入与分类选择使用 modal dialog，预算、分类统计、显示设置、同步、备份和冲突处理位于三横线二级菜单。
- 二级菜单按钮使用三个横向 bar 组成的装饰性 `.menu-icon`，可见内容不再渲染字面量“`三`”；中英文无障碍名称仍分别来自 `openMenu`。针对该修正的 `npm run typecheck`、`npm run web:build`、`./hako npm test`（143/143）和 production Web Playwright（52/52）均已通过。
- 摘要卡标题旁的眼睛按钮使用装饰性内联 SVG，每个按钮只切换对应摘要卡片，并在重渲染后还原焦点；卡片几何保持稳定，当前隐私 E2E 已覆盖三按钮、独立 ARIA 状态、显示切换、尺寸稳定性和菜单/详情边界。
- `npm run typecheck`、`npm run web:build`：通过。
- `./hako npm test`：143/143 通过。主机 Node 20 直接运行曾因 `better-sqlite3`/Node ABI 以 SIGSEGV 退出，项目要求 Node 22，故以仓库 Node 22 wrapper 作为单元测试证据。
- `LUNA_TEST_PRODUCTION=1 npm run test:web`：52/52 通过（Chrome 与 375px 窄屏，含新菜单/筛选焦点回归）。
- `./hako npm run build`、`npm run make`、`xvfb-run -a npm run smoke:electron`：通过；make 在 Node 22 容器因缺少 `zip` 失败一次，改用主机已安装的 `zip` 完成。
- `npm run android:sync` 的 Node 22 Docker 版本、Android APK 构建与 `sha256sum -c artifacts/android/luna-debug.apk.sha256`：通过；当前 APK SHA256 为 `823611b69b6807b1567ca4d0849c0fc830a66e6ff8734463a54ddd54571704b7`。
- Android smoke 在全新隔离 AVD 重试两次，均在打开原生 DocumentsUI 后出现 `System UI isn't responding`，因此不能宣称原生 SAF 全量通过；前置 WebView 离线、重启、同步阶段已执行。两次尝试后已停止 disposable AVD。
- `preview.sh` 的监听 `0.0.0.0` 能力、`bash -n`、ShellCheck/shfmt 和 `git diff --check`：通过；人工浏览器/桌面与真机门禁尚未替代用户确认。

## 主要文件边界

- `src/renderer/renderer.ts`：视图结构、dialog 状态、快速录入/分类选择状态和现有 API 调用复用。
- `src/renderer/styles.css`：单一主界面、dialog/遮罩、低强调筛选、主入口、渐进字段、焦点和 reduced-motion 样式。
- `src/renderer/i18n.ts`：新增用户可见消息键及中英文一致性。
- `src/web/index.html`、`src/renderer/index.html`：必要时提供二级菜单与账本工具的稳定挂载边界，不改变宿主 API。
- `tests/e2e/intuitive-ledger.spec.ts`：Web-first 语义和交互回归。
- `scripts/smoke-android.ts`：共享 Android WebView smoke 对渐进字段的显式展开。
- `preview.sh`：从任意目录启动监听 `0.0.0.0` 的 Web 人工预览。
- `src/renderer/*.test.ts`：必要的状态/格式化单元回归。
- `.trellis/spec/frontend/**`：只有发现可复用且稳定的新 UI 契约时才更新。

## 上一版 UI 基线的自动化验证（2026-09-07）

以下证据验证的是本次范围修订之前的“右侧快速记账面板”版本，用于确认共享 API、离线/同步、Electron 打包和 Android 资产基线仍然可用；完成本次 dialog/二级菜单重排后必须重新执行相关验证，不能直接把它们当作新 UI 的验收证据。

- `./hako npm run typecheck`：通过。
- `./hako npm test`：143/143 通过。
- `npm run web:build`：通过；`LUNA_TEST_PRODUCTION=1 npm run test:web`：50/50 通过。
- `./hako npm run build`、`npm run make`、`xvfb-run -a npm run smoke:electron`：通过。
- Android Web 资产同步和 debug APK 构建通过；当前 APK SHA256 为 `625c6efa8acf079ec3c08e6e1402395e258483b5e918dda229d7b1e598cedff9`。
- Android smoke 已验证到离线创建、重启和同步阶段；原 smoke 对折叠高级字段的脚本问题已修复。后续 SAF 阶段受到隔离 emulator 的 System UI ANR / WebView CDP session 关闭影响，不能据此宣称 Android smoke 全量通过。
- `preview.sh`：`bash -n`、ShellCheck、shfmt 通过；从仓库外目录启动后监听 `0.0.0.0:4188`，HTTP 探测返回 200。

自动化之外仍需完成实际桌面窗口和 Android 真机人工门禁，之后才进入提交与归档。

## 回滚点

- 视图层重排失败：恢复上一版 renderer/styles，不触碰共享 domain/API。
- dialog 焦点或字段映射失败：先恢复上一版完整表单的字段映射和 `renderPreservingDrafts` 路径，修正 view model 后再重新打开弹窗。
- 草稿/同步/冲突回归：停止 UI 扩展，先恢复现有 `renderPreservingDrafts` / `refreshAfterLedgerChange` 路径并补回归测试。
