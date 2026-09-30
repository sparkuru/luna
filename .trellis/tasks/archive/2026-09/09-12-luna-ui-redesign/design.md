# Luna 改版技术与交互设计

修订2，2026-09-12；规划契约，不是已实现状态。以 prd.md 为产品需求，attachment-contract.md 为附件协议，implement.md/acceptance.md 为执行和验证。本修订完整替换原金额优先/右下FAB/仅月统计方案。

## 1. 架构、职责与改动范围

继续 React19/TypeScript、TanStack Router/Query、Tailwind4/CSS变量、现有Radix/shadcn、Lucide、Vite、Playwright。Web和Android共用Renderer；Electron通过preload。领域纯函数负责金额、期间、筛选、图表派生；host负责存储、加密和传输。Query只缓存可丢弃的呈现数据，不能成为第二套财务事实来源。

| 现有文件 | 当前职责 | 本轮责任 |
| --- | --- | --- |
| src/renderer/app/router.tsx、search.ts | 路由/白名单，native或file使用Hash | 四页面与设置子页、旧映射、日期参数 |
| src/renderer/app/shell.tsx | profile/query/snapshot/entry/dirty/visibility/旧菜单 | 稳定状态拥有者、响应式壳、草稿作用域和浮层返回 |
| src/renderer/data/local.tsx | scope读取、useLocalWrite | 保存与刷新语义保留；新增附件读取状态使用同一scope |
| features/ledger.tsx | 明细/筛选/摘要/删除 | 轻量摘要、按日流水、详情入口、查询入口 |
| features/entry.tsx | 表单/分类Dialog/revision | 分类网格、计算键盘、常驻日期、附件及原revision保护 |
| features/budget.tsx | BudgetEditor和Statistics | 预算保留；Statistics提取独立模块 |
| features/setup.tsx | 创建含预算/locale默认币种 | CNY默认、无需预算、初始恢复 |
| features/account.tsx | 账号+本地profiles+设备、ServerSyncPanel | 按职责分页面，保留所有handler |
| features/settings.tsx、tools.tsx | 偏好/兼容同步/备份/冲突 | 新设置子页、完整备份、附件状态、冲突预览 |
| styles.css、components/ui/* | 公共CSS/基础组件 | 清理旧规则、统一变量、保持CSP及稳定portal |
| i18n.ts、ledger-tools-i18n.ts、features/server-i18n.ts | 双语目录 | 新文案/error/ARIA同步补齐 |
| src/shared/domain.ts、api.ts、ports.ts | 交易/校验/宿主契约 | 附件安全DTO、查询/期间派生接口 |
| src/shared/ledger-sync.ts、ledger-crypto.ts | v1因果图/信封 | 按附件协议升级，严格v1读取和v2兼容 |
| src/main/store.ts、src/web/web-api.ts及各StateStore | SQLite/OPFS/IDB | 附件事务、迁移、状态发布 |
| src/sync/*、src/server/*、contracts/、src/api-client/ | 同步协调/HTTP/生成客户端 | 仅附件及版本能力必要扩展 |
| src/web/android-backup.ts、android原生backup插件 | 字符串导出桥 | 分块文件保存/读取能力，禁止大包放Activity Bundle |

新增文件建议：components/app-navigation.tsx、page-header.tsx、amount.tsx、empty-state.tsx；features/transaction-detail.tsx、statistics.tsx、search.tsx；src/shared/ledger-query.ts、ledger-statistics.ts、amount-expression.ts；renderer/search.worker.ts。附件新增文件见专项契约。仅在无等价职责时新增，不把shell继续堆成所有业务大文件。

## 2. 导航与路径

手机<768：底部四导航加中央“记账”动作，四个route link有aria-current，中央button只开录入。所有一级页可一键记账，管理子页保留导航；不重复显示FAB。平板768–1199：紧凑侧栏，图标+文字，顶栏动作。≥1200：224px侧栏，内容max1120px，顶栏账本/月/动作。实际DOM只让当前断点导航参与焦点。

| 新路径 | 内容 | 旧路径replace来源 |
| --- | --- | --- |
| /ledger | 首页账单 | / 有账本时 |
| /statistics | 周/月/年统计 | /ledger/menu/statistics |
| /budget | 月预算 | /ledger/menu/budget |
| /settings | 三组入口 | /ledger/menu |
| /settings/ledgers | 本地账本列表/创建/切换/原有移除 | 原AccountPanel内功能 |
| /settings/preferences | 隐私/语言 | /ledger/menu/settings |
| /settings/account | 账号/登录/设备会话 | /ledger/menu/account |
| /settings/sync | 主同步连接/状态/操作 | /ledger/menu/sync |
| /settings/sync/advanced | 原兼容账本/配置同步 | 新显式入口，偏好页也有链接 |
| /settings/backup | 完整备份与恢复 | /ledger/menu/backup |
| /settings/conflicts | 候选版本/差异/附件预览 | /ledger/menu/conflicts |
| /setup | 选择/创建/导入 | 原setup |

搜索为/ledger内的可返回面板，草稿、关键词、正则、金额/分类条件不放URL；不新增查询字符串泄露面。状态在session scope中保存，切账本清理结果/条件（dirty录入先确认）。新/旧未知路径显示可恢复404，不产生返回循环。file/native仍Hash，不为UI改成BrowserHistory。

日期参数白名单：保留month、type，新增统计period=week/month/year与anchor=合法YYYY-MM-DD。兼容规则：仅month时本月anchor默认今天，历史月默认月首；仅anchor时派生month；同时提供但不一致则month优先并将anchor归到月首。用户切统计期间或选日期同时更新month+anchor，其他财务页据month显示；切账单月份也更新anchor，设置往返原样保留。所有合法性用本地日历helper，不用Date UTC解析猜本地日期。统计type状态与账单过滤独立，默认expense；账单all不成为第三种统计类型。

无workspace进入财务页：显示选择/创建流程，创建后去账单。首次备份恢复直接adopt原workspace，不能先建另一个workspace再merge而造成ID冲突。

## 3. 视觉系统与组件行为

变量集中styles.css：背景#F7F8FC、白表面、正文#18243A、次文#5E6B80、brand#405DE6、income#147D64、expense#9A5A27、danger#B42318。系统中文/英文无衬线，tabular-nums；正文/输入16px、次文14px、标题24–28、摘要24–32、录入40。间距4/8/12/16/24/32，控件12/表面20/浮层24px圆角；图标20–24px，点击区域48px。普通流水不加阴影；弹窗/突出动作可轻阴影。

375标准页面空间预算：左右16、顶栏约64、月份48、摘要约104、过滤入口48、日标题32、每行至少64；实测首屏两笔而非固定高度裁字。320/大金额/200%允许摘要和金额纵排，不缩字体或省略有效金额位。

首页顶栏账本选择/状态，月份、三摘要、简洁查询入口、按日流水；日标题默认日期与笔数，不新加会绕过摘要隐私的每日金额。行主文案：商户优先，其次备注摘要，再次类别；次文类别+支付方式，主行备注截断仅限列表，详情完整显示。金额右对齐带方向；整行可键盘打开详情，不嵌套操作button。

金额组件仅格式化，禁止从格式化文本反算。摘要隐藏直接渲染掩码，不在属性/隐藏span/图表/live region留真实数值；眼睛独立保持布局。详情/搜索结果/统计金额仍可见并在隐私说明写清。保存高亮只变底色不动画数字。

动效按钮120–160ms、浮层进入200/退出160ms；prefers-reduced-motion关闭位移缩放，无装饰循环。图表与附件不延迟财务数据展示。CSP维持外链CSS、禁止unsafe-inline/eval；SVG属性或progress表达比例，图片blob:仅放行img-src，不能放开script/connect。

手机录入近全屏、桌面560px居中；详情手机sheet/桌面右抽屉；内部滚动与dvh/safe-area保证横屏保存可达。键盘/导航仅一层固定底区，正文留对应padding。额外系统文字键盘打开时自定义数字键盘收起，日期/保存仍能滚到。

## 4. 分类与计算键盘

分类来自当前账本全量有效/历史交易名字+内置本地化建议，去除同名重复（以现有规范化字符串为准，不擅自大小写合并历史ID）。分收支展示；已有名字按首次出现createdAt、交易id、split顺序稳定，建议补到尾部，新自定义即选中；未保存自定义仅草稿，不写伪交易。无持久化类别管理新业务，图标只对明确内置类别使用映射，自定义用统一图标。

四列为标准手机起点，放大字号自动减少列数、文字换行，分类网格可滚动。点记账首先显示网格，选中类别展开底部键盘；已有草稿直接恢复当前阶段。类型切换保留金额表达式/日期/备注/附件；不兼容类别清空前提示，禁止无声丢字段。

计算状态分表达式文本、已求值十进制金额、当前类别。数字、小数点、退格、+、-、日期、=/保存、备注、图片是主路径；物理键盘支持数字/小数/退格/+/-，求值与保存明确，Enter在表达式阶段只求值。

- 输入只接受十进制非负操作数和二元+/-，首版无乘除、括号、科学记数、eval。
- 每操作数按workspace精度通过decimalToMinorUnits转换BigInt，按从左到右加减；支持0–4精度，金额位数遵守原领域上限。表达式≤256字符、≤32操作数，超限行内说明。
- 多次小数点忽略并保持值；连续运算符以最后一个替换前一个；尾运算符求值报不完整，不能悄悄丢项。负/零结果可显示但保存拒绝；超精度不自动舍入。
- 单一数值显示“保存”；含运算未求值显示“=”；求值后显示结果和可回看的原表达式，再点保存。busyRef和mutation进度双重防重。
- 日期本月今天/历史月月首，恢复草稿不重算日期；错误保持表达式和所有字段。

## 5. 草稿、详情和返回状态机

稳定scope=profile+workspace；financial revision及budget heads在初始化时抓取。草稿包括类别、表达式/金额、日期、商户、支付方式、备注、附件staging句柄。关闭不卸载金融form，不承诺跨重启恢复。

| 事件 | 必须行为 |
| --- | --- |
| 中央记账，无草稿 | 新expense进入类别网格 |
| 中央记账，有草稿 | 恢复原字段/类别/键盘阶段/附件 |
| 类别子流程Escape/返回 | 只关闭最上层，恢复其trigger；保留Radix microtask焦点契约 |
| 录入关闭/Escape/返回 | 收起，保留会话草稿与图片staging，不写数据 |
| 切一级页 | 收起浮层后导航，录入草稿仍在；浏览器返回先处理顶层浮层，下一次正常返回 |
| 换账本/编辑另一笔/导入/创建新本 | dirty先确认；取消不改变scope；确认丢弃旧草稿并释放staging，不能跨本 |
| 保存中关闭/换scope/再提交 | 禁止，等待明确本地提交结果，不冻结整台应用 |
| 写入失败 | 所有字段/原revision/staging保留，相关错误可恢复 |
| write成功refresh失败 | 清理已提交草稿、关闭；“已保存到本机，列表刷新失败”，只重读 |
| 保存成功 | 清理草稿，刷新，播报本机保存与可见行底色高亮 |
| 退出/刷新 | dirty启用beforeunload；提示受浏览器限制，不宣称必定恢复 |

预算/同步配置等会随子页卸载的dirty表单也必须确认。详情完整显示交易及附件状态、独立编辑/删除；删除携带观察到revision；过期失败保持详情不自动升级token。多分类交易只读保护继续，附件存在不成为允许改单类别的理由。冲突并列/窄屏上下显示完整候选与图片，不预选。

## 6. 查询与正则执行契约

建议纯查询输入：scope、snapshotGeneration、dateFrom/dateTo（可空）、type、categories[]、minimumMinor/maximumMinor（可空）、query、mode=text/regex。输出仅匹配交易ID、数量、按币种整数收入/支出/结余；展示数据来自同一generation快照，换本/刷新不混旧结果。

- 默认当前账本全时段；dateFrom/dateTo包含边界；起>止报错。金额用abs(amountMinor)，上下界包含、只填一边合法、下>上或非法精度报错。普通查询未填全条件就是全部有效交易。
- 分类为精确名字匹配，列表多选OR；任一split命中则返回整笔一次。其他条件AND；结果合计明确为“匹配交易合计”，与分类拆分图表口径分开。
- 默认text：对商户/支付方式/备注/各split类别逐字段做忽略大小写包含，不跨字段拼接制造虚假命中。不解析金额为文本；金额走明确区间控件。
- regex：显式开关，用户输入pattern本体而非/pattern/flags，固定iu，禁止g/y状态。首版支持ECMAScript正则表达式，不承诺高级模式的执行时效；界面帮助只介绍 . * + ? [] () | ^ $ 及常见转义。无效语法明确错误，不退化text；复杂模式达到预算即报“表达式过于复杂，请简化”。
- pattern≤256 UTF-16码元；不在主线程执行用户RegExp，使用独立module Worker（与SQLite worker分开）。先在worker compile，再每批最多128条预过滤候选执行；每批500ms无完成则terminate，整次实际匹配预算5s，不含UI去抖150ms。新查询/换scope立即terminate旧worker并丢弃旧jobId/generation结果；不要Promise.race后让旧worker继续跑。
- Worker只收必要字段和金额/日期，不收附件字节/凭据；结果只回ID/整数总计，最多一项活跃任务。超时/取消不以部分结果伪装完整结果，UI可显示重新输入提示。
- Worker不可用则禁用正则并说明，普通搜索仍可用；在支持的平台验收必须证明worker可用，不能以fallback算正则功能通过。Vite生产缓存包含worker资产，file/Electron需真实打包验证CSP路径。
- 已用条件以chips呈现，单项删除和全部清空；空结果/无输入/加载/错误有区别。搜索状态与URL分离，语言变化仅重格式化，不改变条件。

为何采用独立Worker：能在UI之外运行并终止任务；仅输入长度限制或setTimeout包装主线程RegExp无法保证UI可响应。参见 https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate 和 https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers 。这些支持技术机制，时间阈值是本项目设计默认，需性能验收。

## 7. 周/月/年统计契约

在src/shared新增纯函数，输入有效交易、period、anchor、本地today、type，输出start/end、整数total、整数average（及分母单位）、bucket序列、分类汇总、最大交易列表。不得依赖Renderer二次可变总计；宿主快照交易来自冲突投影，显式过滤deletedAt，不把冲突头自行纳入。

- week周一至周日，含跨月/跨年；month自然月；year自然年，按交易YYYY-MM-DD本地日期归组，不通过UTC timestamp切天。
- 周/月每桶一天，年每桶一月；全部桶补齐，未来桶显示“未到日期”而非实际已发生0，可保持图形空位。当期均值分母：截至today的含当天日数；year为截至当月含当月的月份数。历史完整期间用全期；纯未来期不显示均值。取整数最小单位四舍五入（非浮点），标注“日均/每月平均”。
- 分类按对应type的split金额绝对值汇总，降序，平手按稳定类别名字；总额按整笔，测试证明split之和等于整笔。
- 趋势图用于时间，环形图用于类别占比，两者显式切换；环图前五类+其他，列表仍列全部，0总额不除零。比例先BigInt有界定点计算再转换number，图形不反向驱动金额。
- “最大支出”按交易abs金额降序、日期降序、id打破平手，默认前5条，可查看全部。分类钻取保留period/anchor/type，按金额/时间切换；该处split命中的“类别金额”需明确显示，避免全笔金额冒充类别贡献。
- 点击/键盘聚焦趋势桶显示日期/总额/该桶前3笔；必须提供同等文本列表。数据不依赖悬停。不因先前鲨鱼点图无浮窗证据而声称对齐了未观察行为；这是Luna确定的设计。
- budget始终月度，统计week/year不改变其金融规则；使用共享anchor所在month作为预算页月份。

## 8. 管理功能保留

| 能力 | 新位置 | 保护 |
| --- | --- | --- |
| profiles创建/切换/原有删除 | 顶栏/ledgers | dirty确认，原移除影响说明 |
| 登录/退出/设备名/设备会话撤销 | account | 不自动登录，原离线/error/禁用保留 |
| 新建或连接远端/解锁/模式/立即同步/断开 | sync | 先状态后操作，附件状态也反映，凭据不入Query |
| 服务端偏好同步 | sync独立区段 | 不称为财务同步 |
| 兼容S3账本/配置连接/测试/清除/记密钥 | sync/advanced | 仍可达，平台不支持明确说明；v2具体兼容按附件契约 |
| 隐私/语言 | preferences | 本机保存，三个眼睛session独立 |
| 完整备份/恢复/旧备份导入 | backup/setup | merge/adopt，非覆盖；所有图完整才成功 |
| 交易/预算冲突 | conflicts | 原head比较与用户选择，附件预览可恢复失败 |

同步状态将本机commit、上传pending、附件待下载、失败、冲突分开；缺图不能宣布完整同步成功。全局可离线记账，网络失败不遮主界面。清除连接/换scope取消请求及对象URL；不把便携偏好sync状态当账单sync。

## 9. 未实施与验证边界

本文件中的新API、worker、图表和键盘全部是计划。现有代码只作证据，未来需逐层测试。完整附件方案以attachment-contract.md为准，不由UI实现代理自行选格式。不得放宽既有CSP/权限来让新功能看似可用。首次开发按implement.md工作包顺序，最后由独立检查复核acceptance.md。
