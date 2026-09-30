# SQLite 自托管与加密同步：当前源码本地复验

日期：2026-09-24。基线 `a5011b2`，复验时工作树只有本任务的文档修订和由
`api:generate` 产生的 `contracts/openapi.json` 格式差异。所有账号、口令和账本
均为隔离测试夹具；本轮未连接 VPS、公开 HTTPS 入口或物理 Android。

## 已运行

| 检查 | 实际结果 | 证明范围 |
| --- | --- | --- |
| `docker compose config --quiet` | 通过 | 当前单 Compose 定义可解析；没有启动生产栈。 |
| `./hako npm run test:contracts` | 6/6 通过 | SDK 条件头、ETag、响应大小和取消边界。 |
| `./hako npm run test:server-sync` | 9/9 通过 | 隔离 profile、迁移、同步、取消与远端标记。 |
| `./hako npm run server:test` | 26/26 通过 | SQLite 身份控制面、CAS、幂等、授权和附件对象。 |
| `./hako npx tsx --test src/web/profile-host.test.ts src/web/web-api.test.ts` | 43/43 通过 | IndexedDB 兼容适配器的持久化、隔离、回滚与取消；不代替 Android WebView 实机证据。 |
| `./hako npm run api:check` | 初次失败：`OpenAPI differs`；按项目命令 `api:generate` 更新后通过，输出 `LUNA_API_REPRODUCIBLE` | 差异仅为 `contracts/openapi.json` 中 `version` 枚举的缩进；生成 SDK 文件没有变化。 |
| `./hako npm run typecheck`、`./hako npm run web:build` | 均通过 | 严格类型和当前生产 Web 资源可构建。 |
| `./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/server-account.spec.ts --project=chrome` | 1/1 通过 | 生产 Web 资源、两个隔离浏览器上下文、真实本地 SQLite API；对象存储是内存夹具，非真实 MinIO/HTTPS。 |
| `LUNA_RESTORE_API_IMAGE=luna-api:sqlite-sync-20260924 node scripts/smoke-server-restore.mjs` | 5/5 检查组通过 | 当前源码 API + 固定 MinIO 的新装、停止后复制完整 `data/`、恢复、两认证客户端 CAS/图合并、API 重启。 |
| `git diff --check`、`task.py validate sqlite-self-hosted-sync` | 均通过 | 差异空白和任务上下文清单。 |

隔离恢复报告在 `/tmp/luna-server-restore-OoW35b/report.json`。API 镜像 ID 为
`sha256:de68f8fbcdcb9f1e1e043be0e85a1d1b213a900c0139284fbfda39981011193f`，
MinIO 镜像 ID 为
`sha256:69b2ec208575b69597784255eec6fa6a2985ee9e1a47f4411a51f7f5fdd193a9`。
恢复脚本完成后，按 `luna.restore-run` 标签查询的容器和网络均为空。

## 产品边界与剩余验收

用户确认：普通 Web 使用 SQLite-WASM/OPFS；原生 Android 在缺少 OPFS 的旧版
WebView 上保留安全内置 origin 的 IndexedDB 兼容存储。任务 PRD、设计和实施记录已
据此修订；两条 Android 存储路径仍需分别取得安装包运行证据。

以上为本任务较早的本地复验记录。用户随后恢复 VPS 和物理 Android 验收权限；
后续跨设备合成数据证据记录在 `../09-08-fullstack-release-validation/validation.md`。

PRD 验收项继续保持未勾选，因为本轮没有证明完整条件。特别缺少当前源码的真实
HTTPS 同源账号/同步、物理 Android 的兼容存储与断网重启、第二台实际设备接入，
以及生产部署的权限/半初始化负例和完整人工验收。历史任务中的相关结果只能按其
实际版本和环境复用，不能替代这些剩余项。

`.trellis/spec/frontend/android-runtime.md` 和 Web host 规范已经准确记录上述兼容
路径，HTTP API 规范也已要求 `api:check` 校验生成契约；本轮没有新增代码规范。

## 2026-09-24 继续验收：受限 S3 凭据与启动选择

