# Luna 改版接管：实现进行中，主线能力已落地

- 目标：实现用户熟悉的类别优先记账、计算键盘、周/月/年图表、简单正则与金额/多分类筛选，并让图片进入本地保存、加密备份和HTTP/S3跨设备同步。
- 历史授权：**用户已明确“根据新的主线；开始实现”。** 本次已执行任务校验和 `task.py start`；当时允许实现，不自动提交、部署或归档。
- 当前指令（2026-09-13）：用户已明确授权提交当前本地进度；后续主动工作聚焦前端与体验，部署、跨端联动、真实同步及相关验收后置。
- 当前状态：2026-09-12修订2规划已整合并通过规划一致性复核，任务已切换为in_progress；P1–P5 主要代码与本地验证已完成，嵌套 Escape 焦点边界也已在生产桌面回归中修复，仍有平台/人工验收未完成。
- 阅读顺序：本文→implement/check manifests→prd.md→design.md→attachment-contract.md→implement.md→acceptance.md；research是证据，历史建议冲突时以修订2契约为准。
- 已完成：代码接口核对、鲨鱼官网/授权ADB界面观察、附件专项源码研究、完整规划；共享安全DTO、v2账本/附件、HTTP/S3对象、同步、完整备份、Web/Native存储、四页 UI、统计趋势桶/分类钻取、设置子页与兼容路由已实现；录入类型切换保护不兼容分类、分类网格原生按钮语义和图片 staging 提交锁已补齐；独立规划复核发现的四项问题均已解决，最终PASS见research/plan-review.md。
- 已验证：`validation.md` 记录了 203 个共享单测、服务端/协议/同步门禁、按目标 checkpoint、能力协商、带续租的 durable profile migration lease、附件同步与 local-only profile 密文迁移、桌面与窄屏 Chrome 场景、真实 HTTP 图片附件双浏览器恢复、完整服务恢复烟测、Web/服务端/Electron package 构建，以及 Docker JDK21 APK 和 Android 16 `luna-smoke` 隔离 AVD 完整 smoke。
- 未完成：标准 Electron packaged smoke 受当前容器 Chromium sandbox 权限阻断（环境等价 `--no-sandbox` 进程检查退出 0）；Electron 原生文件对话框、真实跨设备图片同步、真实部署 URL、真实浏览器200%缩放、辅助技术/用户视觉反馈仍未完成。新增的打包 Renderer file-input chooser→IPC→解密读回 smoke 已通过，但 Playwright 拦截宿主 chooser。Android 系统选图已在隔离 Android16 AVD 的真实 DocumentsUI 路径通过。宿主Node20的better-sqlite3初始化仍会段错误，但账号浏览器 E2E 已在兼容 Node24 运行时、loopback 服务和合成账号下桌面/窄屏 2/2 通过。合成截图及 320/375/768/1440/横屏与 640px CSS 等价视口的本地视觉检查已完成，证据目录见 `validation.md`。生产 Web Service Worker 离线验收已通过重建后的本地 dist-web 桌面/窄屏 Chrome 各 34/34（排除 real server login）。
- 下一步：先继续前端与体验打磨；取得额外授权和合适环境后，再处理 Electron、真实部署账号、真实200%/辅助技术、用户视觉验收及跨设备图片同步。当前不连接 VPS、不安装/清空用户手机，不把部署或联动验收当作默认下一步。
- 工作区：/home/wkyuu/cargo/repo/34-luna，paycheck-to-paycheck；规划开始HEAD 2b9534f。当前分支/HEAD在接管时重新验证。
- 本轮未连接VPS、未安装/清空用户手机；ADB查看鲨鱼已结束，未修改交易。其截图含私人账单，仅/tmp/luna-shark-device，不提交或公开。
- 最近更新：2026-09-13；实际实现与验证记录见validation.md。
- 主线登记：用户已授权写入[项目主线](../../mainline.md)，并已在本次明确恢复实施；当前仍未声明产品交付完成。

## 1. 最关键的已确认事实

