# 第三轮实施交接

2026-09-26；用户批准父方案三轮范围，后续追加三页月份居中、移动统计/
预算标题收起。本文件只记录实施与浏览器结果，最终检查、APK、实机、
生产离线八项与任务状态由主会话整合。没有提交、卸载、清应用数据，
没有操作账号或手机；继承的 dirty 变更与前两轮实现均保留。

## 已实施

- 显式 `mobile` 分支：设置总览使用共享 registry 的四组七个直接入口；
  高级显示配置同步保留原路径，移至账本同步高级入口。七个直接入口+
  高级入口仍覆盖原八个模块。子页只显示返回动作和本页标题，不铺全部
  模块导航。Web/Electron 保留各自目录呈现与路由。
- 分类收入/支出分段、独立新增 disclosure、紧凑分类行及语义 details
  管理菜单；菜单键盘可打开，单次只展开一行，重命名/启停/删除仍用原
  API。增加直接使用情况入口，保留原受保护删除、批量/单条替换，区分
  usage loading/失败/空状态；原生 BACK 关闭 usage 并恢复入口焦点。
- 偏好减少重复语言标题与常驻说明。本地副本突出名称、当前状态与动作，
  删除后果靠近操作。账号先服务器/用户名/密码，服务器示例使用两语种
  catalog，移动端不默认指向 bundled localhost；设备名展开后填写。
  移动会话说明不用标签页/浏览器术语，secret 清理仍按 `data-secret`。
- 同步未登录提供直达账号动作，自动/手动模式保持 host 原语义，未添加
  renderer polling 或 Android 后台服务。高级配置同步仍独立。
- 备份保存与恢复/合并两个操作入口：隐藏表单仍挂载、draft 保留；移动
  save/import 各自使用 dirty key，完成保存不清除另一导入草稿的导航
  提醒。原密码校验、合并确认、typed chunk API、格式/大小错误保留。
- 欢迎聚焦名称与币种；移动预算与精度在高级项中，币种默认精度保持；
  高级预算错误先展开再聚焦。恢复/账号均是真实 no-workspace 流程。
- 账单/统计/预算的移动月份控件放到同一中心位置；统计/预算可见标题
  收起但保留 accessible heading。日期 input 的 WebKit 内部值居中，
  calendar indicator 脱离值的布局；浏览器已目检，仍待真实 WebView 验证。
- 修复 BACK 顺序：native 事件 target 为 window 时不能仅凭 capture
  保证 feature 早于 shell。shell 对可见 dialog 让位给 feature handler；
  排除 hidden/inert/aria-hidden/data-state=closed/visibility:hidden/无
  rect 的 portal，避免设置返回抢先发生或关闭 portal 阻断 fallback。

## 文件与稳定入口

产品：`src/renderer/app/shell.tsx`；features 的 settings.tsx、settings-
navigation.ts、categories.tsx、account.tsx、tools.tsx、setup.tsx、
budget.tsx；styles.css、i18n.ts、features/server-i18n.ts、ledger-tools-
i18n.ts。没有 domain、API、鉴权、加密、持久化或 schema 改动。

新风险测试：`tests/e2e/mobile-settings-recovery.spec.ts`。

- 设置：`#settings-back`；overview `[data-settings-area="..."]`。
- 分类：`#category-tab-expense/income`、`#category-create-details`、
  `#category-name`、`#save-category`、行 `.category-row-menu > summary`、
  `[id="category-open-usage-expense:0"]`（ID 含冒号，用属性选择器）；
  usage `#category-usage-dialog`、`#category-usage-select-all`、
  `#category-batch-target`。原 category id 和 repair API 保持。
- 账号：原 server-url/username/login-password/login IDs；
  `#server-device-details`、`#server-session-help`。
- 同步：`#sync-go-to-account`、`#server-sync-mode`、
  `#server-sync-advanced > summary`，高级连接原 IDs 保留。
- 备份：`#backup-choose-save`、`#backup-choose-import`；原
  ledger-export/import-form、password、file、confirm、submit IDs 保留。
  无工作区没有 save 入口，import 默认可见。
