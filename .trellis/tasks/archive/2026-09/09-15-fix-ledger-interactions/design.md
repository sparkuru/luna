# 账单交互修复：技术设计

## 1. Scope and boundaries

本任务只调整共享 React renderer 的账单呈现、Web 账单入口布局和交易弹层的新建默认日期。账本查询、SQLite/OPFS/IndexedDB、加密同步、附件、服务端 API、金额与日期校验继续由现有边界负责。

月份切换仍由 TanStack Router 的 `month` search 参数拥有，月份 snapshot 仍由 `snapshotOptions(month, scope)` 读取；不新增 renderer 财务 store，也不把交易数据放入 URL。

## 2. Month transition presentation

现有 `App` 已经通过 `snapshotForContext` 在目标月份读取期间去掉旧 snapshot 的交易和摘要，但主内容会在 `LedgerHome` 与独立 `LedgerMonthLoading` 之间切换。将 `LedgerMonthLoading` 改造成与 `LedgerHome` 相同页面骨架的静态 loading frame：

- 保留 `dashboard-hero`、月份控件、摘要 grid 和交易 panel 的页面几何；只用不包含财务值的占位块替代目标 snapshot 尚未返回的数据。
- 继续由 `snapshotReady` 决定是否进入真实 `LedgerHome`，因此旧月份的交易、摘要金额、计数和空态不会出现在新月份 loading frame 中。
- loading frame 使用 `aria-busy`/`role="status"` 和现有 `loadingMonth` 文案；读取错误在同一交易 panel 内显示 alert 与重试按钮，不跳到另一套布局。
- 移除月份 skeleton 的持续 shimmer 动画，使用静态占位背景。这样 loading 不会制造第二种闪烁源，也符合低动效约束。
- loading 期间的记账按钮保留在最终位置但禁用，避免用户在目标 snapshot 未就绪时启动保存流程；月份控件仍可继续导航。

现有 `snapshotForContext` 的旧数据隔离逻辑保留，不通过重新显示旧 snapshot 来“消除”闪烁。

## 3. Web ledger action layout

将 `#primary-record` 从 `LedgerHome` 的 `.page-heading-copy` 移到 `.page-heading-actions`，放在月份控件之后。桌面 Web 的 actions 列使用与月份控件一致的最大宽度，按钮占满该列并自然出现在月份控件正下方；小窗口继续按单列排列。

只在 Web 保留该按钮，保持唯一 `#primary-record` 和既有弹层入口。native/Electron 的 `record-expense`、`record-income` 入口与现有类型选择行为不变。同步更新 Web-specific CSS selector，避免旧的“按钮属于标题 copy”规则重新覆盖布局。

## 4. Transaction date initialization

`TransactionDialog` 的新建分支统一使用 `currentLocalDate()`；编辑分支优先使用 `original.date`，因此编辑已有记录不会被当前日期覆盖。日期输入仍是受控核心字段，用户修改、保存、dirty 状态、附件 staging 和 revision 路径不变。

在历史月份页面新建并保存时，交易按用户看到的实际日期归入当前日期所在月份；月份筛选不会为了迎合默认日期而改变。

## 5. Validation and rollback

- 在 `react-state` 中用人为延迟的 `getSnapshot` 固定观察月份 loading：断言页面骨架仍存在、旧月份文本不可见、目标 snapshot 释放后恢复。
- 在 `intuitive-ledger` 或 `react-state` 中断言桌面 Web 主按钮位于月份控件下方，并在 320/375px 保持无横向溢出。
- 断言本月和历史月份打开新建弹层都默认当前本地日期；已有交易编辑仍保持原日期。
- 运行 renderer 类型检查、相关单测、Web build、focused/full Web Playwright 和 `git diff --check`。若共享 renderer 的 native 单测受现有 Node/native worker 环境影响，记录实际失败，不改变验收标准。
- 若 Web 布局回归，优先回滚 surface-specific CSS/markup；不回滚 snapshot 数据隔离或修改共享 ledger 协议。