| 事实 | 状态 | 证据 |
| --- | --- | --- |
| 用户要简单正则、多选分类、金额上下限，图片随加密备份和同步 | 确认 | 本次用户明确回复；prd UX/QU/AT需求 |
| Flutter取消，继续React/Capacitor | 确认 | 用户“还是不考虑了”；prd |
| 鲨鱼先完整网格再选类别展开计算键盘；周/月/年及环图 | 确认 | research/shark-device-assessment.md实际截图索引 |
| 当前原始graph API向renderer暴露，不适合新增密钥字段 | 确认 | src/shared/api.ts、preload.ts、main/ipc.ts；附件研究 |
| 当前graph8MiB/envelope12MiB、Android整JSON桥12MiB | 确认 | ledger-sync.ts、ledger-crypto.ts、LedgerBackupPlugin.java |
| 当前无附件字段/存储/HTTP对象端口 | 确认（检查时） | domain.ts、server/schemas/http.ts、http-object-store.ts |
| 接管时 Native schema2/profile3、Web状态2、IDB1 | 历史基线（已实现迁移至 Native schema5、Web state v4、IDB2） | main/store.ts、web/web-api.ts、browser-state-store.ts |
| 当月summary但快照有跨月份交易 | 确认（检查路径） | main/store.ts getSnapshot、web/web-api.ts getSnapshot；其他路径还要集成测 |

## 2. 不相关dirty基线

下列是进入本任务之前已有变化，不覆盖、不整体stage、不自动归档关联任务：

- .gitignore
- deploy/.env.example
- deploy/README.md
- scripts/smoke-server-restore.mjs
- src/server/cli/generate.ts
- .trellis/tasks/09-11-repair-generated-sdk-https/
- scripts/smoke-deployed-sync.ts
- src/api-client/generated/core/

附件未来确需SDK/schema/恢复覆盖扩展，也必须保留并辨别这些基线差异；生成前先读当前修复，不恢复旧文件。如果新增未知变化，先确认归属，不能凭路径认为本任务所有。

## 3. 已选规划方向与默认值

详见三个契约文件，不再使用原计划的“右下FAB、金额优先、八建议、仅月统计、不改协议”。

- 四导航+中央记账动作；完整稳定类别网格→加减金额键盘；日期/备注/图片贴近键盘。
- 月白靛蓝、系统字体、Lucide；48px控件、正常375首屏两笔。
- 搜索全当前账本日期、显式正则开关、类别OR其他AND、金额abs含边界；正则module Worker可terminate。
- 周一开始，周/月按天、年按月；line/donut、类别排行和最大单笔分开；BigInt派生。
- 每笔最多9图、规范化2MiB/2048px、含历史512MiB默认账本额度；这些是设计默认值，用户未逐项指定，可最终审阅调整。
- graph v2 descriptor+独立不可变密文，图中每图片密钥只在host；安全DTO，不公开raw图；唯一CAS头和旧client fail-closed。
- 有界流式完整二进制备份，含所有历史/冲突/删除引用；保留旧v1导入merge/adopt；Android不能沿旧12MiB JSON桥偷省。
- 所有新协议具体上限/API/错误/顺序以attachment-contract为准。

## 4. 假设与待验证（不是待实现者随意决定的产品空白）

- Web/Electron worker及CSP、Android选图/流式SAF可在现有工具链实现：Android 系统选图与流式 SAF 已由隔离 AVD 证明；真实设备与跨设备同步仍需另行授权/验收，失败修实现或更新明确限制，不静默缺功能。
- 512MiB备份目标内存/设备空间：待acceptance压力场景测量，不以规划估算作为通过。
- 各profile wrapper都返回完整snapshot并可支持新安全API：待P1调用图和集成tests确认。
- 旧客户端fail-closed和HTTPminVersion：待旧fixture/binary及竞态测试，不能仅看新decoder自测。
- 测试工具、Docker、Chrome、Node/ABI、端口：本轮未运行产品基线，接管先查。

## 5. 下一步与停止条件

1. 用户发出恢复实施指令后，在repo根执行git status/current与读取计划；判据：权限/归属明确，任务仍planning。没有指令则继续规划，不派实现。
2. 跑task.py validate；读spec与package scripts，记录baseline；之后task.py start。任务上下文失败按实际错误修复，不能跳过。
3. P1冻结codec/安全DTO/fixtures，再P2本地事务、P3两transport、P4完整备份、P5UI、P6验收。允许有界独立并行，先约定shared/api与shell所有权。
4. 每包出口需实际测试，写validation.md更新当前状态。协议不能满足则停在该包修契约，不做临时无图成功路径。
5. 任何连VPS、安装/清空用户手机、真实账号/云数据操作需新的明确授权；当前ADB授权仅观察鲨鱼，不可泛化。

## 6. 历史已修正

