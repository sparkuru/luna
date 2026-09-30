# 第三轮独立检查

2026-09-26；trellis-check 直接审查/修复，没有递归派发。先读取完整
native hook output、check JSONL、PRD/design/implement、header-addendum、
父任务 layout-contract 与 A01–A15，package context 为 single repo。
保留已有 21 项修改、前两轮结果及其他代理改动，不提交或改变任务状态。

## 已修复

1. `src/renderer/features/categories.tsx`：关闭 usage 再查看另一分类时，
   旧异步成功/失败可覆盖新列表、loading 和错误。读请求绑定代次及源
   分类；关闭和 unmount 作废，成功写后的 usage 重读也检查同一请求。
2. 同文件：usage 替换/删除使用实时 snapshot category heads，后台刷新
   会升级原观察令牌。打开时捕获 heads，只有成功写并显式刷新后读取
   Query fresh snapshot 重观察；expected transaction revisions 继续取
   当前 usage 行，不随后台交易刷新升级。
3. 同文件：第三轮给旧 Web 删除拒绝→修复→删除流程增加了重复确认，
   原回归被自动取消阻断。记录本次 usage 是否从已确认删除进入；直接
   查看后删除仍需目标确认，已确认入口不重复询问。批量目标 select
   补齐本地化可访问名称。
4. `account.tsx` / `styles.css`：服务合法 64 字符连续用户名在 320px
   已登录页导致 scrollWidth 英文 547、中文 557。身份文本增加语义
   class，只有 mobile 的用户名与服务器地址允许在任意位置换行。
5. `ledger.tsx` 仅修正 BACK 监听注释：window 为事件目标时不能假设
   capture 必然先于 shell；shell 主动让可见 feature Dialog 消费。
   实施代理按本次检查建议排除了 closed Dialog；该产品 guard 修复
   属实施代理，不将其写作 checker 独自实施。
6. `account.tsx` / `app/shell.tsx`：账号内嵌同步面板遗漏 navigate，
   点击高级同步入口会走普通 href 重载并丢失当前 session；补齐路由
   回调至账号、同步面板和引导入口。普通点击走现有 Router，修改键
   点击仍遵循链接语义。可选 prop 用条件展开满足 exactOptionalPropertyTypes。
7. `styles.css`：mobile checkbox 的标签点击区域只有约 22px；设置
   check-field 和备份选择标签最小 48px，文字 16px，保留原 checkbox。

测试修改只在 `tests/e2e/mobile-settings-recovery.spec.ts`：四条新增
双 locale 风险用例，迟到成功/错误、BACK→另一分类、unmount、原
heads/revisions、拒绝后 graph 完全不变及重新打开后安全替换。确认
测试同时覆盖直接 usage 的取消和接受；既有 Web 已确认路径保留。
所有 mobile fixtures 明确 457×999；七设置子页及 advanced 再循环
320/375/457，已登录 fixture 用服务实际合法最大用户名检查窄宽。
账号连接新 profile 后显式设置 fixture locale 并等待 html.lang，避免
把默认英文截图误计为中文。高级同步入口用 window token 验证无重载，
返回账号后验证 session 仍解锁。usage 删除改用本地化语义按钮并等候
加载完成，避免测试将暂时位于末尾的关闭按钮误当删除。
三页周期截图前断言实际 URL、is-active 与 aria-current，移开指针并
禁用截图动画，避免上一个导航 hover 干扰预算的视觉证据。

## 复核范围

- 7 项设置总览和同步内 advanced 共 8 个原设置模块；registry、原
  14 个注册路径、deep link 未删。mobile 子页只保留返回，未改
  Web/Electron 的导航分支。`/setup` 别名的直接点击尚需主会话最终
  空数据验收，不能用注册源码检查冒称自动化点击覆盖。
- 分类 tabs/menu、新增、重命名、启停、直接 usage、失败重试、批量
  替换、使用中删除保护、目标确认和关闭 focus 均保留 typed API。
- 账号密码采用 semantic data-secret 清理，revealed text 仍清除；
  login/connect/unlock/preferences 的提交清理和 account/profile
  状态变更的 visibility reset 未改变 host secret 生命周期。
- 同步未登录可直达账号，mode 来自真实 host；没有覆写 manual、
  renderer 网络调用或声称 Android 持续后台服务。
- 备份选择后隐藏表单仍保留 DOM/草稿，save/import 各自 dirty keys；
  成功保存一份不能清掉另一隐藏草稿的离开提醒。无 workspace 只
  恢复，密码、错误、pending、确认和 typed chunk APIs 保留。