- 欢迎：原 workspace-form/name/currency 与 `#setup-advanced`；移动
  workspace-budget 在 disclosure 中。setup-restore/connect/back 不变。
- 三页月份：ledger/budget `#month-picker`；statistics
  `#statistics-anchor`（月为 month，周/年 date），月前后与 Router 不变。

## 已跑结果与失败证据

- `./hako npm run typecheck`：通过；新增测试曾有 optional attachments
  的 TS2532，已更正 optional access 后再次通过。
- `./hako npm test`：214/214 通过。实施中 `web:build` 通过；最后 guard/
  dirty 小修后的最终 build 由检查阶段重跑，不能把早期 build 当最终 APK。
- 九个相关套件 Chrome focused（workers=4）：59/59 通过，包括前两轮
  detail/image/filter/entry BACK、预算 heads/dirty/pending、旧 Web 设置/
  modified links、账号、备份、冲突与隐私契约。
- 随后 final guard/圆角/独立备份 dirty/月份值居中候选的新 suite：14/14
  通过（两 locale）。实际覆盖分类新增/收入支出/菜单键盘/重命名/启停/
  usage失败重试/受保护删除/替换/取消删除/BACK焦点与home fallback；
  加密带图下载、失败口令空工作区不变、正确恢复/reload；真实独立合成
  server 登录、绑定、断开/解锁、offline禁用、登出secret归零；冲突查询
  失败与显式候选选择；三页月份中心和高度一致。
- 初次两分类测试错误使用不存在的文案选择器；修正后暴露真实 usage
  BACK 同时导航的问题；修正 shell guard 后通过。另两冲突断言把
  canonical graph 最后元素误当 resolution，改为识别新增 revision。
  分别保留在 captures/mobile-redesign-browser/round3-initial-failures、
  round3-focus-failures、round3-conflict-fixture-failures。
- 启动 full `--workers=4` 后收到 checker 的 usage 异步竞态发现，按主
  会话指示停止，以便先修后跑最终 full。准确结果为 **103 passed /
  1 failed / 4 interrupted / 4 skipped / 170 not-run，exit130**；不是
  全量通过。先向已核实仓库 label+Cmd 的容器发 SIGINT，npm 未转发；
  之后向该容器内已核实 Playwright PID 发 SIGINT，正常生成报告退出。
- 该 full 中唯一真实失败为旧 Web `entry-form-polish` category usage
  删除流程：新增第二次确认改变了原已经确认的流程，旧测试自动取消。
  已交 checker 修复，保持 Web 行为，并保证 mobile 直接 usage 入口
  的删除仍经过确认。所有 full 失败/中断工件在
  captures/mobile-redesign-browser/round3-interrupted-full/test-results。

## 交接与证据边界

实施源码已冻结。checker 接管 categories.tsx 和新测试文件，补 usage
迟到响应 generation/关闭失效、原 heads/stale 保护、batch select 名称
及上述 Web 确认回归；之后 focused 和最终 full 串行完成。实施者不再
写产品文件；后续修改及最终结果由 checker/主会话的记录追加。

截图在 captures/mobile-redesign-browser：设置总览/欢迎及三页月份有
两 locale 320/375/457；目前各设置子页有 457 截图。早期 bound/unlock/
conflict 特殊状态截图选用了 mobile marker 但 chrome 默认宽 viewport，
不能当手机窄屏证明；已明确要求 checker 在 fixture 中设 457×999
再补窄屏布局证据。所有浏览器截图均不证明 Android IME/BACK/SAF。

真实 APK 仍由主会话最后构建并覆盖安装到已授权 USB .lan；实机 SAF
取消/保存成功/隔离空 AVD 恢复/图片选择流程未由实施者测试。最终生产
离线八项由主会话协调补跑。Electron smoke 已知 sandbox 环境阻塞由主
会话记录，不复跑/修改 sandbox。主观视觉与辅助技术仍需最终有针对性
评审，未因浏览器通过而声称覆盖。

