# 技术设计：SQLite 本地账本与内置 S3 加密同步

状态：方案已获批准并完成代码实现；自动化验证已通过，仍待真实主机名/HTTPS 和第二台
设备的人工验收。当前采用服务端控制面，默认同步策略为应用活跃期间的 `automatic`，
并提供按账本切换的 `manual`。

## 1. 设计决策

采用“本地 SQLite + 统一身份/同步 API + 内置 S3-compatible 对象存储”的单实例模式：

```text
设备 A：SQLite ─┐
设备 B：SQLite ─┼─ HTTPS/API 条件写 ─ API/身份 ─ 内置 S3 ─ data/
设备 C：SQLite ─┘       （端侧密文）     │          （密文对象）
                                  server.sqlite
```

- Electron 每台设备使用自己的原生 `better-sqlite3` 文件；Web/Android 每个设备/浏览器
  使用自己的 SQLite-WASM/OPFS database（隔离 Web 使用普通 OPFS，非隔离 Android
  WebView 使用 `opfs-sahpool`）。三者复用同一逻辑领域模型、migration 和
  `LocalLedgerStore` contract；物理表布局由宿主 SQLite 适配器负责。
- Compose 运行 Web 静态站点、认证/同步 API、单实例服务端元数据 SQLite、内置
  S3-compatible 存储和一次性初始化服务；不提供服务端明文财务 CRUD。
- 内置 S3 只保存客户端加密后的 ledger/config 对象。整个 SQLite 文件、S3 root
  secret、设备本地路径和账本明文不得上传。服务端元数据 SQLite 只保存身份、设备、
  账本授权、会话和远端版本，不保存财务明文。
- S3 access key/secret 只由 API 持有；设备通过统一身份获得某个账本的同步授权，再用
  账本密码在端侧解密。`workspaceId`/`ledgerId` 是第二层身份校验；密码相同不代表
  账本身份相同。
- 同步协议沿用现有 `LedgerSyncSession`、图合并、墓碑和冲突边界；将现有
  `LedgerObjectStore` 放到服务端 S3 adapter 后面，由 API 暴露受认证的条件读写，
  不另造“最后写入者获胜”的 SQLite 文件同步协议。
- 本地账本支持 `manual`/`automatic` 同步策略，默认是应用活跃期间的 `automatic`；
  两者都先提交本地 SQLite，再决定何时访问 API。身份会话过期或网络断开不得阻止已
  建立本地账本继续读写。

## 2. Compose 和持久化边界

生产 `compose.yaml` 的服务职责：

| 服务 | 职责 | 持久化 |
| --- | --- | --- |
| `web` | 提供构建后的 Web 客户端和健康检查 | 镜像层；运行时只读 |
| `api` | 统一身份、会话、设备/账本授权、同步版本和密文条件读写 | `./data/server/server.sqlite` |
| `s3` | 提供 S3 API；不默认暴露管理 console | `./data/minio` |
| `instance-init` | 在 S3 启动前幂等创建/校验实例身份、root 凭据和版本清单 | `./data/instance` |
| `bucket-init` | 在 S3 健康后幂等创建 API 专用同步用户、bucket/prefix 和连接配置 | `./data/instance` |

`instance-init` 成功后才能启动 `s3`；`bucket-init` 必须在 `s3` 健康后完成
bucket/user/policy 初始化，`web` 只在 `bucket-init` 成功后报告整体就绪。初始化要有
原子临时文件、模式 `0700/0600`、版本清单和明确的
部分初始化错误：

- 全新 `data/`：`instance-init` 创建目录和随机安装身份、root secret；`bucket-init`
  再生成仅限本实例同步前缀的 API credential 并创建目标 bucket；API 同时初始化
  `server.sqlite` 的 schema 和首个管理员引导状态。
- 已有完整 `data/`：复用安装身份、凭据和对象，不重新生成，不清空，不重置 bucket。
- 只存在一半文件、manifest 版本不支持、权限过宽/不可写或对象存储健康检查失败：
  启动失败并保留现场，不当成空白新安装。

生产镜像固定版本/摘要；已有 `compose.minio.yaml` 只用于 loopback、tmpfs 的测试
fixture，不能把它当生产持久化定义。MinIO root 凭据通过运行时受保护的文件机制或
项目自己的启动 wrapper 注入，不能写入 Compose 普通环境变量、镜像层、命令行、日志
或前端资源。

