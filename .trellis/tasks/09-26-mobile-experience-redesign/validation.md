# 移动改版集成验证

用户已确认三轮方案及两个周期头部增补。全部三轮产品实现和逐页
原生操作完成；最新“统计也有左右箭头”已实施，最终新候选补验通过。
验证按实际源码/候选区分，不以旧 APK 或布局草案冒称新版通过。

## A01–A15 问题闭环

| 审查 | 改版结果与实际证据 |
| --- | --- |
| A01 详情与图片 BACK | 第一轮真实 BACK 图片→详情→账单；r1-image-* |
| A02 统计分类埋在长列表下 | 第二轮分类首屏、紧凑趋势、完整披露与钻取排序；r2-statistics-* |
| A03 设置重复三排导航 | 第三轮四组七卡，总览与子页单层导航；r4-settings-overview 及全部子页 |
| A04 录入双金额区/IME/保存 | 第一轮单金额、分类不弹 IME、文字 IME 下保存可达；r1-entry/category/more-info |
| A05 分类管理挤窄与按钮堆积 | 第三轮类型切换、独立新增、行菜单/usage；真实 BACK 恢复 opener；r4-category-*。修改/删除/in-use 修复用独立 fixture |
| A06 筛选挤走账单/IME底栏 | 第一轮独立面板、1/3结果/清空、真实 IME 底栏让位；r1-filter-* |
| A07 长导航标签 | 五项短底栏同排；r1-home，两语言窄屏 E2E |
| A08 字体和容器层级不一致 | 三轮系统字体/紧凑分组/48px触控；最终 r4-*；两语言320/375/457 header/设置/长内容回归 |
| A09 详情空卡与重复标题 | 键值详情、省略空备注；r1-detail |
| A10 预算页绕路切月 | 页内箭头/系统月选择；真实 IME、取消保留、确认独立月份；r2-budget-*，r4-budget-native-picker |
| A11 偏好/账本实现说明 | 首屏必要控件、低频说明渐进展开；r4-preferences/ledgers；没有删必要错误或恢复说明 |
| A12 账号动作与平台说明 | 主操作和分组清楚；r4-account/IME；密码显隐与退出清理。未提交真实账号；绑定/解锁/长设备名用浏览器 fixture |
| A13 同步前提与高级入口 | 日常页安静，状态留设置，同步主操作与高级入口分离、路由保留；r4-sync/advanced。保留既有活跃期自动机制，未新增 Android 后台服务 |
| A14 备份相反操作混在一起 | 保存/合并独立入口与独立表单；r4-backup-*；真实 SAF 取消/保存、解密五笔/图片；r3-backup-native-* |
| A15 冲突空态与欢迎分心 | 冲突空态简化；r4-conflicts。隔离真实空工作区欢迎/高级、首次恢复取消/错密码/正确恢复；r3-emulator-*；有冲突解决用独立 fixture |

## 全14注册路径与主要弹窗

| 路径/表面 | 原生证据及边界 |
| --- | --- |
| / | 隔离空工作区欢迎 r3-emulator-welcome；手机已有账本进入主路由 |
| /setup | 隔离显式路径 r3-emulator-setup-route，核心与高级项 |
| /luna | 每轮手机账单；筛选、详情、图片、录入属于弹窗，未虚构新路由 |
| /statistics | r2-statistics-*；r4-statistics-centered/week/year；r5真实月/周/年左右箭头与系统picker |
| /budget | r2-budget-*；r4-budget-centered/native-picker；dirty/heads/pending 另有风险 fixture |
| /settings | r4-settings-overview 四组七卡 |
| /settings/account | r4-account/IME；r3合成未提交密码显隐/退出清理；隔离首次连接 |
| /settings/sync | r4-sync；账号直达与原高级 hash 导航 |
| /settings/backup | r4-backup-choices/save/import；r3真实SAF取消/成功；隔离恢复 |
| /settings/conflicts | r4-conflicts为空态；有冲突由独立fixture验证，未制造手机冲突 |
| /settings/ledgers | r4-ledgers；不切换/删除既有用户账本 |
| /settings/categories | r4-categories/menu/usage/back；只读手机分类；写入/修复用fixture |
| /settings/preferences | r4-preferences；没有改手机既有偏好 |
| /settings/sync/advanced | r4-advanced，仍有原注册路径，无主页面抢占 |

主要弹窗补验包括：筛选、详情/图片、单金额录入及更多信息、分类选择、
分类usage/管理、预算未保存确认、真实月份选择器、DocumentsUI和恢复。
IME、系统 BACK、取消/重试/退出的结果分别记在三个 child device-validation；
绑定/冲突/多 split 等独立 fixture 不冒称真实服务或真人账号验收。

## 原生数据与候选边界

图库 captures/mobile-redesign-native/index.html 收录真实 ADB 原图及
各组 APK SHA256，原始只读 JSON 位于 /tmp/luna-mobile-redesign-20260926。

