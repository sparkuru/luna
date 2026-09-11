# 阶段 0 技术设计：边界与技术验证

## 当前演进设计（2026-09-05）

当前交付覆盖跨平台 Compose Web、离线启动、账本同步和 Android APK。
以 `research/cross-platform-audit.md` 的整改设计及 PRD 顶部验收为准；
下文 preview-only、损坏数据清空和移动端/同步延期条目仅保留为历史记录。
保存失败不能改变已发布内存状态；原始坏数据必须保留；跨标签写入需要
事务或原点级互斥。Service Worker 仅缓存版本化应用资产，不缓存业务或同步请求。

真实 Playwright 已证明 localStorage + Web Locks 仍可跨页面丢失写入，
当前 Web 改用 IndexedDB readwrite 事务，保留旧 JSON 作为一次性迁移源。
同笔交易编辑/删除增加事务内 expectedRevision 检查。
账本同步现采用 `.trellis/spec/backend/ledger-sync-guidelines.md` 的
因果修订集合；财务分叉显式入冲突收件箱，未决记录不参与汇总并必须提示，
决策修订引用全部当前分支。不借助时间戳静默裁决。

设置同步通过平台中立服务复用既有scrypt/AES-GCM v1对象，Web/Android
采用scryptAsync+WebCrypto，Electron保留原生密码实现；不迁移或破坏既有
配置密文。两个同步服务均在持久化边界处理取消和最新状态。预算草稿使用
有效来源head集合作为提交条件。Android导出经显式SAF目标并在流关闭后
才报告保存。当前实现与全端门禁已通过，具体证据及后续物理设备/真实TLS/
安全审计边界见最终validation报告，而非下文历史阶段的延期条目。

## 状态与目标

本设计服务于 `.trellis/tasks/08-30-income-expense-mvp` 的阶段 0和第一个可用本地桌面检查点。产品范围已获用户批准，用户已授权启动任务并实现、提交首个可用版本。

阶段 0 的目标是用最小可运行纵向切片验证四条基础链路，并优先交付其中可实际使用的本地记录器：

1. 平台无关的收入/支出领域模型和派生统计能够独立于 Electron、SQLite 与浏览器存储。
2. Electron 主进程可以通过原生 SQLite 保存数据，并在离线重启后恢复。
3. 端侧加密、主密码改包裹和恢复失败边界可以被隔离验证，而不会把未经安全评审的方案当成生产承诺。
4. 两个客户端的变更、重复操作、删除墓碑和关键字段冲突可以被确定性地重放和观察；至少一个 S3 兼容对象存储适配器可以通过最小契约测试。

浏览器 SQLite WASM/OPFS 是独立的技术 Spike；本轮另外提供一个复用桌面 renderer 的 Web 预览入口，用于界面设计和 Playwright 验收。Web 预览使用 origin-local storage，不是第二个同步客户端，也不改变 Electron 首发的 SQLite 与配置同步边界。

第一个可用检查点先覆盖 Electron 本地工作区、收入/支出记录、编辑/删除、月度摘要与预算、本地重启恢复。远端同步、生产级加密和 OPFS 仍是后续验证项；界面必须对这些延期边界保持可见，避免把本地原型误认为已具备同步或安全承诺。

最新扩展在该检查点之上交付人民币、`zh-CN`/`en` i18n、金额隐私配置和“仅配置”的真实跨设备同步。远端对象存储中的配置是密文；此能力不改变交易与预算仍仅保存在本机 SQLite 的事实。

## 证据与已确认约束