- 曾因初始消息进入in_progress并派实现代理，用户要求仅规划后已中断，git确认无产品代码修改，任务改回planning。
- 第一版“不引入自建计算器/年度趋势/图片、无API改动”已被后续明确需求取代；本目录design/implement已整份重写，不靠尾部补丁维持矛盾正文。
- 先前手机锁屏仅为当时状态；用户解锁后已完成必要观察。04-entry.png实际为分类统计，别误当录入。
- UUPM自动推荐Newsletter/深色/远程字体不适用，按用户设计舍弃；原始结果只供溯源。

## 7. 实施进度与可验证接续点

- 共享层：`src/shared/attachment-contract.ts`、`full-backup.ts`、`full-backup-session.ts`、`ledger-record.ts`、`ledger-query.ts`、`ledger-statistics.ts`、`amount-expression.ts` 已落地，并由共享测试覆盖边界、冲突、加密和流式分块。
- 宿主层：Electron SQLite/IPC、Web SQLite-WASM/OPFS/IDB、Android SAF 流式备份、HTTP/S3 附件对象和服务端配额/幂等接口已接入；旧 v1 读入与旧菜单 deep link 保留兼容。
- UI层：一级账单/统计/预算/设置导航、设置子页、分类优先录入、加减计算器、图片安全预览、搜索筛选、周/月/年统计、趋势桶键盘明细、分类金额/日期钻取、按日流水、键盘可达的完整交易详情和新旧路由验收已接入。
- 最后一次完整有效 Web 命令：开发服务器的 `chrome` 与 `chrome-narrow` 合计 68 passed、6 skipped；`LUNA_TEST_PRODUCTION=1` 的重建后本地 dist-web 两个项目合计 74 passed（均排除 real server login 账号场景）。最终合成视觉证据目录为 `/tmp/luna-ui-redesign-20260913/`，其中包含交易详情和统计截图。
- 继续工作前先读本文件末尾和 `validation.md`；不要清理脏工作区，不要提交/部署，不要把真实设备或VPS操作当作默认下一步。

## 8. 2026-09-12 实施接续点

- 主线实现仍为 `in_progress`，但共享、宿主、HTTP/S3、完整备份和 UI 的主要本地路径已落地；最新 `./hako npm test` 为 203/203，server tests 为 26/26、server-sync 为 9/9，开发桌面与窄屏 Chrome 合计为 68 passed、6 skipped，重建后的生产桌面与窄屏 Chrome 合计为 74 passed（均排除 real server login）。本次 320px 视觉检查修复了大金额操作区溢出和固定底栏覆盖首屏入口，并加入回归断言。
- 当前最重要的并发保证是：源 profile 复制前持久化 `MigrationLease`，复制期间 graph/附件/restore/binding/checkpoint 写入被拒绝，长复制按节流策略续租，失败或过期后可恢复；真实第二 adapter 写入阻断已经有测试证据。
- 另一个关键兼容保证是：远端 payload 版本 checkpoint 按 target identity 保存，v2 已观察目标拒绝回放 v1；服务端 capabilities 不足时在发布前 fail-closed。
- 这次浏览器重跑先暴露并修复了 SQLite-WASM 旧表迁移检查误报 `duplicate column name: migration_json`；不要回退到只用 `PRAGMA table_info` 首行的实现。
- 本次接续又收紧了所有浏览器侧 ID：Web/Renderer/附件/完整备份会话统一使用 `src/shared/secure-random.ts`，`randomUUID` 缺失时改用带 v4/variant 位的 `getRandomValues`，无安全随机源显式失败；`Math.random()` 已从产品代码移除。新增单测及 Chrome 缺失 `randomUUID` 的完整备份下载回归均通过，Electron package 也重新通过。
- 仍待用户/环境授权：`javac`、正式 Electron sandbox smoke、真实部署 URL、真实浏览器 200% 缩放、辅助技术与用户视觉反馈，以及真实跨设备图片同步。Android 隔离 AVD 与系统选图已通过。账号本地产品流程已在兼容 Node24 的 loopback E2E 桌面/窄屏 2/2 通过，宿主 Node20 的 better-sqlite3 段错误仍是运行时兼容性记录。合成截图已在 `/tmp/luna-ui-screenshots-1789228380712/` 人工查看，生产 Web offline/Service Worker 已在重建后的本地 dist-web 的桌面与窄屏 Chrome 各 33/33 通过（排除 real server login）。未取得新授权前不连接 VPS、不安装或清空用户手机、不提交或归档。

## 9. 2026-09-13 收尾复核

- 最终窄屏修复（操作区换行、`≤520px` 顶栏间距、状态胶囊省略号）及 `320×740` 固定底栏回归已在开发/重建生产 Web 两个 Chrome 项目通过；最终截图目录为 `/tmp/luna-ui-redesign-20260913/`。
- Node22 `typecheck`、198 项单测、Electron package、任务校验和 diff whitespace 检查均通过。仍未提交、部署、连接 VPS 或操作用户设备。