`data/` 的语义固定为服务端实例的共享恢复源，包含身份/授权元数据和内置 S3 状态，
建议结构为：

```text
data/
  instance/
    manifest.json
    install-id
    root-credential-files
    s3-credential-files
  server/
    server.sqlite
  minio/
    <S3-compatible object-store state>
```

API 专用的 S3 credential 是服务端运行时资料，不能被 Web 静态资源公开，也不能下发到
设备。服务端配置包含 endpoint、region、bucket、prefix、path-style 标记和受限
access key/secret；账本密码只在客户端解锁密文时使用。浏览器和 Android 保存的是
服务端会话/刷新资料，且必须遵循 session-only 或平台安全存储契约。

跨设备访问的 API endpoint 必须在设备网络中可达。默认 loopback 只适合单机验证；家庭
局域网或公网部署需要用户提供可达主机名/IP、防火墙端口和受信任 HTTPS。反向代理可
作为 API endpoint，但必须保留认证、条件写和错误状态；S3 endpoint 不需要直接暴露
给设备。Compose 不负责自动发现外部路由或签发受信任证书。

## 3. 统一本地 SQLite 模型

### 3.1 统一的不是“同一个文件”，而是逻辑模型和 store contract

每台设备仍拥有自己的数据库；统一的是领域模型、迁移规则、事务/CAS 边界和
`LocalLedgerStore` 接口。不同宿主可以选择适合自身 SQLite 引擎的物理布局，不能
把“同一逻辑模型”误解为跨平台共享同一个文件或逐字相同的表：

```text
renderer/domain
      ↓ LunaLedgerApi / LocalLedgerStore
      ├─ Electron：better-sqlite3 → 用户数据目录中的 ledger.sqlite
      └─ Web/Android：sqlite3.wasm Worker + OPFS → origin 私有 ledger.sqlite
```

Web/Android 不再为新账本使用 JSON snapshot/IndexedDB 主存储。当前处于开发阶段，
不提供旧 IndexedDB 数据迁移：干净启动直接建立新的 SQLite-WASM catalog/database，
旧测试数据不属于交付数据。遇到旧 IndexedDB 状态时按无账本处理，不读取、不合并，
也不能把它误报为已恢复的账本。

### 3.2 SQLite-WASM/OPFS 运行边界

- SQLite-WASM 在独立 Worker 中运行；renderer 只通过异步 store/API 消息读写，不能
  直接持有 WASM 数据库句柄。
- 每个 local ledger 是一个独立数据库名；catalog 是另一个固定数据库。catalog
  保存 `ledgerId`、名称、最近打开时间、存储类型和安全同步状态，不保存 secret。
- OPFS 是浏览器 origin 私有存储，不是用户可见目录；仍会受配额、站点数据清理、
  隐私模式和安全上下文影响。应用必须提供 SQLite/加密账本导出，不能把 OPFS 路径
  当作用户可复制的文件夹。
- 一个 ledger 在一个 Worker 中保持单写者；Web 多标签依靠普通 OPFS VFS 的锁定语义，
  Android WebView 的 SAH-pool 则按 profile 使用独立 Worker/VFS。WAL、VFS、COOP/COEP
  和实际 Android WebView 行为必须以真实构建验证，不能仅凭桌面 Chromium 通过。
- OPFS/WASM 不可用时返回明确的 `local-storage-unsupported`，不再偷偷降级到
  IndexedDB；用户可使用受支持客户端导入/恢复。

### 3.3 为什么不把 SQLite 文件直接同步到 S3

统一 SQLite 只解决本地数据模型，不解决跨设备并发。设备 A/B 各自打开 SQLite，
S3 仍交换加密的 revision graph；如果上传整个 `.sqlite`，就会失去修订父关系、
墓碑、幂等 ID 和财务冲突语义，只能做危险的整文件覆盖。S3 同步层因此继续使用
`ledger-v1.enc.json`，本地 SQLite 只是 graph/projection 的持久化实现。

## 4. 远端对象和身份

保留现有对象格式，不上传数据库快照。服务端按实例、用户和账本授权生成稳定的对象
前缀，并绑定稳定 `workspaceId`/`ledgerId`。设备通过认证 API 访问，不能直接访问 S3。
最少包含：

```text
<prefix>/ledger-v1.enc.json
<prefix>/config/v1/settings.enc.json
```

账本密文仍使用 `luna-ledger-envelope`；配置密文仍使用独立的
`luna-config-envelope`。两种密文不能混用，也不能把 access key、secret、passphrase、
本地路径、ETag 或设备撤销状态写进明文 ledger document。