- 根目录 `prd.md` 是产品行为权威：单工作区单币种、整数金额、只有收入/支出两种交易类型、本地先写、逻辑删除、显式财务冲突和端侧密文同步。
- 当前仓库没有源码、包清单、测试框架、CI 或既有模块边界；本设计可以建立第一版结构，但不能假定已有约定。
- `.trellis/spec/backend/` 与 `.trellis/spec/frontend/` 当前仍是占位模板；跨层数据流、代码复用和 Trellis Plus 规则是当前有效的工程约束。
- `research/phase0-toolchain-and-validation.md` 的研究结论已经由主会话用 Electron、Electron Forge、Node、SQLite 官方资料复核；该报告中的版本均是 2026-08-30 观察值，实现开始前必须重新查询并锁定。
- Electron 官方安全建议要求隔离 renderer、使用窄化的 `contextBridge` API、校验 IPC sender、保持 `contextIsolation` 与 sandbox，并避免向远端内容开放 Node 能力。
- 原生 Node 模块必须针对 Electron ABI 重编译；数据库文件必须位于解析后的当前活动本机目录，不能写入源码、resources 或 ASAR。Linux 默认活动目录为 `~/.config/luna`。
- SQLite 官方文档确认 OPFS 只能在 Worker 中使用，普通 OPFS VFS 依赖 COOP/COEP，文件锁是排他的，多标签/多 Worker 可能出现 `SQLITE_BUSY` 或 I/O 错误。

## 技术选择

以下是阶段 0 的推荐基线，不是对未来所有客户端和版本的永久承诺：

| 领域 | 阶段 0 选择 | 取舍与退出条件 |
|---|---|---|
| 桌面壳 | Electron，实施时从当前受支持稳定线中重新选择并精确锁定 patch 版本 | Electron 版本自带 Node/Chromium，必须以实际运行时和打包产物验证；不使用 alpha/nightly 作为基础。 |
| 桌面编排 | Electron Forge `vite-typescript` 稳定线；研究观察值为 Forge `7.11.2` | Forge Vite 插件仍标注为 experimental，因此锁定 Forge 与其支持的 Vite major，并以 native-module 与 packaged smoke 为门槛；若失败，保留同一边界退回 Forge `webpack-typescript`。 |
| 桌面构建 | 使用 Forge 模板支持的 Vite 版本；不把独立浏览器 Spike 的 Vite 版本反向带入桌面 | 研究观察到 Forge 7.11.2 的 Vite 依赖处于 Vite 5 时代；不强行使用 Vite 8。 |
| 语言与包管理 | TypeScript `strict: true`，npm lockfile，Node `>=22.12.0` 的可复现开发环境 | 当前主机是 Node `20.19.2`，不作为实现门槛；实现前通过项目本地 `hako`/容器边界提供 Node 22+，并重新核对工具链要求。 |
| 本地 SQLite | `better-sqlite3` 作为桌面适配器，研究观察值为 `13.0.3`，精确锁版本 | 同步 API、prepared statements 和事务适合短事务本地写入，但需 Electron ABI rebuild、ASAR/native unpack 和打包产物测试。 `node:sqlite` 只做同版本 Electron runtime probe，不作为默认基础；不选已标记 deprecated/unmaintained 的 `node-sqlite3`。 |
| 浏览器 Web 预览 | 独立 Vite 入口注入同一 `LunaLedgerApi`，使用 `localStorage` 的浏览器本地适配器 | 用于先设计和验收 Web UI；不读取 Node/Electron/SQLite，不保存或同步凭据，不把浏览器本地数据宣称为桌面账本或 PWA。 |
| 浏览器 Spike | 独立 Vite 浏览器入口 + module Worker + `@sqlite.org/sqlite-wasm`，先测标准 `opfs` VFS | 研究观察值为 `3.53.0-build1`；必须使用 HTTP(S)/localhost、COOP/COEP 和真实浏览器。只记录结果，不承诺 PWA 或跨浏览器生产持久化。 |
| 测试 | 纯领域与适配器契约优先使用 Node 内置 `node:test`；Web UI 使用 Playwright 真实浏览器；Electron 保留 packaged smoke | Playwright 先覆盖语义状态、隐私边界和窄视口；不能取代真实打包产物、真实设备、辅助技术和主进程原生对话框检查。 |

这些选择是推荐/推断，不掩盖下列尚未定案的事项：最终加密套件和参数、稳定的同步对象布局、完整 S3 兼容矩阵、PWA、移动端、SQLCipher、公开备份格式和密钥轮换。

## 分层架构

