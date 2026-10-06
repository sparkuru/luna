# 第一轮实施与验证记录

日期：2026-09-26。记录者：`implement_mobile_round1`。

本记录只覆盖实施 agent 实际执行的检查。后续 checker 的修复、最终
全量结果和主会话的 APK／实机验收由对应记录负责；不能用这里的浏览器
结果替代真实 Android IME、系统 BACK 或已安装产物的结果。

## 实施起点与归属

实施起点保存于 `/tmp/luna-mobile-redesign-implementation-baseline.patch`；
交付记录时该文件仍存在。起点已有 21 个 tracked dirty 路径，本轮是在
其上增量修改，没有执行 reset、清数据、卸载、提交或回滚既有改动。
Git 的完整 diff 同时包含前一轮工作，不能把所有差异都归于本轮。

本轮 agent 写入的产品路径为 shell、ledger、entry、styles、i18n；测试
路径为既有 android-entry-layout 和新增 mobile-ledger-redesign。
没有写后端、同步实现、设置正文、统计／预算正文、规格或任务状态，
也没有操作 ADB 设备。主会话与 checker 的后续改动独立归属。

| 文件 | 本轮增量 |
| --- | --- |
| `src/renderer/app/shell.tsx` | mobile 使用账单／统计／预算／设置和中央记账；设置底栏继承 `open-secondary-menu`，去重顶部入口；viewport 与文本焦点监听维护 `data-mobile-ime`；路由返回先尊重已消费事件 |
| `src/renderer/features/ledger.tsx` | 紧凑摘要及按天交易列表，避免标题与备注相同的重复文案；mobile 筛选进入独立稳定 Dialog，复用原筛选表单和查询状态，提供结果数／清空；详情省略空备注并紧凑显示；可见图片、详情、筛选按顶层顺序消费固定 cancelable BACK 事件 |
| `src/renderer/features/entry.tsx` | 单金额输入同时呈现表达式和 `displayAmount` 的继续小数投影；常用启用分类直接网格选择，更多分类仍走 catalog picker，搜索手动聚焦；日期保留核心位置，附件进入更多信息，保存位于面板固定底部；计算表达式纳入 dirty；关闭保留稳定 portal、草稿和原始 revision，写入／图片处理期间不误关闭 |
| `src/renderer/styles.css` | mobile 系统字体、浅色语义 tokens、紧凑分组和列表、单行五槽导航、48px 控件；长摘要独立区域且不与眼睛重叠；全高录入使用 vh 基线与 dvh 渐进增强，内部表单滚动，保存独立可达；文字 IME 时底栏让位；详情／筛选／类别布局局部适配 |
| `src/renderer/i18n.ts` | 两 locale 完整添加记账短标签、本月账单、更多分类、查看筛选结果；其余短导航复用既有 catalog keys |
| `tests/e2e/android-entry-layout.spec.ts` | 按新的全高面板／内部表单滚动更新旧布局断言；保留旧 WebView vh、48px、硬件计算、嵌套焦点、草稿和图片 staging 语义；同一金额区断言 `3.33(3)`，已提交列表仍为账本精度 `3.33` |
| `tests/e2e/mobile-ledger-redesign.spec.ts`（新增） | 两 locale、320／375／457px 的隐私、列表与五槽同排导航；独立筛选状态、无效 regex 和恢复；固定 renderer BACK 只消费可见详情／图片，关闭 portal 后 home 不消费；直接分类选择具有可观察选中态；合成附件读写与诊断截图 |

所有金额、分类 IDs、查询范围及写入仍走既有共享 domain 和 typed host
API；没有引入第二套财务 state 或新依赖。Web／Electron 呈现分支保留。

## 实际检查

均通过项目 `./hako` 执行；未使用宿主 Node 替代项目测试环境。

| 检查 | 实际结果 |
| --- | --- |
| `./hako npm run typecheck` | 通过；实施过程中修正 exact optional props 和提取 JSX 的类型错误后，最终检查 exit 0 |
| `./hako npm test` | **214 passed，0 failed／skipped**；约 19.3s |
| `./hako npm run web:build` | 通过；Vite 约 3.43s，保留既有依赖 `use client` 和 chunk size 警告，没有构建错误 |
| focused：mobile-ledger-redesign、android-entry-layout、ux-mobile-navigation、ux-entry-summary、entry-form-polish，`--project=chrome` | **33／33 passed**，约 34.0s |
| 目检修正导航后：mobile-ledger-redesign，`--project=chrome` | **5／5 passed**，约 13.4s；新增所有五个控件顶部同一行断言，防止 settings 稳定 ID 继承旧 `grid-row: 2` |
| 分类外观：mobile-ledger-redesign，`--project=chrome --grep 'renderer BACK'` | **1／1 passed**，约 4.1s；按真实 aria 选中态等待 CSS transition 后再取样，区别选中／未选中外观；同时保留图片→详情→home 的返回断言 |
| `git diff --check` | 实施交付时通过 |
| 首次 `./hako npm run test:web` | **213 passed、8 skipped、1 failed**，共 222 项，约 2.7min；不是全量通过 |
| 独立重跑 `server-account.spec.ts --project=chrome --grep 'real server login'` | **1／1 passed**；用例 13.4s，总计 14.9s；未增加 timeout、未删断言、未改该文件 |