服务端先校验会话、设备和账本授权，再代为执行 S3 条件读写；客户端首次连接的身份规则：

1. 未登录或设备未授权：只返回认证/授权错误，不打开空账本替代。
2. 本地为空、远端存在：先验证密文和 workspace，再采用远端图建立本地数据库。
3. 本地存在、远端为空：API 以 `If-None-Match: *` 创建远端对象。
4. 两端都存在且 workspace 相同：按修订图合并。
5. workspace/ledger 不同、密码错误、密文损坏或 schema 不支持：拒绝本次同步，
   不覆盖本地有效状态，也不把错误当成“远端不存在”。

每个用户/设备只获得被授权账本的 API 能力；服务端支持设备撤销和会话失效。账本密码
仍然不上传，不能因为统一登录而变成服务端可解密的凭据。

## 5. 一次同步的时序

本地提交和远端同步分成两个边界：本地写成功即对当前设备可见，远端失败只显示
`pending`/`failed`，不回滚本地财务记录。

```text
本地 mutation
    │ 事务写入 SQLite：稳定 revisionId、deviceId、parents、墓碑
    ▼
认证 API：读取 ledger object + remote version/ETag
    │ API 校验 user/device/ledger 授权，服务端只转发密文和版本
    ▼
端侧解密、校验 envelope/workspace/图大小/父节点
    ▼
在最新本地图上做 union merge（事务提交）
    │ 本地/远端有变化
    ▼
加密完整合并图 ── API 条件提交（服务端执行 If-Match/等价 CAS）
    │
    ├─ 成功：重新读本地；未出现新编辑才标记 synced
    └─ 401/403/409/412/并发删除：按错误类型处理；可重试时重新拉取 → 解密 → 合并 → 有界重试
```

两个设备同时从远端版本 `E0` 写入时，只有一个能写成 `E1`；另一个收到 API 的条件
冲突后拉取 `E1`，将自己的 revision 和远端 revision 按父关系做集合合并，再提交带有
等价条件的请求。由于 revision ID/operation ID 在本地提交时生成并持久化，成功响应
丢失后的重试只会重新发送同一修订；远端 union 不会重复入账。API 不能根据收到时间
静默覆盖或解决财务冲突。

`manual` 模式不会在本地 mutation 后调用 API。用户点击“同步”才执行上述完整流程；
服务器返回的只是其他设备已经上传的远端密文，不会访问任何其他设备的本地 SQLite。
若远端已有其他设备的变更，先合并到本地，安全变更自动进入本地投影，冲突进入 inbox。
`automatic` 模式默认在应用活跃期间的本地 mutation、启动/回前台和网络恢复时调度同一
流程；用户可按账本切换为 `manual`。应用关闭后的后台唤醒即使失败也只保持 `pending`，
不能回滚本地事务，也不是自动同步成功的必要条件。

非重叠新增自动合并。同一交易的金额、类型、日期、分类、拆分、预算或删除形成多个
有效 head 时，投影将其放入冲突 inbox，从总额中排除，并要求用户选择；选择动作引用
完整 expected head 集合，生成新的 resolution revision。墓碑是图中的正式修订，旧设备
重新上传祖先不能复活记录。

同步循环最多四轮、单轮总超时 60 秒；超过上限返回 pending，不报告 synced。下载流、
密文、明文图和远端错误都受现有 8/12 MiB 及图数量限制。禁用、清除或改配时取消
请求，迟到的响应不能再次写入本地。

## 6. 本地账本 catalog 和启动选择

### 6.1 用户模型

用户同时看到统一账号状态和本地账本列表；账号用于远端授权，本地 catalog 用于选择
要打开的 SQLite：

```text
启动
  ├─ 无本地账本 → 创建/导入账本
  └─ 有本地账本 → 最近使用项置顶 → 选择一个 → 打开对应本地存储
                                      ↓
                              再按该账本执行认证 API 同步
```

界面同时显示当前统一账号和设备状态，但账号登录不会替代本地账本选择。服务端账号
决定“能否同步”，本地 catalog 决定“打开哪个 SQLite”。

每个 catalog 条目只保存本地路由元数据：

```text
ledgerId       稳定 UUID
displayName    用户可见名称
  storageKind    sqlite-wasm | sqlite-native
location       仅 native 内部使用的目录标识，不返回 renderer
createdAt
lastOpenedAt
lastKnownSync  非敏感状态码/时间
```