- 第一轮 APK0404e9fe…：原三笔/账本/类别/预算/偏好保持，仅新增明确
  QA26合成0.01图片记录。手机图片由API fixture构造，不当成原生选择成功。
- 第二轮 APKf4bf6eb2…：四笔与原图/heads/偏好保持；预算dirty切月与
  真实IME/BACK/系统月选择取消通过。
- 第三轮升级前五笔基线 r3-preinstall-data.json：原四笔完整，
  用户已有新增705.00支出也保留，未归因成测试记录或删除。
- 候选1e439c6f…：首个居中检查失败（框中心而内文靠左），证据保留；
  真实SAF取消/成功、6004bytes备份解密、隔离首次正确恢复在此候选完成。
- 候选868ff024…：NativePeriodInput实际月份 glyph 中心/系统中心触摸/
  indicator触摸/取消、全部八设置子路由、重启/五笔/图片保持通过；
  隔离原生图片选择、预览、保存、重启读回也在此候选完成。
- 用户看过868候选，指出统计缺左右箭头；这属于具体修改反馈，
  不记成最终视觉接受。已实施 Navigator/UTC 周年切换，新 APK 实际补验通过。
- 最新 APKdcb695fe…：三页input/前后按钮完全相同几何与可见字中心；
  实际 ADB 物理触摸统计月/周/年箭头，Input/Router正确切换，原生月
  选择/BACK取消可用；r5-*。升级前后五笔/原图/settings/heads完全相同。
  完整hash见第三child device-validation及图库首组。

实际 SAF 备份恢复完整财务图与附件，不承诺移植客户端偏好。隔离 AVD
仅新增一笔明确“原生图片选择 QA26（隔离）”0.01记录，手机未新增本轮
真实图片验收记录。全部已有五笔与两张隔离图的 bytes/hash 均读回核对。
只清理精确匹配的 QA 临时文件、媒体行和本次 forward；AVD已停止。

## 自动质量验证

868候选冻结 renderer8e8d28fc…：最终 full Web286通过/8 production-only
跳过/0失败；production14/14覆盖全部8项跳过；unit214/214；type、Web
build、独立focused10/10、Linux x64 Electron package通过。生产回归
含冷离线写入、深链、更新等待草稿、坏更新保留旧版、跨tab写入。
最新箭头冻结 renderer3fff5ee3…：实施者 type/build/unit214/focused10
通过；独立全范围审查、type/focused18、full290通过/8生产跳过/0失败，
生产14/14（14.2秒）、最终Electron package/Android build通过；授权
手机真实箭头/Input/Router/picker及数据补验通过，无运行中检查。
无独立lint脚本；语义/focus/布局回归不能替代TalkBack。

## 提交与完成门

human-required：主观视觉仍需用户实际反馈；用户最新反馈是精确的
统计箭头调整，已执行，无需再次询问方案授权。待最新候选验证后
按 .trellis/spec/trellis-plus/index.md 的 submit-ready gate 对具体
残余作评估，不把默认选项/elapsed time当作接受。

Electron实际运行在产品启动前因 Chromium SUID sandbox/SIGTRAP
环境限制不可用，captures/electron-smoke-round1.json 保留诊断。
package通过不代表桌面native运行/视觉通过；未禁用sandbox绕过。
真实私有账号/服务同步及TalkBack也不冒称已验证。

尚未stage/commit/archive。原21项dirty基线、混合hunks和无关任务保留，
归属见 change-scope.md。必须先完成候选及审查门，再显式处理本轮
路径/混合hunks；未核对继承的后端/同步差异不进入改版提交。

## 2026-09-30 收尾状态复核