```text
共享纯 TypeScript：领域模型 / 用例 / 端口 / DTO 解码器 / 测试向量
                 │
       ┌─────────┼─────────┬─────────┐
       │         │         │         │
Electron     Web UI    浏览器      共享领域/端口
renderer      │       Spike UI       │
       │   localStorage  Worker +    │
窄化 preload  adapter   SQLite WASM  │
       │                   /OPFS     │
       │
Electron main process
       │
应用服务 → LocalStore / Crypto / ObjectStore 端口
       │
better-sqlite3 / 加密实验适配器 / S3 适配器
```

共享层不得导入 `electron`、Node built-ins、`better-sqlite3` 或 SQLite WASM。Renderer 不直接接触数据库 schema、文件路径、对象存储凭据或原始 IPC。Electron 与 Web 入口都只依赖异步 `LunaLedgerApi`；桌面适配器可以在主进程内部同步调用 SQLite，Web 适配器只使用浏览器本地存储，避免把任一宿主实现泄漏到另一端。

阶段 0 保留单一任务，不创建并行子任务：领域、SQLite、浏览器和同步 Spike 共同依赖同一组共享 DTO、金额/date 约束和端口契约，拆成并行任务会增加跨层漂移。若实现后某个 Spike 具备独立验收和无共享写集，再另行立项。

## 核心边界与契约

### 设置与 i18n

- 共享层定义 `AppSettingsFileV1`、`PortableSettings`、`DeviceLocalSettings`、默认值、严格 decoder 和逐字段 revision。Renderer 不直接读写文件。
- `PortableSettings` 首批仅包含 `locale`、`hideSensitiveAmountsByDefault` 以及后续明确标记 portable 的展示偏好；该字段的产品语义是“默认隐藏顶部汇总金额”，不是隐藏交易详情。`syncAllPortableSettings` 自身是本机的同步策略，不允许远端悄悄开启。
- `DeviceLocalSettings` 包含 S3 endpoint/region/bucket/prefix、是否 path-style、设备 ID 和最近同步状态；access key、secret、session token 与同步口令属于 local secrets，不能进入 portable payload。
- `settings.json` 放在当前活动本机目录，写入前 runtime decode，写入使用同目录临时文件、flush/close 后 rename。Linux 默认活动目录为 `~/.config/luna`；损坏文件保留证据并回退安全默认值，不覆盖原文件。
- i18n catalog 以稳定消息键为契约，首批 `zh-CN` 与 `en` 必须键集合一致。插值仅产生文本，不接受 HTML。`Intl.NumberFormat(locale, { style: 'currency', currency })` 负责 `CNY`/`¥` 等显示，领域和 SQLite 继续保存 ISO 代码与 minor-unit 字符串。
- 顶部收入、支出、结余和剩余预算四个汇总值在格式化后的最后一步统一遮罩；预算编辑值、预算使用/上限、分类统计和交易列表金额始终使用正常 locale 格式。隐藏汇总时 `.summary-grid` 切换到 compact/collapsed 状态；隐藏值的 `aria-label`、title、live region 和其它 DOM 属性不得带真实金额。用户点击“本次显示”只改变 renderer 内存状态，重启后回到配置默认值。

### 配置同步

```text
Renderer 设置表单
  → typed preload API
  → main IPC decode
  → SettingsStore 原子保存
  → ConfigSyncService 选择 portable payload
  → versioned encryption envelope
  → S3-compatible ObjectStore conditional PUT/GET
```