catalog 不保存账本密码、S3 secret、root secret、明文 ledger、SQLite statement 或
完整本地路径给 renderer；最近使用历史最多保留一个有限数量，超出后按最久未使用
淘汰。历史是设备本地 UI 元数据，不能上传 S3，也不能成为跨设备身份。

### 6.2 各平台存储映射

- Web/Android：catalog 和每个账本都使用 SQLite-WASM/OPFS Worker；catalog 是固定的
  SQLite database，每个条目映射到独立的 ledger database。当前开发数据不迁移，旧
  `BrowserStateStore`、`luna.web.state.v1` 和 IndexedDB profile 按废弃代码处理；
  新版本从空 catalog 开始。
- Electron：catalog 使用应用数据目录中的私有 catalog 文件；每个条目映射到
  `ledgers/<ledgerId>/luna.sqlite`、settings 和安全存储资料。现有默认本地数据库和
  已创建的 profile 目录先登记为条目，不删除、不把多个 graph 静默合并。原生目录/
  文件选择只作为 Electron 的可选能力，选中后必须校验目录、SQLite schema、WAL/
  journal sidecar、权限和 workspace 身份。
- 各条目拥有独立的本地 settings、deviceId、ledger sync session、config sync session
  和状态缓存；切换条目时不能复用上一个条目的内存账本密钥、会话作用域或远端版本。

### 6.3 启动、切换和损坏处理

1. Host 先打开 catalog，不打开任何未选择的账本数据库，也不触发任何认证 API 请求。
2. 没有条目时进入创建/导入；有条目时显示列表，默认聚焦 `lastOpenedAt` 最新项，
   用户可以选择其他条目或新建条目。
3. 选择后验证本地存储可读、schema 可迁移、graph 可解码；成功打开后才更新时间和
   active pointer。文件丢失、权限失效、版本过新或迁移失败时保留 catalog 条目和
   原始数据，显示可恢复错误，不偷偷新建空账本。
4. 切换流程递增 generation，取消并等待旧账本的读写/同步，关闭旧 store，打开新
   store，再发布新的 `LocalLedgerScope`；旧请求即使迟到也不能写入新账本。
5. 忘记账本默认只从 catalog 隐藏，不直接删除数据库；真正删除必须是单独、明确的
   native/平台操作，并先要求用户导出或确认已同步。

### 6.4 Renderer contract

保留 `LunaLedgerApi` 作为 renderer 唯一入口，并增加本地账本和认证同步能力；renderer
不能直接访问 S3 或服务端数据库：

```typescript
listLocalLedgers(): Promise<LocalLedgerSummary[]>;
selectLocalLedger(id: string): Promise<LocalLedgerStatus>;
createLocalLedger(): Promise<LocalLedgerStatus>;
forgetLocalLedger(id: string): Promise<LocalLedgerStatus>;
getAuthStatus(): Promise<AuthStatus>;
login(input: LoginInput): Promise<AuthStatus>;
logout(): Promise<void>;
syncCurrentLedger(): Promise<SyncStatus>;
```

`LocalLedgerSummary` 只含 id、名称、最近打开时间、存储类型的安全显示值和同步状态；
`selectLocalLedger` 返回的新 scope 用于使 renderer 查询失效。账号登录/设备管理 UI
与本地账本选择分开；同步入口显示 `local-only`、`pending`、`synced`、`needs-attention`
和 `failed`，不显示 S3 secret、root secret 或服务端 SQLite 路径。

### 6.5 SQLite-WASM/OPFS 稳定性策略

SQLite-WASM/OPFS 是 Web/Android 的本地工作库，但它仍是 origin 私有存储而不是用户
可见文件：

- 所有 graph/projection/metadata 更新在 SQLite transaction 内提交；数据库升级复用
  原生 SQLite schema/migration 规则，并在 Worker 中串行化写入。
- 启动和写入前检查 OPFS、Worker、WASM 和配额能力；在支持的安全上下文请求
  `navigator.storage.persist()`，但不把返回结果解释为绝对持久化。
- 处理 Worker 崩溃、SQLite error、OPFS 异常和 quota exceeded；保留有效本地状态，
  显示导出/恢复入口，不自动降级成 IndexedDB。
- Web 多标签使用普通 OPFS VFS 的锁；Android WebView 使用 `opfs-sahpool` 的单 Worker
  profile 边界。实际 VFS、WAL、COOP/COEP 和 Android WebView 版本兼容性必须由真实
  构建验证。