按上述实施、独立复核和三份实机记录，将三轮子任务 PRD 的功能验收项和
已完成的执行步骤更新为完成；每轮只保留父级用户视觉反馈/提交归档门。
另在 [布局任务验证](../09-26-mobile-layout-polish/validation.md#2026-09-30-android-11-landscape-spot-check)
补记用户提供的 Android 11 横屏板隔离包保存/重启读回结果。该设备不是
457×999 目标手机，故没有替用户确认主观触控舒适度，也未替代 Electron
原生 smoke 或 TalkBack 验证。

当前代码仍未 stage/commit。差异边界和原有 21 项 dirty baseline 的混合
hunks 尚须按 `change-scope.md` 拆分。完成用户主观反馈和提交计划确认前，
三轮子任务、父任务及独立布局任务均不归档；较早的发布集成、自托管同步、
09-12 大改版继续保持 `in_progress`，各自未完成标准见对应验收记录。

三轮子任务的 implement/check JSONL 原来还指向已归档的移动 UX audit 路径，
现已改为其 archive 路径。重新执行三份 `task.py validate` 均通过；仅保留
`component-guidelines.md` 超过上下文注入大小上限的提示，无缺失 context 项。

## 2026-09-30 Android 16 当前工作树完整 smoke

用当前工作树构建的默认 APK（SHA256
`932c535aa965ae2d58432806ee4fbb09884e935a4380c7fef04d28d9b127ee78`）在
仅 Luna 使用的 `luna-smoke` Android 16 AVD 完整运行
`scripts/smoke-android.ts`，结果 `passed`。19 项覆盖离线首次启动/写入/
进程重启读回、隐私与 viewport、日期投影和系统日期选择、菜单/弹窗/草稿
的实体 BACK、类型切换确认、WebView↔Node 加密账本合并、原生图片选取及
重启读回、SAF 备份取消/保存/解密、设置同步和离线重启。

这次复跑发现并修正了 smoke helpers 对移动布局的旧选择器：设置总览改用
`data-settings-area` 卡片；Android 图片录入使用中央记账入口和快捷分类格；
备份页显式选择“保存加密备份”。类型切换断言按现有合同校准：接受切换会
清掉不兼容的分类并保留金额。APK 应用源码未因这些 smoke helper 更新而改变。
本轮专属 Compose 项目已 `down --remove-orphans`，项目容器和网络均已确认为
空。该证据补强自动 Android 覆盖，但仍不替代已记录的目标手机视觉/触控
舒适度反馈、TalkBack 或 Electron 原生对话框审查；提交与归档门保持打开。

为复核 Electron 包装阻断，早先对用户提供的 x86 主机只做了只读环境探测，
当时尚未启动桌面进程。该阶段结论已由下文 2026-09-30 最终 ZIP 验收更新。

同日尝试重连原目标手机 `192.168.9.11:34971`，ADB 返回 `No route to host`；
当前 ADB 列出的另一台 `PLR110` 不是此验收目标，未对它执行任何命令。没有
安装 APK、改动手机数据或把旧候选结果冒称为当前候选的人工视觉/触控验收。

## 2026-09-30 x86 Linux ZIP 与最终分发包 smoke

后续按用户授权在 `192.168.9.13` 的私有 `/opt/luna-archivecheck-20260930`
工作区执行。只传入当前源码、Forge 配置和已安装依赖；在一次性 Node 22
容器内临时安装 node-gyp 所需的 Python/C++ 工具，并只读挂载主机现有
`/usr/bin/zip`。未安装主机系统包。`npm run make` 成功生成 Linux x64
分发包：`luna-linux-x64-0.1.0.zip`，126,756,810 bytes，SHA256
`1af59d1c4a282213f1d0084d20d8d8d56e93481a0a24a0082dabf924edae13b4`；
`unzip -t` 报告压缩数据无错误。

从该 ZIP 解包后，在默认 Chromium sandbox 下用独立 `userData` 运行
`--smoke`，应用退出码为 0。SQLite 中有 3 笔预期测试记录（包含
`UI form smoke`），3 条 pending operations；设置文件读回 `zh-CN` 和
`hideSensitiveAmountsByDefault=true`。这验证了分发 ZIP 的启动、设置、
渲染器表单/IPC 写入和持久化路径；未传 `--no-sandbox`。

smoke 日志仍有一条已解释的安全拒绝：测试主动销毁窗口、清空
`mainWindow` 后，React 的待处理 `server-status` IPC 到达，检查结果为
`window-missing`。该请求被正确拒绝；它不影响退出码、最终 3 笔记录或
烟测断言。safeStorage 的实际挂起根因也已修复：basic_text 后端不再调用
异步可用性探测；其他后端的探测最多等待 2 秒并缓存结果，不可用时仅
使用 session-only secret 存储，不会降级为明文持久化。当前 `npm test`
214/214、`typecheck`、Linux x64 `package` 和完整 `make` 均通过。

这补齐的是桌面自动启动与分发包验证，不替代目标手机上的主观视觉/触控
舒适度判断、TalkBack/assistive technology 或真实服务账号跨设备验收。
尚未 stage/commit/archive：用户已于2026-09-30确认视觉通过；父任务和三个
子任务继续等待 Phase 3.4 exact-hunk 分组提交审查。

## 2026-09-30 Android 11 board route/layout recheck

当前工作树的 `.lan` APK 在 AIO-3568J Android 11 开发板
`192.168.9.14:5555` 上以 `adb install -r` 更新到已有合成测试包，APK SHA-256
为 `5a0988ed84369890913189b971a69e7e4c0e89510ec9956ab3c43645641c8b62`。
Playwright/ADB 自动化打开首页、录入、统计、预算、设置和偏好页面，四个路由
在 1098px CSS WebView 宽度下均无横向溢出；录入与首页主要控件几何高度为
48–64px。备份页面实际拉起 Android DocumentsUI，显示 Download 中的合成
`board-check.luna-backup`，并返回应用读回该文件名；Android 11 网格在首次
点击后用 `TAB`/`ENTER` 完成无障碍焦点激活。报告和截图见子任务的
`../09-26-mobile-layout-polish/research/android11-board-layout-20260930/`。

该轮只使用隔离 `.lan` 包，没有清除、卸载、账号操作或触碰其它 Luna 包。
这是 Android 11 横屏/原生边界的自动证据，仍不替代 `22041216UC` Android 15
设备证据、TalkBack 以及 exact-hunk 提交审查；用户视觉通过已由本轮明确记录。