- bootstrap 边界：新设备必须一次性输入 endpoint、region、bucket/prefix、对象存储凭据和同步口令；这些信息无法从尚未连接的远端自动获得。连接成功后 portable settings 整体恢复，不再逐项设置。
- 远端 key 使用稳定、可版本化的前缀（例如 `<prefix>/config/v1/settings.enc.json`）；payload 不包含 endpoint、bucket、凭据或口令。
- envelope 至少包含协议版本、KDF salt/参数、nonce、ciphertext 和认证 tag。同步口令只在 main 进程使用，不经 renderer 回传、不写日志、不上传；错误口令和篡改统一为可分类解密失败，不返回部分设置。
- S3 adapter 支持 GET、条件 PUT（ETag/版本 token）、not-found、authentication、precondition-conflict、transient/network 分类和有限重试。未知供应商只有通过契约测试后才进入支持声明。
- 开启 `syncAllPortableSettings` 时上传/应用全部 portable 字段；关闭时不执行远端配置 GET/PUT，远端不能覆盖本机 portable 设置且已有远端对象不删除。开关本身本机优先，避免其他设备远程改变隐私策略。
- 每个 portable 字段保存 `{ value, updatedAt }`。合并先比较 `updatedAt`，完全相同再比较规范化字段值，结果确定且幂等；本机 device ID 不进入 portable payload。条件写冲突或并发删除导致的 404 时重新下载、合并、再尝试有限次数，超过上限向用户报告冲突。
- 任何 schemaVersion、算法版本或 payload decode 失败都禁止覆盖已验证本地设置，并保留可理解、可恢复的错误状态。

### 领域模型

- `Workspace` 固定记录币种和精度。
- `Transaction` 只有 `income` 与 `expense`，拥有本地日期、金额、分类拆分以及可选非财务字段。
- 领域内部以无浮点误差的 minor-unit 表示金额；推荐使用 `bigint` 或等价的无损整数表示，跨 JSON/IPC 边界使用明确的十进制字符串编码。SQLite 适配器必须验证 64 位整数往返不会被 JavaScript safe-integer 限制截断。
- 所有拆分必须与交易同号，且精确加总为交易金额。
- 统计只接受最新有效版本；草稿、冲突候选和墓碑不能被重复计入。
- 本地日期采用明确的 `YYYY-MM-DD` 语义；UTC 时间只用于审计/同步。

所有不变量由共享领域模块提供单一实现。Renderer 表单、SQLite adapter、同步 adapter 不各自复制金额、日期、拆分和冲突判断。

### 端口

| 端口 | 责任 | 明确不负责 |
|---|---|---|
| `LocalStore` | 本地事务、迁移、有效版本、修订、墓碑、待同步操作和冲突状态的持久化 | 不决定业务统计，不把 SQLite 文件当成公开格式 |
| `CryptoProvider` | 加密/解密、完整性验证、root-key envelope 的边界 | 不上传主密码，不在日志中输出明文，不在阶段 0宣称生产密码方案已审计 |
| `ObjectStore` | 上传、下载、条件写入、对象 metadata、重试所需错误分类 | 不读取账务明文，不把供应商 SDK 泄漏到领域层 |
| `SyncEngine` | 操作 ID 去重、下载应用、并发分类、墓碑传播和状态更新 | 不用时间戳静默裁决财务关键字段 |
| `Clock` / `IdGenerator` | 可测试的时间和唯一 ID | 不让随机/当前时间散落在领域逻辑中 |

所有外部输入（IPC、解密后载荷、对象存储返回、备份/导出）在单一边界完成 runtime decode 和规范化；下游只消费已验证的类型。

### Electron IPC