## 实机月份居中修正（追加，2026-09-26）

主会话提供的最终候选 APK 三页截图仍显示 Android 原生 month 内部
文本左对齐，否定了先前只依靠 Chrome shadow pseudo 样式的证据。
本轮只修改 components/month-picker.tsx、features/ledger.tsx、
features/budget.tsx、styles.css，并新增 mobile-period-header.spec.ts。
共享 NativePeriodInput 保留原 ID、类型、标签、值和 change handler；
真实 input 透明覆盖整块至少 48px 控件，系统选择器仍由真实输入触发，
没有 JS showPicker 或模拟点击。aria-hidden 显示层用现有 locale/UTC
formatMonth/formatDate 居中绘制；focus-within 保留可见键盘焦点。
样式仅 mobile，WebMonthPicker 与 Electron 原有输入行为不变。

实际验证：typecheck 通过；账单/统计/预算/新 header focused **23/23**
通过；最后 disabled 样式与非 mobile 分支清理后再跑新 header、pending
和 Web month-only focused **4/4** 通过；最终 typecheck、web:build 和
git diff --check 均通过。未再次启动全量测试。此前 checker/full 和
主会话 production/package 结果不当作这次修正后的全量通过。

新测试覆盖 en/zh-CN、320/375/457px：文字 Range 中心、三页相同顶部
位置、原 input 标签/type/value、整块中心/箭头输入命中、48px边界、
焦点描边、无横向溢出，以及统计 week/year 保留真实 date 输入。
截图 native-period-{0,1,2}-{en,zh-CN}-{320,375,457}.png 位于上述
captures 目录，已目检 zh-CN 320/375 与 en 457。

修正源码现已冻结，待主会话窄审、重建 APK 并实际验证文字中心和直接
触摸月份/日期字段能打开系统选择器；浏览器结果不声称该实机验证完成。

## 用户追加：统计左右周期箭头（2026-09-26）

用户看过 868ff024 候选后要求统计与账单/预算统一左右箭头。本次
只修改 components/month-picker.tsx、features/budget.tsx、styles.css、
i18n.ts 与 mobile-period-header.spec.ts。NativePeriodNavigator 共享
统计/预算的48px三列、相同箭头glyph与原生输入；预算原 IDs/fieldset/
changeMonth 保持。统计 statistics-previous-period 与
statistics-next-period 月模式调用原 onMonthChange，周移动UTC七日、
年移动UTC一年并将闰日夹到2月28日，调用原 onAnchorChange；没有新
本地月份状态。两个必要 week labels 同步 en/zh-CN，Web/Electron
保持原分支。账单产品文件未在此次追加改动。

本次实际检查：最终 typecheck、git diff --check、web:build（3.16秒）
通过；unit **214/214**（17.028秒）；focused **10/10**（16.5秒）：
`./hako npm run test:web -- tests/e2e/mobile-period-header.spec.ts tests/e2e/mobile-statistics-budget.spec.ts tests/e2e/react-state.spec.ts --project=chrome --workers=4 --grep 'native period|statistics period arrows|mobile budget|month-only picker'`。
初次 typecheck 的两处测试tuple typing与不存在的测试API调用已修正，
最终无错误；没有浏览器失败，没有启动全量测试。

新增四项 header 测试包含：两locale320/375/457的三页相同箭头box/
glyph中心与48px面积；月份跨12月/1月、周跨年±七天、闰年前后夹日；
实际Router month/anchor/period及底栏进入账单/预算保留选中月；真实
picker输入中心/indicator命中、标签/类型/值和键盘焦点。原预算dirty
取消、pending不重放、stale heads、loading/error与Web picker通过。
已目检统计新版 zh-CN320及en457截图；现有native-period截图更新。

源码和所有测试/构建均已结束并冻结，交主会话/独立checker窄审。最终
APK需重新构建验收统计月/周/年箭头和仍可打开原生picker；868ff024
实机证据属于此前候选，不作为本次追加的实机通过。