本轮只使用 `/tmp` 下独立合成数据 Compose project；没有改动 VPS、生产目录或实体
Android。`instance-init` 只创建 MinIO root 凭据，`bucket-init` 在 MinIO 可用后创建
`luna-sync` bucket 和仅能操作 `luna/*` 对象的 API key。MinIO 从受保护文件读取 root
配置；API 的 root 文件和对象目录被容器内挂载遮蔽。旧版 API=root 的 `runtime.json`
会原地升级为受限 key；重复启动校验策略并复用原 key。

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| `docker compose config --quiet`、`docker-compose config --quiet` | 通过 | 本机 Compose v2.26.1；没有 Compose v1 运行证据。 |
| 独立 Compose 首启、重启 | root 与 API key 不同；runtime SHA-256 未变；API healthy | 数据目录 `/tmp/luna-cred-smoke.Oz9jDz/data` 已于验收后删除，未连接现有栈。 |
| 容器权限/策略负例 | API 读 `minio.env` 得空文件，列 `/data/minio` 得 EACCES；受限 key 建桶及前缀外 PutObject 均为 403 | 只检查了上述权限，不代表完整渗透测试。 |
| 旧版 root runtime 升级 | 原 root 文件不变，API runtime 更换为受限 key | 用 `HEAD` 旧版 `instance-init.mjs` 在独立目录生成旧格式；测试项目已删除。 |
| `node scripts/smoke-server-restore.mjs` | 8/8 检查组通过 | 最终报告 `/tmp/luna-server-restore-Xf20fh/report.json`；包括停机全量复制、原密文/ETag、CAS、API 重启、旧 root runtime 升级、中断后孤儿 key 撤销、缺桶拒绝空仓库替换。 |
| `node tests/deploy/instance-init.test.mjs` | 5/5 通过 | 首启/复启、完成标记缺 runtime、非空数据缺初始化状态、错误文件权限、现有 SQLite 缺 runtime；负例保留原文件。 |
| `./hako npm run typecheck`、`server:typecheck`、`server:test`、`web:build` | 通过；server:test 26/26 | 当前源码类型、服务端回归和生产 Web 构建。 |
| 生产 Web `server-account.spec.ts` Chrome | 1/1 通过 | 两本地账本正常重载显示选择器，选中另一本地账本后数据隔离；其余 catalog 元数据和创建/导入未覆盖。 |
| 本轮 14 个改动文件的私钥头、常见 access token 格式扫描 | 0 命中 | 格式扫描，不替代人工秘密审查；初始化日志和 smoke 未打印生成凭据。 |

AC1 的受限凭据缺口已修复，AC7 的正常重载选择缺口已修复。AC1 仍需目标部署的
完整重启/权限负例，AC7 仍缺结构化 catalog 元数据、创建/导入入口和选择前不开账本。
PRD 十项验收继续保持未勾选；本任务维持 `in_progress`。09-08 的 HTTPS/实体设备证据
可按其真实范围复用，但那条公网临时路由已回滚，不等于可用的正式 VPS 部署。

## 2026-09-28 当前工作树增量