- Main process 创建数据库并负责迁移；数据库路径来自启动前解析的当前活动本机目录，文件名固定为 `luna.sqlite`。
- Preload 通过 `contextBridge` 暴露逐项 typed 方法，例如读取摘要、保存交易、读取同步状态；不得暴露完整 `ipcRenderer` 或通用 `send`。
- Renderer 使用 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true` 的安全基线；所有 handler 校验 sender 和参数。
- 应用只加载本地打包内容；设置严格 CSP，禁止把远端内容当作应用代码执行。
- 设置 API 使用 `getSettings`、`updateSettings`、`configureConfigSync`、`testConfigSync`、`syncConfigNow` 等用途明确的方法；不得暴露文件路径、通用对象存储请求或原始凭据读取 API。

### Web-first renderer host

- `src/renderer/renderer.ts` 只消费注入到 `window.lunaLedger` 的异步 API，不判断 Electron、Node 或浏览器环境；`src/preload.ts` 和 `src/web/main.ts` 分别提供桌面与 Web host。
- Web host 的 `localStorage` 状态仅包括经过共享领域校验的工作区、交易、预算和非秘密设置；坏数据回退到空账本并显示可恢复的 setup 状态。浏览器刷新恢复同一 origin 的本地预览数据，清理 site data 即清除该预览。
- Web `RendererSettings` 明确报告配置同步不可用，连接表单/动作不得让用户以为浏览器能访问桌面 safeStorage 或远端密文配置。Electron 的 S3 配置同步实现和安全边界保持不变。
- Vite Web dev server 固定为 localhost，Playwright 用干净 browser context 验证 setup、录入、隐私、reload、可访问语义和 375px 窄视口；诊断 trace/screenshot 只在失败时保留，不把像素快照当作唯一门槛。

### 本轮验证服务

- `compose.minio.yaml` 固定 MinIO 镜像 tag 与 digest，使用 loopback 端口、临时数据卷和测试凭据；wrapper 负责 bounded health wait、随机测试 bucket、生产 S3 adapter conformance 及 teardown。
- MinIO smoke 只证明固定版本与当前 adapter 的兼容性，不扩大为所有 S3/OSS 供应商；脚本输出只报告 provider/version/counts/status，不输出凭据、口令或业务明文。

## 关键数据流

### 本地保存

```text
Renderer 输入
  → preload typed API
  → main IPC decode + sender 校验
  → 共享领域校验/归一化
  → SQLite 单事务写入交易、修订和待同步操作
  → 从最新有效版本重算摘要
  → 返回可展示 DTO；同步在事务之后异步尝试
```

对象存储不可用只改变同步状态，不回滚已经成功的本地事务。删除写入正文为空的墓碑，统计立即排除有效内容；旧操作不能通过重放复活记录。

### 远端变更与冲突

```text
对象存储下载
  → 校验/解密/DTO decode
  → operation-id 去重
  → 共享变更/冲突决策
  → SQLite 事务应用有效版本、候选版本或墓碑
  → 重算派生统计与同步状态