- 欢迎名称/币种优先，precision/预算在 advanced，货币默认及财务
  算法不改；错误会展开对应隐藏高级字段。冲突 loading/failure/empty/
  explicit candidates 保持分开。
- 三页 mobile 周期位置统一，统计/预算标题保留可访问 h1 但不占
  视觉高度；Web/Electron 页名、周/年日期语义及 Router 状态保持。
  date input 内部实际居中须由主会话真实 APK 检查。
- 48px controls、visible focus、reduced-motion、portal drafts、隐私
  DOM 边界及前两轮版本保护以源码及既有风险套件复核，没有新增
  deps、字体、renderer API、schema、DB 或后端业务变更。

## 自动验证与失败证据

| 检查 | 结果 |
| --- | --- |
| 独立 TypeCheck（修前及最终） | 通过；最终可选 prop 类型已修复 |
| `./hako npm test`（最终源码） | 214/214，18.437s |
| `./hako npm run web:build`（最终源码） | 通过，3.93s；现有 dependency use-client/chunk 提示不属失败 |
| 新 mobile suite + entry-form-polish focused Chrome | 26/26，50.7s |
| 各子页三宽 + 最大用户名登录 focused Chrome（最后窄修后） | 4/4，15.9s |
| mobile settings + settings-interface 双项目 focused | 40/40，56.7s |
| 三页周期/当前导航 focused | 2/2，6.5s |
| `git diff --check` | 通过；项目无独立 lint script，不虚报 eslint 通过 |
| 最终完整 Web `--workers=4` | 282 通过、8 个 production-only 跳过、0 失败，3.9m；session 96806 exit0 |

4 条新增竞态/旧heads用例修前全红；归档
`captures/mobile-redesign-browser/round3-check-before-fixes/` 含 trace、
截图及错误 context。最大用户名双 locale 溢出修前失败工件归档
`captures/mobile-redesign-browser/round3-account-overflow/`。
实施代理较早 full 在 main 要求下停止（exit130），此前旧 Web 删除
流程真实失败与中断工件位于
`captures/mobile-redesign-browser/round3-interrupted-full/test-results/`；
其部分通过不能算 full 通过。修后的旧流程已通过 focused。
首轮完整 Web 在账号路由和点击标签补丁前为 282 通过、8 个
production-only 跳过（3.8m）；最终计数以本轮完成为准。
账号高级入口重载、连接 fixture locale、usage 测试选择器竞态分别
归档于 `round3-account-navigation/`、`round3-connection-fixture-locale/`、
`round3-usage-delete-selector/`（均在 captures/mobile-redesign-browser 下），
包含失败 traces/context；后两项为测试修复，不虚报产品语言或删除缺陷。

## 证据边界与交接

本角色未操作手机、AVD、ADB、APK 或 Electron native smoke。浏览器
mobile marker 只验证共享 renderer 与 browser host，不等同 Android
IME/BACK、SAF、内部日期值、native session lifecycle。实机及空数据
APK、production-only 8 项、Electron package 由 main 继续集成。
已知 Electron native smoke 先前在产品启动前因 SUID sandbox helper
阻断；不能把 package 或 Web 通过改写成 native runtime 通过。

stable spec 由 main 更新：mobile grouped settings/advanced 内入口、
usage 请求代次和观察令牌/确认来源、独立备份 dirty keys、欢迎 advanced、
真实主机文案及三页周期规则。最终主观视觉、设备/辅助技术场景仍须
按项目 human-review gate 判断；本检查不批准提交或归档。

最终 renderer 源码冻结；`git diff -- src/renderer` 与
`/tmp/luna-mobile-redesign-round3-check-final.patch` 的 SHA256 相同：
`3ce8e5a7a91f7a93b4bf0c65f25f38f079dc996655dfbdeeb80aca32fc5de603`。
最后验证后只更新本检查记录，未再改产品或测试。所有本角色发起的
测试/类型/构建会话均已 exit0，无测试运行；main 可接管生产专用测试、
Electron package 和最终 APK。实机当前基线由 main 记录为用户新增
705.00 支出后的 5 笔，不以早先 4 笔基线冒称最终保留验收。

## 实机月份显示失败后的窄审

实机 APK 证明早先只核框架位置的截图测试不足：input 内部月份仍
左对齐。主会话安排实施代理改用 NativePeriodInput；本角色只审
month-picker.tsx、ledger.tsx、budget.tsx、styles.css 与新增 header
suite，逐行比较上一冻结 patch，没有再改产品或测试，没有广泛审计。