本轮以独立 x86 和 VPS Compose 项目实跑当前工作树。两实例均从空 `data/` 完成初始化、健康启动、重启和重复 `up -d`；各自 `.luna/runtime.json` 哈希重启前后不变。合成账号、账本交易及加密图片在重启后由新浏览器上下文成功恢复。VPS 的 `https://ssh.majo.im:10010` 使用受信任证书；原版 `scripts/smoke-deployed-sync.ts` 五组公网检查通过。Android 11 缺少 OPFS 的真实 WebView 用独立包通过本地强制停止/重开持久化，并与独立浏览器经真实公网 HTTPS 双向同步交易和图片；Android 实际解密显示 32×32 合成 PNG。详细环境、APK 哈希和证据路径见 [三端发布复验](../09-08-fullstack-release-validation/validation.md#2026-09-28-当前工作树隔离复验)。

因此 AC1 的正常启动/重复启动、AC3/AC4 的新增与新设备恢复正常路径、AC9 的旧 Android 兼容存储真机路径获得新证据。仍缺完整目录恢复到新实例的**本轮**实操、半初始化和权限负例、真实设备上的编辑/删除及并发失败路径、具备 OPFS 的 Android 路径、结构化 catalog 的创建/导入交互、Electron 原生目录选择和人工审核；不能勾选十项完整 AC。此测试 VPS 入口是隔离合成数据临时服务，不是正式生产部署。

## 2026-09-30 当前源码恢复与初始化负例

在当前工作树重新运行 `node scripts/smoke-server-restore.mjs`，8/8 检查组
通过；脱敏摘要报告保存在 [restore-report-20260930.json](research/restore-report-20260930.json)，本次新建的
临时源数据目录停 API 与 MinIO 后复制到独立恢复目录，恢复后核对实例身份、
账号会话、账本 graph、附件密文/元数据、ETag、用量和幂等重放；另验证两
客户端 stale CAS 合并、API 重启、旧 root-backed runtime 升级、孤儿 key
回收和初始化 bucket 丢失时拒绝空仓替换。API 镜像 SHA-256 为
`fe91dc5073c9598dd0433db715027c1a68ce11656e4f9f90249f221fb63eaae0`，
MinIO 镜像 SHA-256 为
`69b2ec208575b69597784255eec6fa6a2985ee9e1a47f4411a51f7f5fdd193a9`。
脚本按唯一标签清理本次创建的容器和网络；此演练仍是本机临时数据，不是
x86/VPS 正式服务或生产数据恢复。

同一工作树的 `./hako node tests/deploy/instance-init.test.mjs` 通过 5/5：
首启/重复初始化、完成标记缺 runtime、非空未初始化目录、错误 secret
文件权限、已有 SQLite 缺 runtime 均按预期拒绝且保留原数据。以上补齐了
当前源码的隔离恢复和初始化器负例记录；仍未证明运行服务期间复制会被工具
显式拒绝、目标部署上的实际故障恢复、实体设备编辑/删除/并发失败、OPFS
Android、本地 ledger catalog 创建/导入，或 Electron 原生目录选择和人工审核。

因此 9/28 段落中“本轮未做恢复/半初始化和权限负例”是当日状态；9/30 已
补齐本机隔离恢复与初始化器负例，但十项组合验收仍有多个未完成项，任务
继续保持 `in_progress`。

## 2026-09-30 当前源码增量：本地账本目录交互

补齐 AC7 此前缺少的自动化产品切片：

- 新增版本化 LocalLedgerCatalog；可迁移旧版字符串 ID 数组，并记录显示名、创建/最近
  打开时间、sqlite-native / sqlite-wasm-opfs / indexeddb-compat 类型、非敏感同步状态
  和服务端绑定。新账本使用独立随机 ID，不把密码或密文写进 catalog。
- Web/OPFS、旧 Android IndexedDB 适配器和 Electron host 的账本列表只读取当前账本数据；
  元数据列出其他条目时不会打开其数据库。Web 使用 OPFS/IndexedDB 数据库存在性探测，
  Electron 检查 profile SQLite 文件。缺失账本显示不可用，切换失败关闭，不初始化空库。
- 账号页与启动选择页都提供“新建本地账本”和“将备份导入新账本”；恢复入口先创建并
  切换至空 profile，再进入加密备份恢复流程。原始 profile 与新 profile 的数据隔离。
- 最近打开、存储类型、同步状态和缺失提示显示在账本列表。原始本地账本与普通本地账本
  使用不同标签，避免恢复副本被误认为原始副本。

| 检查 | 结果 | 证明范围 |
| --- | --- | --- |
| ./hako npm run typecheck | 通过 | profile 创建权限、数据库存在性检测和界面类型。 |
| ./hako npx tsx --test src/shared/local-ledger.test.ts src/web/profile-host.test.ts src/main/profile-host.test.ts | 16/16 通过 | 旧 catalog 迁移、无活动库开启、缺失库不重建、新建 profile 隔离及 Electron SQLite 元数据。 |
| ./hako npm test | 221/221 通过 | 全部共享、宿主、renderer、sync 单元回归。 |
| ./hako npm run web:build | 通过 | 生产 Web 构建；只有既有 "use client" bundle 提示和约 500 kB chunk 提示。 |
| 生产构建 Playwright local-ledger-catalog.spec.ts，Chrome + Chrome narrow | 4/4 通过 | 新建空账本、备份恢复到新账本、两本账本互不覆盖；删除 inactive OPFS 数据库后显示不可用、拒绝切换且不重建。 |
| 生产构建 Playwright local-ledger-catalog.spec.ts + server-account.spec.ts，Chrome | 3/3 通过 | catalog 新建/恢复、账号同步、多设备重载、离线切换和原有账本隔离。 |
| git diff --check、task.py validate sqlite-self-hosted-sync | 通过 | 当前差异和 Trellis 上下文。 |

开发服务器运行“离线切换 profile”用例时，Vite 未提供离线缓存的 Worker 资源，故 Worker
终止；该用例按本任务原有生产验收方式在 production preview/Service Worker 下复验通过。
这不作为产品离线失败记录。

本增量覆盖 Web OPFS 与 fake IndexedDB 的数据库缺失行为，以及 Electron host 的本地 SQLite
元数据/文件检查；本轮未在 Android 设备上实测 OPFS（现有 Android 11 板走 IndexedDB 兼容
分支），未实测 Electron 原生目录选择，也未覆盖目标 VPS 的权限/半初始化故障。09-08
临时 HTTPS 的双设备证据仍只证明其记录的合成数据范围，不能替代长期部署和目标环境验收。
本任务 PRD 的十项整体验收仍不勾选，状态保持 in_progress。

## 2026-09-30 Android 11 实机目录与导入恢复

在 AIO-3568J Android 11 板上安装仅用于本轮的 `majo.im.luna.archivecheck`
调试包；SHA-256：
`7bd15dea693e689d0c4942d355b0c30ad3eca675b64366a46979530deac02e65`。
该设备没有 `navigator.storage.getDirectory`，实际 WebView 使用
`indexeddb-compat`。没有改动设备上原有 Luna 包。

| 检查 | 结果 | 证明范围 |
| --- | --- | --- |
| 新建合成账本及隔离副本 | 通过 | 目录列出“Android compat primary”和“Android compat separate”，两者均标记 IndexedDB、仅本地；恢复副本 ID 为 `local-56babb48-61d4-4533-ba95-ad42389fafd0`，独立副本 ID 为 `local-040390a3-4635-464e-9603-fe019d744ad7`。 |
| Android WebView 中的加密备份恢复表单 | 处理逻辑通过 | 2,857 字节合成加密备份恢复到新 profile；因系统文件选择器没有把文件交给页面，使用 WebView 内存 `File` 执行恢复处理。文件 SHA-256：`1271bb305aac862717b6cfa88dab5afd8cb40286d017953a5e1927618a274be8`。读取活动 profile 元数据及工作区名称确认没有覆盖原始 `legacy-local`。 |
| 实际目录切换 | 通过 | 使用页面“打开副本”按钮切至独立账本，再切回恢复副本；活动 ID 分别与上述 ID 相符，工作区名分别为 separate / primary。 |
| 强制停止后重开 | 通过 | `am force-stop` 后重新启动专用包，活动恢复副本 ID、catalog 五条记录及其 `indexeddb-compat` 类型仍保留；截图见 [android11-catalog-relaunch.png](research/android11-catalog-relaunch.png)。 |
| Android DocumentsUI 选择实际备份文件 | 未通过验证 | 系统文件选择器能打开并显示本轮唯一合成文件，但触摸选择没有回传文件；经 WebView DevTools 注入共享存储路径得到 `NotReadableError`。因此本轮只能证明 WebView 内存 `File` 输入对应的恢复处理，不能证明 Android 文件选择器到恢复流程的端到端连接。 |

专用测试包随后已卸载，仅删除本轮唯一合成下载文件及层级转储，并移除临时
ADB DevTools 转发。此证据补齐 Android 11 的 IndexedDB 兼容目录、账本切换、
合成备份恢复处理和进程重启持久性；没有覆盖 OPFS Android、原生文件选择器
成功、Electron 目录选择、生产 VPS 故障恢复或人工完整验收。因此 AC9 的旧
Android 存储分支新增了实机证据，但本任务十项组合验收仍不完整，状态保持
`in_progress`。

## 2026-09-30 当前候选 Electron 分发增量

当前源码 Linux x64 Electron ZIP 已通过 `npm run make`、`unzip -t`，从归档
解包后默认 sandbox smoke 退出码 0，并读回 UI 写入交易和隐私设置；细节及
SHA256 见[父级移动集成记录](../09-26-mobile-experience-redesign/validation.md#2026-09-30-x86-linux-zip-与最终分发包-smoke)。
这只补足本地 Electron 启动/账本持久化证据；没有演练 Electron 原生目录选择，
也未覆盖本任务未完成的 OPFS Android、真实设备编辑/删除并发、ledger catalog
创建/导入入口和目标部署故障恢复。十项 AC 不作整体勾选，任务仍为 `in_progress`。

## 2026-09-30 当前源码 VPS HTTPS 同步复验

当前源码的独立 VPS HTTPS Compose/Chrome 端到端检查及清理记录见[09-08 发布验收](../09-08-fullstack-release-validation/validation.md#2026-09-30-当前源码-vps-https-复验)。
新空实例的六项双浏览器检查通过，使用 SQLite API、内置 MinIO、可信 TLS 和
Chrome OPFS；只证明正常 HTTPS 登录/上传/恢复、手动离线边界、两端收敛和冷
启动读取。此次本地账本 catalog 的 Android 11 兼容分支、目录切换和进程重启
证据见本文件前述“Android 11 实机目录与导入恢复”。远端部署失败恢复、半初
始化权限负例、Android 原生文件选择器端到端、OPFS Android、Electron 原生选
择器和整体验收仍未完成，PRD 十项 AC 保持未勾选。