```

金额、类型、日期、分类拆分和删除状态的并发变更必须进入显式冲突；非重叠非财务字段可以合并，同一标量字段仍冲突。阶段 0只需确定性地展示最小冲突结果，不冻结完整的远端对象布局或用户级冲突 UX。

### 浏览器 Spike

浏览器入口只复用共享领域和测试向量。SQLite WASM 在 Worker 中初始化，先用标准 `opfs` VFS；开发服务器提供安全上下文和 COOP/COEP。Spike 要记录 Worker 初始化、迁移、写读、关闭/重开、页面 reload、两个 Worker/页面争用、`SQLITE_BUSY`/I/O 错误、配额/清除数据/隐私模式和不支持时的可理解失败。

不得用 Electron renderer 或 Node 中的 WASM 运行结果推断普通浏览器 OPFS 行为；不得把 OPFS 的 origin-private 数据当作可见文件或可携带备份。

## 加密验证边界

阶段 0只验证接口和失败行为：

- 主密码只在本地使用；root key 以 envelope 形式传递给存储端口。
- 改密码只重新包裹稳定 root key，不要求重加密完整工作区。
- 错误密码、损坏密文、错误版本和完整性失败必须产生可分类失败，不得返回部分明文。
- 加密实验放在隔离目录/适配器，不被正式领域或同步代码隐式依赖。
- 具体 AEAD、KDF 参数、随机数、密钥派生、设备撤销和轮换方案必须作为后续安全设计；任何阶段 0报告都要明确“原型验证”而非“已审计”。

## 本机目录与应用标识

- 应用产品名、npm 包名和打包可执行文件统一为 `luna` / `Luna`；用户可见文案不再使用旧的 `Luna Ledger` 品牌名。
- 默认数据根目录固定为 `~/.config/luna`（使用操作系统 home 目录解析，不把 `~` 当作字面路径）。当前选择目录直接包含 `settings.json`、`luna.sqlite` 及本机同步秘密文件；不再追加 `luna-ledger/` 子目录。
- 首次启动在主进程创建窗口前解析目录：若默认目录在进程启动前已存在（即使暂时为空）则直接进入；Electron 在启动期间新建的空 profile 目录不算用户已选择的目录。若启动前不存在，使用原生对话框提供“创建默认目录”“选择其他本地目录”“取消”。取消不创建数据库、设置或秘密文件。
- 用户选择的自定义目录通过默认目录中的版本化本机位置指针记住；指针只保存规范化绝对路径和 schema version，不进入 renderer DTO、portable payload 或日志。下一次启动先解析有效指针，再打开目标目录；坏指针必须显示可恢复错误并允许重新选择。
- 目录创建使用私有权限并在打开 SQLite/SettingsStore 前完成。选择器只允许本地目录，不接受文件或远端 URL；切换/清理验收应在应用完全退出后通过选择新目录或移动数据库 sidecar 完成，不删除 settings/secret 文件作为默认恢复策略。
- `--smoke` 继续由测试环境显式注入隔离目录并跳过交互选择；生产启动路径不得依赖 smoke 环境变量。

## 验证策略

1. **共享领域测试**：金额正负号、拆分精确求和、日期归属、月度预算、最新版本、墓碑、修订和冲突决策；不导入 Electron/SQLite。
2. **SQLite 集成测试**：首迁移、重复迁移、事务原子性、prepared statement、重启 reopen、临时目录隔离、整数往返和预期锁模式。
3. **Electron bridge/packaged smoke**：renderer → preload → IPC → main → SQLite，离线写入、关闭、重新打开和读取；验证安全 webPreferences、native addon 存在和实际打包产物。
4. **浏览器 OPFS Spike 测试**：真实 HTTP server、Worker、COOP/COEP、reload 持久化、锁争用、`SQLITE_BUSY`、存储不可用和导入/导出边界；保留浏览器、OS、WASM build、VFS、header 和时间记录。
5. **同步契约测试**：两个客户端交错新增/编辑/删除、重复上传、关键字段冲突、墓碑阻止复活、至少一个真实 S3 兼容端点或受控本地兼容服务；不把 fake store 的通过结果冒充供应商兼容性证明。
6. **设置与 i18n 测试**：配置默认值/严格 decode/损坏恢复/原子写、catalog 键一致、CNY 中英格式、金额遮罩与无障碍无泄漏、重启后偏好恢复。
7. **配置同步测试**：两个独立 userData 目录完成加密上传、下载恢复、关闭同步策略、错误口令、篡改、条件写冲突、幂等重试和 secret 扫描；至少保留一个受控 S3-compatible endpoint 的版本与命令证据。

## 回滚与降级

- Forge Vite 插件或其版本组合无法稳定打包时，退回 Forge 的 TypeScript Webpack 模板；共享层、IPC 和端口不变。
- `better-sqlite3` 在目标 Electron/OS/架构无可用构建时，先记录 ABI/编译证据，再运行精确 Electron runtime 的 `node:sqlite` probe 或改选适配器；不得把未重编译的 native binary 打进产物。
- OPFS 在目标矩阵中无法满足持久化/锁/恢复验收时，保留 Spike 报告并把 PWA 继续标记为延期；Electron 原生 SQLite 不受影响。
- 加密实验无法形成可审计的边界与测试向量时，保留失败证据并阻止生产加密承诺；不通过弱化 KDF 或隐藏错误来“通过”验收。
- 迁移只针对阶段 0临时数据库和可删除测试目录；不修改用户已有数据库，不做递归删除或不可逆清理。

## 设计来源

- 任务内研究：`research/phase0-toolchain-and-validation.md`
- 产品基线：根目录 `prd.md`
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron native Node modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [Electron releases](https://releases.electronjs.org/)
- [Electron Forge Vite plugin](https://www.electronforge.io/config/plugins/vite)
- [Node `node:sqlite`](https://nodejs.org/api/sqlite.html)
- [SQLite WASM persistent storage and OPFS](https://www.sqlite.org/wasm/doc/trunk/persistence.md)
