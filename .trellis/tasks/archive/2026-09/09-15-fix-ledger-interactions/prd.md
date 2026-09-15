# 修复月份切换闪烁、交易入口与默认日期

## Goal

让 Web 账单页在切换月份和新增交易时保持连续、可预测的操作体验：月份切换不再造成页面闪烁，记账入口位于月份控件下方的空白区域，新建交易默认使用今天的本地日期。

## Background and confirmed facts

- 用户录屏 `/tmp/tmp/simplescreenrecorder-2026-09-15_09.09.40.mkv` 展示了 Web 账单页的月份切换、空白区域和新增交易弹层；录屏为约 29 秒、2878×1670、60 fps 的 H.264 视频。
- `src/renderer/app/shell.tsx:99-133` 使用 TanStack Query 的 placeholder snapshot；切换月份时会清空旧交易和摘要，但 `src/renderer/app/shell.tsx:688-719` 把账单内容整体换成独立的 `LedgerMonthLoading`，导致页面几何和内容层级在 loading/ready 之间跳变。相关 Web 月份隔离约束已记录在 `.trellis/tasks/09-13-web-visual-redesign/implement.md:96-102`，但录屏确认闪烁仍存在。
- Web 主记账按钮目前位于 `src/renderer/features/ledger.tsx:619-633` 的标题左侧；月份控件位于同一组件的 `:635-685`。现有 CSS `src/renderer/styles.css:3666-3695` 明确把主按钮放在标题副列，而录屏中月份控件下方存在更合适的空白区域。
- 新建交易的默认日期由 `src/renderer/features/entry.tsx:167-181` 决定：当前月份使用 `currentLocalDate()`，历史月份使用 `${month}-01`；编辑交易则从原交易日期初始化。
- 现有回归覆盖月份隔离和稳定 `#primary-record` locator：`tests/e2e/react-state.spec.ts:100-140`、`tests/e2e/intuitive-ledger.spec.ts:30-70`、`:210-275`。本任务需要补充 loading 稳定性、按钮几何位置和默认日期行为，而不是改变账本数据协议。

## Requirements

### R1. 月份切换无闪烁且不泄漏旧月份内容

- 切换月份后，Web 账单页的应用壳、页面主结构和月份控件保持稳定，不因 loading/ready 状态整页替换而闪烁或明显跳动。
- 新月份尚未读取完成时，不得显示上一月份的交易、摘要金额、交易数量或上一月份的空态；可以显示与最终页面几何一致的 loading 占位和状态提示。
- loading 状态必须明确可感知且可访问；读取失败时保留稳定布局并提供重试，成功后只显示所选月份的数据。
- 不修改月份路由、查询范围、摘要计算、缓存/持久化或账本 API 契约。

### R2. Web 记账入口位于月份控件下方

- Web 账单页仍只渲染一个 `#primary-record` 主记账按钮。
- 在桌面 Web 布局中，按钮显示在月份选择控件正下方、右侧操作列的空白区域；按钮与月份控件对齐且不挤压标题、摘要或交易列表。
- 在 768px 以下的收缩布局中，月份控件和记账按钮继续按清晰的垂直顺序排列，不横向溢出、不被固定导航遮挡。
- native/Electron 的既有入口语义保持不变；收入/支出类型选择仍在交易弹层内完成。

### R3. 新建交易默认今天，编辑保留原日期

- 打开新建交易弹层时，日期字段默认使用当前主机本地日期 `currentLocalDate()`，不因当前浏览的账单月份是历史月份而改成该月 1 日。
- 编辑已有交易时，日期仍初始化为该交易的原日期；用户手动修改日期的能力不变。
- 日期仍是核心字段，保存在用户修改前不可隐式覆盖；新增日期行为不得改变金额、分类、附件、脏状态或 revision 语义。

## Acceptance Criteria

- [x] 在具有不同月份交易的合成账本中切换月份，页面不会出现账单页整体 loading/ready 闪烁；切换期间旧月份交易、摘要金额和计数均不可见，加载完成后只显示目标月份内容。
- [x] 月份读取被人为延迟时，应用壳与账单主结构保持稳定，loading 状态可通过语义状态识别；读取失败后重试仍能恢复目标月份内容。
- [x] 桌面 Web（至少 1280px 和 1440px）中，唯一的 `#primary-record` 位于月份控件下方并视觉对齐；Web 不再在标题左侧放置该按钮。
- [x] 768px、375px、320px Web 视口中，月份控件和 `#primary-record` 仍可见、可聚焦、无横向溢出，正文和固定导航之间保留安全间距。
- [x] 无论当前账单页选择本月还是历史月份，新建交易日期字段默认等于运行环境的当前本地日期；已有交易编辑仍显示原日期。
- [x] 现有月份隔离、交易新增/编辑、隐私摘要、焦点返回和旧路由回归继续通过；不改变 shared ledger/API 数据格式。
- [x] 运行并记录与改动范围相符的 `npm run typecheck`、相关 `npm test`、`npm run web:build`、相关 Web Playwright 测试和 `git diff --check`；无法运行的检查记录实际原因。

## Out of Scope

- 不修改账本 schema、SQLite/OPFS/IndexedDB 存储、加密、同步、附件、服务端 API 或金额/日期校验规则。
- 不重做 Web 视觉系统、统计/设置页面或 native 专属导航；仅调整共享交易弹层的默认日期和必要的 Web 账单布局。
- 不把用户选定的日期自动改回今天，不改变编辑交易、脏草稿、附件 staging、revision 和焦点管理行为。

## Key Decisions

- 以“稳定页面几何 + 不显示旧月份财务数据”为月份切换契约；loading 可以替换数据区域的内容，但不替换整个账单页面结构。
- Web 主按钮跟随月份控件放在右侧操作列下方；保留稳定 `#primary-record` locator 和现有弹层入口。
- 新建交易统一默认当前本地日期；编辑交易始终保留原日期。若用户在历史月份查看账单后新建并保存今天的交易，交易按实际日期归入今天所在月份，这是“默认今天”带来的明确行为。

## Open Questions

无阻塞性问题。