## 10. 2026-09-13 主线实现收尾

- 账单列表已按日期分组；每笔交易的主内容是可聚焦按钮，打开完整详情面板，显示金额、日期、分类拆分、商户、支付方式和未截断备注，并提供独立编辑/删除与图片入口。长备注只在列表摘要中单行省略，不改变详情数据。
- 列表主文案现在按商户→备注摘要→分类降级；窄屏长标题单行省略，避免把标签/金额挤到下一行，完整备注仍只在详情显示。
- 移动端操作保留 48px“更多”入口，桌面端继续直接显示 Edit/Delete；现有浏览器测试已适配两种操作方式，避免以隐藏 DOM 冒充移动端可达。
- 新增 UX02 合成回归：375×812 下 3 笔记录验证月份、三摘要、两笔交易、中央记账动作、详情 Enter 打开、焦点返回和详情→编辑；该回归包含在最新开发/生产桌面与窄屏全量矩阵中。
- ST02/ST03 统计交互回归已加入：趋势条可用键盘选择并显示时间段/总额/前三笔，分类行可用键盘打开明细并按金额或日期排序；四个 Web 回归矩阵均通过。
- 录入回归确认收入/支出切换在分类不兼容时可取消或确认清空，分类网格不再覆盖原生按钮语义；图片 staging 未完成时保存按钮禁用。相关回归包含在最新开发 `68 passed、6 skipped`、生产 `74 passed` 矩阵中，Electron package 通过；标准 smoke 仍记录为容器 sandbox 阻断。
- 嵌套分类对话框的 Escape 处理改到 Radix `onEscapeKeyDown` 边界，避免生产桌面上原生 `onKeyDown` 捕获过晚造成父对话框连带关闭；相关开发/生产桌面与窄屏全量回归通过，微任务焦点恢复契约和 CSP 断言保留。
- 统计最大支出共享结果保留完整排序，UI 默认前 5 条并可展开全部；统计日期按 locale 格式化，趋势使用 `progress`、环图使用 SVG，去除统计 inline style。金额表达式阶段 Enter 只求值，空正则不再隐藏账目；交易详情/图片查看器的 Escape 也已统一到 Radix 层。新增行为由本轮开发/生产全量 Web 合计 `68 passed、6 skipped` / `74 passed` 覆盖，共享单测 `199/199`。
- 当前可继续工作的边界只剩 `validation.md` 所列平台/人工验收；在新授权前不运行 VPS、用户设备、真实部署或提交操作。

## 11. 2026-09-13 Android 隔离验收

- Docker JDK 21 的 `android-apk` target 完成 Gradle `assembleDebug`、`apksigner verify` 和默认 UID artifact export；APK SHA-256 为 `c5d3704f1345aa6e9b5d4f3f3d3a0f9bc3ef96e7f982d86357b461056cddbb83`。
- 当前 `luna-smoke` emulator image 在 Android 16 AVD 上验证了离线首启/写入/重启、隐私与无 Service Worker、硬件返回、真实 DocumentsUI 选图、WebView↔Node 加密合并、SAF 取消/保存/解密恢复、设置同步及最终离线重启；脚本输出 `result=passed`，只连接 `emulator-5554` / `luna-smoke`，容器已清理。
- 系统选图用临时 MediaStore 索引暴露合成 1×1 PNG，断言了 native handle 分块读取、规范化、加密 staging、离线保存和 force-stop/reopen 后的真实字节/尺寸；文件和媒体行在 finally 清理。为 Android WebView 的输入法收起/CDP target 瞬时边界，smoke 截图改用 `AndroidDevice.screenshot`；备份 smoke 改为仅在 `<details>` 未展开时点击，并严格匹配产品使用的 `.luna-backup` 扩展名。
- 选图插件随后修复了多选验证失败时未发布流的所有权清理，并新增 `LedgerImageInputPluginTest`；Docker JDK 21 的 `testDebugUnitTest` 通过，最终 APK 已按新 hash 重建并重跑完整 Android smoke。
- 同步服务新增两客户端附件闭环回归：远端 graph 发布前先确认每个加密对象，第二客户端下载后通过 descriptor/摘要/GCM 校验并在重建本地状态后读回全部附件；该本地协议夹具与 `./hako npm test` 的 199/199 结果均通过。它不替代真实 Android/桌面跨设备图片验收。
- 剩余边界：真实跨设备图片同步、正式 Electron sandbox smoke、Electron 原生文件对话框、真实部署 URL、真实浏览器 200%/辅助技术和用户视觉反馈；宿主 Node20 的 better-sqlite3 SIGSEGV 仍是兼容性记录。打包 Renderer file-input chooser→IPC→解密读回 smoke 已通过。未连接 VPS、未操作用户设备、未提交。