首次全量使用默认 8 workers。8 个 skipped 为需 production 模式的用例，
本次是 Vite dev host；这里不声称其已通过。主会话协调的最终冻结检查、
生产模式覆盖和 checker 结果应另记，不能反写为实施 agent 已执行。

### 首次全量失败及证据状态

失败场景为 `tests/e2e/server-account.spec.ts:125`：真实登录、加密副本、
第二设备恢复和离线 profile 恢复。120s timeout 后，finally 的
`browserContext.setOffline(false)` 又报告 context closed；该清理报错
不能当作原始停点。

实施 agent 当时实际读取 trace，确认第二客户端被撤销 session 后，
`click #server-sync-now` 从约 71151ms 起未完成。默认 automatic 可能
先检测撤销并移除按钮，属于测试与自动状态变化竞态的候选解释；独立
重跑成功，没有充分证据把失败归为本轮 renderer 产品缺陷，也没有充分
证据仅凭独立通过宣称全量稳定。应保留撤销、重新登录、离线恢复断言，
不能只加 timeout 掩盖问题。

当时的失败产物位于：

- `test-results/server-account-real-server-2512d-nd-offline-profile-recovery-chrome/trace.zip`
- 同目录 `error-context.md`、`test-failed-1.png`、`test-failed-2.png`

**交付文档时已核对：上述 trace 与 error-context 路径不存在。** 后续
Playwright 使用同一产物目录，首次产物已被覆盖，不能再把这些历史路径
当作当前可下载证据。首次完整输出保留在会话工具执行记录（session
40626），独立重跑输出在 session 98541；本 agent 没有另存对应磁盘 log，
因此没有可以提供的首次 log 文件链接。

## 视觉目检与截图

实施 agent 实际目检账单、录入截图，确认摘要／列表密度改善，三条合成
记录首屏可见，五个导航在一排，只有一个金额展示区，直接分类选中态
清楚，保存不依赖滚动到表单底部。截图为浏览器 host 选用 mobile
presentation，**不是 APK 截图或真实 IME 证据**。

截图在 ignored 产物目录，交付记录时三个文件仍存在：

- [中文账单](../../../../../archive/2026-10-06/captures/mobile-redesign-browser/zh-CN-ledger.png)
- [英文账单](../../../../../archive/2026-10-06/captures/mobile-redesign-browser/en-ledger.png)
- [英文录入与分类选中态](../../../../../archive/2026-10-06/captures/mobile-redesign-browser/en-entry.png)

这些是测试合成 ledger，英文录入 fixture 默认 USD；月份原生 input 的
系统显示格式由浏览器 locale 决定。截图用例后来可能由 checker 重跑
刷新，不能把文件现存等同于实施冻结版本的不可变 hash 证据。

## 后续与验收边界

冻结后只读复核发现：编辑已停用分类时，mobile helper 应保留原分类名，
而不只显示停用说明。主会话已把该单点修复及 fixture 回归交 checker；
实施 agent 没有在冻结后改产品／测试。本记录不替 checker 宣称修复
或最终全量结果。

真实 Android 金额初始 IME、文本 IME／保存、分类→录入、图片→详情、
详情→账单、home 原生 fallback、重开草稿及已安装数据保持，现由主会话
继续验收，结果见 [device-validation.md](device-validation.md)。本 agent
没有安装或操作设备，不自称 native 已通过。APK hash、打包 Electron／
smoke、后续规格更新和最终质量门由主会话记录。

第二轮统计／预算、第三轮设置／恢复不属于本轮 agent 的产品交付范围。

2026-10-06 产物位置调整：现存本地材料的旧路径和新位置见[迁移清单](../../../10-06-repository-cleanup/research/artifact-migration.md)。上列三条截图导航原相对路径已失效，现改指保存的文件；这不证明文件仍是实施冻结版本，也不恢复早已被覆盖的首次失败产物。