- API 代管的 S3 密文同步和用户显式 SQLite/加密账本导出是恢复路径；浏览器 origin
  数据被清理后，用户可从内置 S3 新建本地条目并恢复 workspace。

## 7. Host/API 迁移边界

- `LunaLedgerApi` 继续是 renderer 唯一入口；renderer 不接触 SQLite connection、
  WASM/OPFS 句柄、S3 SDK、secret 或本地路径。
- `WebLedgerApi` 由本地账本 host 为当前选中的 SQLite-WASM/OPFS 条目提供；同步时调用
  认证 API，不直接调用 S3。catalog 选择发生在 host 层，renderer 只拿到安全 DTO。
- Electron local-ledger host 直接打开当前 SQLite profile；认证 API client 只通过安全
  IPC/网络边界运行。切换账本时旧 host 必须先 drain/close，不能复用旧 ledger scope。
- Android 沿用浏览器安全边界和认证 API transport；不把桌面文件路径、S3 credential
  或 root credential 带入 WebView。
- `LunaServerApi`、HTTP account SDK 和 Fastify ledger API 保留并重构为身份/同步控制面；
  PostgreSQL migration/CLI 改为单实例 SQLite 元数据 schema。旧服务端数据不自动混入新
  workspace；迁移文档要求先用旧版本导出/同步到一个本地账本，再在新模式导入或明确
  标记为弃用，不能静默丢弃。
- 便携设置同步仍是独立密文对象和服务；ledger/config 两套 envelope、账本密码和
  字段边界不改变。API 只根据账号/设备/账本授权代为读写对象。

## 8. 备份和恢复

用户备份服务端实例时执行一致性窗口：停止 API 和会写入对象的服务，使用 SQLite
一致性备份方式保护 `server.sqlite`，再复制整个 `data/`（保留权限/符号链接/文件名），
计算 manifest/hash，再启动。不能在 API 或 MinIO 正在写入时直接复制数据库/对象存储
目录。

恢复永远先使用新目录/新 Compose project：

1. 校验目录权限、manifest/schema、安装身份、credential 文件和对象存储自检。
2. 启动临时实例，列出并读取指定对象，验证 ETag/密文 envelope，并用账本密码在一台
   测试设备解密、合并和读取冲突。
3. 验证通过后再切换正式 endpoint；旧目录保留，不能原地覆盖后才发现备份不完整。

恢复的 `data/` 包含服务端身份元数据和已经上传到内置 S3 的共享密文，不包含某台设备
尚未同步的本地 SQLite 写入。设备本地数据库要用应用导出/平台备份另行保护；恢复后的
新设备可登录服务端并从 S3 重建本地数据。普通升级不得使用 `docker compose down -v`。

## 9. 主要失败行为

| 条件 | 行为 |
| --- | --- |
| 初始化文件缺失/半初始化 | 阻止就绪，保留证据，不生成空实例 |
| API 401/403 | 报 authentication/permission，不创建空账本；手动模式仍可继续本地使用 |
| API 404 且对象确实不存在 | 仅允许服务端带 `If-None-Match: *` 的首次创建 |
| API 412/409 | 拉取最新密文、合并、有限重试；不按最后写入者覆盖 |
| 错误密码/篡改/未来 envelope | 本地状态不变，显示可恢复错误 |
| workspace 不匹配 | 拒绝合并，不覆盖本地或远端 |
| 上传响应丢失 | 下次同步由 API 返回版本并依据稳定 revision ID 识别已存在内容 |
| 本地磁盘/SQLite 提交失败 | 整个本地图/投影事务回滚，保留草稿 |
| 备份目录正在写入 | 备份命令失败或要求停止服务，不产生“成功”标记 |

## 10. 验证重点

自动化必须覆盖真实生产 S3 adapter 和认证 API，而不是只测内存 fake：Compose 清空目录
启动、重复启动、权限/半初始化、MinIO/API 重启、账号/设备授权、会话失效、双设备
stale version、响应丢失、错误密码、workspace mismatch、并发编辑/删除/冲突/墓碑、
完整 data 备份恢复、Web/Android/Electron SQLite-WASM/OPFS 与原生 SQLite 的本地持久化、
手动/自动同步策略、启动账本选择/历史、账本切换隔离和 secret 扫描。人工仍需验证
跨设备 HTTPS、证书信任、真实浏览器/Android 网络访问、离线长期记账和恢复后的新设备
登录/接入。