## 12. 2026-09-13 浏览器附件同步回归

- 本地 S3 协议夹具扩展为不可变附件对象路径，并接受生产 S3 adapter 的 `x-amz-meta-sha256` 元数据校验；真实 Chrome 双 context 回归覆盖离线本地写入、对象先于 graph 引用、第二个独立 IDB 客户端下载/GCM 读回和 reload 后读取。
- 开发 Web `chrome`/`chrome-narrow` 全量为 `68 passed、6 skipped`，重建生产 Web 两项目为 `74 passed`（均排除 real server login）；图片同步新增场景两项目 `2 passed`。该证据仍不替代真实 Android/桌面跨设备图片验收。

## 13. 2026-09-13 HTTP 服务端附件完整性与浏览器闭环

- 服务端附件 PUT/repair 现在在数据库 reservation 或对象修复前校验实际 body SHA-256；错误摘要不会留下 reservation，repair 也不会发布不可读对象。HTTP CORS 暴露 `X-Luna-Cipher-SHA256`/`Content-Length`，允许 `HEAD` 和附件自定义摘要请求头。
- `tests/server/attachments.test.ts` 已覆盖错误摘要、repair、CORS 暴露头和 OPTIONS preflight；`./hako npm run server:test` 为 `22/22`，contracts 为 `6/6`，server-sync 为 `9/9`，`./hako npm run server:typecheck`、`./hako npm run api:check`、`./hako npm run typecheck` 均通过；`./hako npm test` 为 `199/199`。
- Node24.15.0 + 宿主 Chrome + loopback Vite 4174 的 `server-account.spec.ts` 桌面/窄屏 `2 passed`，现在额外证明真实 HTTP 客户端的加密图片上传、跨源摘要头读取、第二独立浏览器下载以及刷新后解密读回。真实部署 URL、物理 Android/桌面跨设备图片同步仍未验收。

## 14. 2026-09-13 版本门槛、代际回收与完整备份容量

- 服务端 schema 已升至 v3，新增 `attachment_orphans` 精确对象回收表。过期 reservation 先 fencing token，再按 generation/physical key 延迟回收；孤儿 tombstone 在首次删除后保留，以捕获迟到或取消上传重新落盘的旧对象。`server:admin cleanup` 已使用同一 reconcile 路径。
- reservation publish、repair 的最终提交会在 writer 等待后重新授权；同一 actor/scope/key 的并发幂等请求在对象发布前串行化，避免双对象和唯一键竞态；同 key 不同 body 返回 409。v2 ledger 写入后再发 v1 会返回 409。
- Android SAF 完整备份适配层已校验 native 写入回执、宿主导入回执、最终总字节数和非法 Base64；失败路径会取消宿主 job 并释放 native handle，定向测试已覆盖。
- Web `tools.tsx` 完整备份路径也会在 OPFS sink 关闭前校验 EOF/总字节数、逐块核对宿主追加回执，并在失败时取消 `File.stream()` reader；开发 Web 68 passed/6 skipped、生产 Web 74 passed，web build 和 package 已重跑通过。
- 最新门禁：`./hako npm test` `203/203`、`./hako npm run server:test` `26/26`、contracts `6/6`、server-sync `9/9`；root/server typecheck、server/web build、`api:check` 和 `git diff --check` 均通过。
- 完整备份合成测量已覆盖导出和逐 1MiB 块导入：64MiB 写出并读回 `67,140,128` bytes、32 个附件，峰值 RSS `155,324,416` bytes、相对基线增量 `64,843,776` bytes；512MiB 近上限写出并读回 `537,118,805` bytes、256 个附件、513 个导出 chunk，峰值 RSS `160,153,600` bytes、相对基线增量 `70,049,792` bytes，最大 chunk 均为 `1MiB`，均低于 128MiB 门槛，两次临时输出均已清理且 `memoryBounded=true`、`bounded=true`。Native backup 写入同时改为处理 partial write。
- 仍未做真实部署、真实 Android/桌面跨设备同步、标准 Electron sandbox/native chooser、浏览器 200%/辅助技术/用户视觉验收；未连接 VPS、未操作用户设备、未提交。