保留真实 month/date input 的 type/value/id、语义 label、原 onChange；
aria-hidden span 以既有 UTC formatMonth/formatDate 投影显示，避免
日期偏移。透明原生输入覆盖整个至少 48px 表面及图标，仍 focusable，
focus-within 显示焦点；预算 disabled fieldset 仍禁用真实输入。
新增 CSS 全部限制 mobile，Web/Electron 原 picker 分支未改。财务
算法、格式化函数、业务和 host 接口没有变更，先前 214 unit 仍作为
相关领域证据，不冒称针对新源码重新运行过 unit/full。

独立最后窄验：typecheck 通过；新 header 双语言/双项目 4 项、预算
pending 2 项、旧 heads 2 项、Web month picker 2 项合计 10/10，
16.0s；git diff --check 通过。未运行 full，等待 main 完成新版 APK
构建及 nativeQA 后协调最终窗口。所有本角色会话结束，ps 无测试进程。
当前 renderer SHA256 为
`8e8d28fc9fd86d6b02a49b9816d7b8246728b9030d486659a5b97a30a0967114`。
已释放 APK 窗口；浏览器证明 geometry/hit/focus/semantics，真实 Android
picker 弹出与绘制仍由 main 实机验收，不能引用前一版本 282 full 冒称
新版全部完成。

## 新版 APK 安装后的最终串行验证

main 已完成新版 APK（868ff024…）构建/USB 安装并释放测试窗口；本
角色按 8e8d28… 冻结源码先 unit 再 full，无新增审计或产品/测试修改。
`./hako npm test` 214/214，0 失败/跳过，20.763s（session22437 exit0）。
`./hako npm run test:web -- --workers=4` 294 总计，286 通过、8 个
production-only 跳过、0 失败，4.5m（session20116 exit0）；包含新增
header 双语言、双项目测试。最新同源 typecheck 及 10 focused 仍为
上一窄审通过的证据，本轮没有重复跑 build/type。

最后 `git diff --check` 通过，renderer SHA256 仍为
`8e8d28fc9fd86d6b02a49b9816d7b8246728b9030d486659a5b97a30a0967114`。
ps 无 Playwright、npm test:web、node --test；全部本角色检查会话结束，
明确释放 production14/Electron package 窗口给 main。原生验收仍由
main 保存独立证据；本轮没有操作设备或使 APK 失效。

## 用户统计箭头追加后的最终检查

用户对 868ff024… 的反馈是具体调整而非主观视觉接受；先前 286 full
及 nativeQA 属前候选。最新 header-addendum、component spec 与
device/check-review 文档重新读取；本角色在前述全三轮完整审查基础上
复核本次 NativePeriodNavigator、budget/statistics、mobile CSS 和
两个 week label。没有递归派发，未再改产品或测试，也未覆盖主会话
任务/设备文档。继承 dirty 与前述安全修复全部保留。

本次无新增阻断 finding：预算共享 Navigator 仍处于 disabled fieldset，
原 dirty Router 取消、pending 和 heads 不变；统计 month 用原
onMonthChange，week 以 UTC ±7 天，year 以 UTC ±1 年并将非闰年
Feb29 收至 Feb28，经原 onAnchorChange 更新 Router month/anchor。
没有独立月份状态或财务计算改动。新增箭头有本地化 accessible name，
真实 native input 的 label/focus/hit/display contract 保留，三列几何
一致；Web/Electron 分支不新增 mobile 箭头。前两轮录入/统计预算及
第三轮设置/账号/秘密/备份/分类/冲突/欢迎完整风险套件本次重新全跑。

独立检查命令与结果：

- `./hako npm run typecheck`：通过，session21567 exit0。
- `./hako npm run test:web -- tests/e2e/mobile-period-header.spec.ts tests/e2e/mobile-statistics-budget.spec.ts tests/e2e/react-state.spec.ts --grep 'native period|statistics period arrows|protected page-local month|mobile budget pending|observed heads|Web statistics uses' --workers=4`：双项目 18/18，20.9s，session36655 exit0。
- `./hako npm run test:web -- --workers=4`：298 总计 = 290 通过、8 个 production-only 跳过、0 失败，4.0m，session45636 exit0。
- `git diff --check`：通过。项目无独立 lint script，不虚报 lint 工具通过。
- unit214/214、Web build3.16s 和 focused10/10 16.5s 为实施者在本次冻结的结果；本角色没有重复 unit/build，也不挪用旧版本的独立 unit 时间。

最终 renderer SHA256：
`3fff5ee3b4ce6d0f67181a34c74bb0fd556d64dae7b98bbb801c14e3e77a9e7c`。
检查前后相同，无 APK 源码失效变更。ps 无 Playwright/test 会话，已
明确释放 APK/production/package 窗口。最新箭头真实设备、系统 picker
与原五笔保持仍由 main 补验，旧居中照片不代替新候选箭头证据。
