# SQLite 单实例自托管与 S3 加密同步

## Goal

将 Luna 的自托管交付简化为用户可理解的单一入口：用户只需要运行一个
`docker compose`，首次启动自动准备运行目录，后续启动不覆盖已有状态；持久化
数据边界明确且可备份。应用启动时从本机账本目录选择一个本地账本，多设备不共享同一个
SQLite 文件，而是各自使用隔离的本地存储，通过统一身份登录服务端，由服务端代管 S3
密文对象完成同步。

本任务优先解决部署和数据归属的复杂度，不改变本地优先、端侧加密、显式财务冲突、
墓碑和可恢复失败的产品原则。

## Confirmed facts at planning (2026-09-10)

以下“当前”指规划时基线；现行实现和 2026-09-24 确认的 Android 兼容边界以
`validation.md`、`design.md` 及本 PRD 的要求和验收条件为准。

- Electron 本地已经使用 `better-sqlite3`；Web/Android 使用事务化 IndexedDB。
- 上述是当前代码现状，不是最终目标；当前任务尚未完成全项目 SQLite 改造。
- 当前自托管 Compose 运行 Web、Fastify API 和 PostgreSQL；PostgreSQL 的密码文件
  必须在 Compose 解析 bind secret 前存在，因此首次启动会因缺少 secret 文件失败。
- 当前 HTTP 后端使用 PostgreSQL 账号、会话、CAS/ETag、幂等、迁移锁和恢复契约；
  当前实现与测试不能把 PostgreSQL 直接替换成 SQLite 而不重新验证并发语义。
- 当前客户端已有 S3-compatible 加密账本同步边界：本地提交、远端密文、条件写、
  修订/墓碑、合并和冲突处理应优先复用，不能同步 SQLite 文件本身；B 方案只改变
  设备到远端对象之间的认证/transport，不改变客户端加密和图合并边界。
- 服务端 S3 配置只负责定位对象；统一账号负责用户/设备授权，账本密码负责端侧解锁，
  稳定的 workspace/ledger 身份负责防止错账本合并。三者职责不能混用。
- 用户已确认采用 B 方案：服务端提供统一身份、会话、设备/账本授权和同步控制；客户端
  保留本地 SQLite，账本继续端侧加密，服务端不保存账本明文。
- 服务端只在安装级配置一次 S3。设备不填写 S3 endpoint、bucket、access key 或
  secret，只需要服务端地址、统一账号和账本解锁密码。
- 用户要求支持“手动同步模式”：不主动同步时，本地账本可以继续离线读写；主动同步
  前，当前设备的新增/修改不会出现在其他设备，也不进入服务端共享备份。
- 用户已确认默认开启“应用活跃时自动同步”，并允许用户按本地账本切换为手动同步；
  应用完全关闭后的 Web 后台同步不作为可靠性承诺。
- 用户已进一步确认采用内置 S3：Compose 同时提供 Web host 和一个持久化的
  S3-compatible 对象存储；对象存储只保存客户端加密后的账本/配置对象，不保存
  SQLite 文件或服务端明文账本。
- Compose 中的内置 S3 是多设备共享的加密同步仓库和恢复来源；服务端元数据 SQLite
  保存身份、设备、账本授权和远端版本；支持 SQLite 的宿主通过
  `LocalLedgerStore` 提供本地账本。
- 当前代码已经有本地 profile 的雏形：Web 侧有 catalog 和按 profile 隔离的
  IndexedDB，Electron 侧有 `active-profile.json`、profile 目录和 SQLite；现有
  `ServerHost`/账号语义需要拆分为“统一身份会话”和“本地账本选择”两层，不能让账号
  切换覆盖本地账本选择。
- Web/Android 的统一 SQLite 运行时使用 `sqlite3.wasm` + OPFS Worker；隔离 Web 使用
  普通 OPFS，非隔离 Android WebView 使用 `opfs-sahpool`。OPFS 仍受
  origin、配额、隐私模式、用户清理和浏览器存储回收约束，不能替代远端密文副本、
  本地导出或平台备份。
- 用户已确认采用跨平台的本地账本 profile：启动时选择一个本地账本并保留最近使用
  历史；统一目标是 SQLite schema/`LocalLedgerStore`，Electron 以原生 SQLite 文件/
  目录实现，Web/Android 以 SQLite-WASM/OPFS 实现。不会要求所有平台直接选择任意
  `.sqlite` 文件。
- 2026-09-24 用户确认旧版 Android WebView 缺少 OPFS 时保留安全内置 origin 下的
  IndexedDB 兼容存储。普通 Web 不启用此回退；Android 具备 OPFS 时仍使用
  SQLite-WASM/OPFS。兼容存储复用领域与同步契约，但不能称为 SQLite 数据库。

## Requirements

### Deployment and initialization

- 最终用户只需一个项目内的 `compose.yaml` 和一次
  `docker compose up --build -d`；不要求用户预先创建 PostgreSQL secret 文件、
  运行 Node 脚本或了解内部服务组成。
- Compose 固定包含 Web、统一身份/同步 API、服务端元数据 SQLite 和本地
  S3-compatible 存储；首次启动自动创建其持久化目录、实例身份、内部 root secret、
  服务端会话密钥、受限同步凭据和目标 bucket/prefix。只在目标缺失且目录完整性通过
  时初始化，重启不得重新生成、覆盖或清空数据。
- S3 配置只由服务端管理员配置一次；设备接入只需要服务端地址、统一身份登录和账本
  解锁密码。root secret、S3 access key/secret 只留在服务端数据目录，不下发到设备。
- 服务端 endpoint 必须是设备可达的稳定地址；跨设备部署需要用户提供可达的主机名/IP
  和受信任的 HTTPS（或明确限定在受信任的本地网络）。Compose 不能凭空解决路由、
  防火墙或证书信任问题。
- 初始化、迁移和服务就绪必须有明确的失败状态；部分初始化、权限错误、未来版本
  数据不得伪装成空白新安装。
- secret 不进入镜像层、Compose 环境变量、日志、前端缓存或 S3 明文对象。

### Data directory and backup

- 任务必须明确 `data/` 的实际所有者和内容：服务端元数据 SQLite、内置 S3 的对象
  数据、配置、实例身份、root secret、会话密钥、受限同步凭据和初始化状态全部落在
  一个用户可备份的 `data/` 目录。
- `data/` 是共享同步仓库的备份，不等于每台设备的本地数据库备份；设备本地 SQLite
  仍需通过应用导出或本地平台备份恢复。新设备可以通过恢复后的内置 S3
  重新建立本地数据库。
- 手动同步模式下，设备尚未主动上传的本地变更不在服务端 `data/` 中；若要求这些变更
  也进入单文件夹备份，必须先主动同步成功，或另外备份该设备的本地账本。
- 备份必须是数据库一致性快照：不能要求用户在服务运行期间直接复制可能仍在写入的
  SQLite/WAL 文件；内置 S3 目录也必须在一致性快照/服务停止窗口内复制。恢复必须在
  新的临时目录先校验，再替换或启用。
- 备份命令必须覆盖内置 S3 的实际目录并验证对象、实例身份和凭据元数据；不能把 Web
  容器层、Compose volume 名称或某台设备本地数据库描述成共享账本的唯一备份。
- 不得使用 `docker compose down -v` 作为普通升级或备份步骤。

### Local ledger selection and history

- 启动时打开本机账本 catalog：显示最近使用的账本、账本名称、最近打开时间、本地
  存储类型和同步状态；默认聚焦最近使用项，但用户可以切换、创建、导入或移除本地
  账本记录。
- 每个本地账本拥有独立的稳定 `ledgerId` 和本地数据边界。Electron 使用独立 SQLite
  文件/目录，普通 Web 和具备 OPFS 的 Android 使用独立 SQLite-WASM/OPFS database；
  缺少 OPFS 的旧版 Android WebView 使用独立的 IndexedDB 兼容存储。
  账本选择历史是设备本地 UI 元数据，不同步到 S3，也不包含密码、access key、secret
  或明文账本。
- 账本目录/文件损坏、权限失效、schema 过新或迁移失败时必须显示可恢复错误并保留
  原始数据；不得自动创建一个空账本掩盖原账本不可用。
- 跨平台 MVP 不要求 Web/Android 直接选择任意用户 `.sqlite` 文件；Web/Android
  通过应用导入/导出 OPFS 中的 SQLite，Electron 可提供原生目录/文件选择，但必须
  经过 SQLite schema、WAL sidecar、权限和 workspace 校验。
- SQLite 的本地提交使用短事务、原子 graph/projection 更新、统一版本迁移、OPFS/
  Worker 能力检测和显式导出提醒；`navigator.storage.persist()` 只能作为增强措施，
  不能让应用声称永不丢失。

### Unified SQLite storage model

- 新账本主存储在 Electron、普通 Web 和具备 OPFS 的 Android 上使用 SQLite：
  Electron 使用原生 `better-sqlite3`，Web/Android 使用 `sqlite3.wasm` + OPFS Worker
  （Web 普通 OPFS、Android WebView `opfs-sahpool`）。缺少 OPFS 的旧版 Android
  WebView 使用显式的 native-only IndexedDB 兼容存储，复用领域和同步契约；不实现
  当前开发数据从 IndexedDB 到 SQLite 的迁移。
- 本地 catalog 也使用 SQLite，记录 `ledgerId`、名称、最近打开时间、存储位置和
  非敏感同步状态；SQLite 宿主的每个账本拥有独立 database。普通 Web 的 catalog 与
  账本都在 SQLite-WASM/OPFS 中，不使用 IndexedDB；旧版 Android 兼容存储按账本隔离。
- OPFS 是 origin 私有空间，不是用户可见目录；无法像 Electron 文件夹一样直接复制。
  Web/Android 必须提供应用级账本导出。普通 Web 的 OPFS 不可用时明确报不支持；
  只有原生 Android 缺少 OPFS 时才选择已声明的 IndexedDB 兼容存储，不能在运行失败后
  静默切换并把已有账本伪装成空账本。
- 统一 SQLite 只统一本地数据模型，不改变同步格式：S3 仍上传加密修订图，不能上传
  或覆盖整个 SQLite 文件。

### Multi-device encrypted synchronization

- 每台设备保留独立的本地数据库；不得让多台设备直接打开同一个 SQLite 文件，也不得
  把 SQLite 文件当作远端同步格式。
- 服务端 API 是设备唯一的远端同步入口：客户端通过统一身份获得当前用户/设备/账本
  的授权，服务端代为访问 S3；客户端仍负责账本密文的解密、revision graph 合并和
  本地 SQLite 投影。
- 每个本地账本支持 `manual` 和 `automatic` 同步策略，默认是 `automatic`。`manual`
  下除登录、显式同步、连接测试等用户动作外不主动访问远端；本地读写不依赖网络或
  有效的在线会话。`automatic` 下在应用活跃期间的本地提交、启动/回前台和网络恢复时
  尽力同步；Web 关闭后的周期任务和移动端后台任务只能作为平台允许时的增强，不能作为
  数据提交成功的必要条件。
- 无论同步策略如何，本地提交先成功才算用户操作成功。未主动同步时，本地新增/修改
  只在当前设备可见，状态为 `local-only`/`pending`；主动同步时先拉取远端、合并，再
  条件写入。远端有差异但无冲突时可自动合并；财务冲突或用户设置为确认模式时保持
  `needs-attention`，由用户点击后应用解决结果。
- 服务端不能访问任何设备的本地 SQLite，也不存在“Web 请求服务端再去 Android 拉取”
  的路径。只有 Android 自己完成一次同步并上传后，Android 的变更才会进入服务端；
  其他设备随后才能从服务端拉取。服务端是授权的密文中继/共享仓库，不是设备代理。
- 本地账本解锁不依赖每次在线身份校验；服务端身份用于远端账本列表、同步和设备授权。
  新设备首次恢复远端账本仍需要网络和一次主动同步，恢复完成后即可离线继续使用。
- 同一账本的设备使用稳定 `workspaceId`/`ledgerId`、设备 ID、修订/操作 ID 和
  父修订关系；同一账号和密码但账本身份不匹配时必须停止并提示，不得自动合并。
- 同步对象按服务端用户/账本授权和实例 bucket/prefix 隔离；账本密码解密对象，
  `workspaceId`/`ledgerId` 做身份校验。设备首次加入不能靠“最后写入者”覆盖已有账本，
  而要登录、拉取并确认远端身份。
- 本地写入先提交；同步失败、断网、错误密码、损坏密文、超限和响应丢失都不能撤销
  已提交本地记录或伪装成远端成功。
- 远端写入使用 `If-None-Match`/`If-Match` 或等价的条件写；并发失败后重新下载、
  解密、合并并有界重试。重试必须复用原操作身份，不能重复入账。
- 一次同步的逻辑顺序是：读取本地未同步修订 → 拉取远端密文并校验身份/解密 → 将
  本地和远端修订图按父修订合并 → 对新的完整文档做条件写 → 成功后标记本地远端头；
  条件写失败则回到拉取步骤。网络响应丢失时必须用同一修订 ID/操作 ID 重试，不能
  追加第二笔等价交易。
- 非重叠新增可以自动合并；金额、类型、日期、分类、拆分、预算和删除等财务冲突
  必须显式呈现并由用户选择；墓碑必须阻止旧设备复活已删除记录。
- S3 版本控制可作为恢复辅助，但不能替代 API 授权、实时冲突检测、合并和客户端解密
  校验。

### Compatibility and validation

- 保留现有 `LunaLedgerApi`、本地优先和端侧加密边界；UI 不直接访问数据库文件，
  S3 连接只通过认证同步 API 处理。设备不得获得服务端 root/S3 凭据。
- 保留并收敛服务端账号、会话、设备撤销和账本授权能力；服务端只做身份/同步控制面，
  不提供服务端明文财务 CRUD。现有 PostgreSQL 账号/会话实现改为单实例 SQLite 元数据
  存储，必须重新验证 CAS/幂等、会话和恢复契约。
- 旧服务端数据必须有导出、迁移或明确弃用结论；旧 account identity 不得静默拼接到新
  workspace。S3 初始化服务与身份 API 的职责必须分开。
- 覆盖首次启动、重复启动、权限/部分初始化、数据库迁移、完整备份恢复、双设备
  并发修改、冲突、删除不复活、幂等重试和不泄露秘密的自动化验证。
- 文档必须提供单一 Compose 启动、停止、升级、备份、恢复和故障排查入口；普通用户
  不需要理解 SQLite、PostgreSQL、API 或 secret mount 的内部实现。

## Acceptance Criteria

- [ ] 从干净目录执行单一 Compose 启动，不需要手工生成 secret；Web、认证/同步 API、
  服务端元数据 SQLite、内置 S3 和初始化流程按健康状态启动，第二次启动保持实例
  身份、凭据、对象、账号和配置不变。
- [ ] `data/` 是明确且受权限保护的服务端持久化边界；通过一致性备份恢复到新目录后，
  身份元数据、加密远端对象、实例身份和必要凭据可验证恢复；运行中的复制、半初始化
  目录和错误权限会明确失败。
- [ ] 两台独立设备各自使用隔离的本地账本存储，通过统一账号和账本密码同步新增、编辑
  和删除；设备不需要 S3 配置。断网重连、响应丢失和并发写不会静默覆盖或重复入账。
- [ ] 新设备只需输入服务端地址、登录统一账号和账本密码，即可主动同步并建立本地
  账本；不需要知道 PostgreSQL、MinIO、bucket 初始化或 secret mount 的细节。
- [ ] 默认自动同步模式在应用活跃期间于本地提交、启动/回前台和网络恢复时尽力同步；
  用户可以按账本切换为手动模式。
- [ ] 手动同步模式下，设备断网或用户未点击同步时仍可持续读写本地账本；本地提交
  不因远端不可用失败。主动同步后，安全变更自动合并上传，财务冲突进入明确的待处理
  状态；未同步的本地变更不会被远端覆盖。
- [ ] 启动时可以选择本机已有账本；最近使用历史在重启后保留，选择不同账本不会
  串读/串写数据，服务端会话、账本授权和同步状态按账本隔离。
- [ ] 财务冲突进入可理解的显式选择流程，墓碑阻止旧记录复活；不同 workspace 或
  错误密码不会修改本地数据。
- [ ] Web、Electron 和 Android 共用领域与同步契约并保持本地离线行为及
  `LunaLedgerApi` 边界；Electron、普通 Web 和具备 OPFS 的 Android 使用 SQLite，
  旧版 Android WebView 缺少 OPFS 时使用明确的 IndexedDB 兼容存储。两条 Android
  路径分别验证持久化和隔离；普通 Web 账本运行路径完全不依赖 IndexedDB。
- [ ] 生成的部署/迁移/恢复文档与实际命令一致，自动化测试、敏感信息扫描和必要的
  人工验证证据完整。

## Out of scope

- 多个 API 实例共享同一 SQLite 文件、横向扩容、高并发 SaaS 或跨主机直接挂载 SQLite。
- 服务端解密账本、服务端财务 CRUD、服务端月报或使用最后写入时间静默解决金融冲突。
- 将整个 SQLite 文件直接上传到 S3，或把 S3 版本列表当作冲突合并协议。
- 要求 Web/Android 通过不稳定的文件选择 API 直接打开任意 SQLite 文件；Web/Android
  使用 SQLite-WASM/OPFS 的本地 profile，Electron 文件选择是可选的宿主能力。
- 不需要为当前开发数据建立 IndexedDB 到 SQLite 的迁移或兼容读取路径；本任务采用
  干净初始化，旧测试数据不属于交付数据。
- 保证 Web 在完全关闭时按固定周期运行后台同步；平台只允许尽力而为的后台唤醒，
  可靠的本地离线读写不能依赖它。
- 家庭邀请、角色权限、公开注册、银行接入、附件和新的加密协议。

## Resolved architecture

用户已确认采用 **B 方案**：每台设备保留自己的本地 SQLite，设备通过统一身份登录
服务端；服务端提供身份、设备/账本授权、远端版本/CAS 和同步 transport，并统一访问
S3-compatible 对象存储。账本对象继续由客户端加密，服务端不保存账本明文；这不是多个
设备打开同一个 SQLite 文件，也不是服务端明文财务 CRUD。

本任务采用 **服务端控制面 + 内置 S3**：Compose 提供 Web host、认证/同步 API、单实例
服务端元数据 SQLite、S3-compatible 存储和一次性初始化流程。内置对象存储、服务端
元数据、实例状态和凭据统一绑定到 `data/`。设备只需要服务端地址、账号和账本密码，
不接触 S3 root/access key/secret。

本地账本入口建议改成 **启动账本选择器**：选择的是跨平台的本地 ledger profile，
不是强制所有设备打开同一个物理 `.sqlite` 文件。普通 Web 和具备 OPFS 的 Android
将 profile 映射为 SQLite-WASM/OPFS database，旧版 Android WebView 映射到
IndexedDB 兼容存储，Electron 映射为 SQLite 文件/目录；历史列表只记录在本机。
该选择器复用当前 Web catalog 和 Electron profile 目录的基础，但不让统一账号登录
替代本地账本选择，也不让服务端账本授权静默切换本地 profile。

服务端 S3 凭据采用“安装级服务端保存”模型：初始化时生成只允许访问本实例同步前缀
的 access key/secret，root secret 永不下发；设备撤销、账号会话和账本授权由服务端
完成。服务端 endpoint 必须使用设备可达的稳定地址；HTTPS/反向代理、证书和网络暴露
按部署环境验证，不能由同步协议假设 localhost 在所有设备上可用。

## Resolved local ledger selection

用户已确认“本地账本”采用跨平台 ledger profile 模型：启动时从本地 catalog 选择
账本，最近使用记录保存在本机；普通 Web 和具备 OPFS 的 Android 使用
SQLite-WASM/OPFS，旧版 Android WebView 使用 IndexedDB 兼容存储，Electron 使用
SQLite 文件/目录。选择不同账本必须切换完整的本地
graph、settings、服务端会话作用域和同步状态，不能串读/串写。当前开发数据不做 IndexedDB
迁移，旧浏览器状态按无账本处理。

“直接选择任意 `.sqlite` 文件”不是 Web/Android 的 MVP 要求；Electron 可以作为原生
宿主能力提供目录/文件选择，但需独立做 schema、WAL sidecar、权限和 workspace 校验。

## Sync policy and offline behavior

每个本地账本提供 `manual` 与 `automatic` 两种同步策略；两者都不改变本地优先原则。

- `manual`：除登录、连接测试和用户明确点击“同步”外，不主动访问远端。设备离线或
  用户暂不想同步时，可以继续打开、记账、修改和查询本地 SQLite；本地提交不因网络、
  服务端不可用或会话过期失败。
- `automatic`：默认在应用活跃期间的本地提交、应用启动/回前台和网络恢复时尽力拉取、
  合并和上传；网页关闭后的周期同步和移动端后台任务只能作为平台允许时的增强，不能
  作为本地数据可用或提交成功的前提。
- 未同步的本地变更只在当前设备可见，状态为 `local-only`/`pending`，不在服务端
  `data/` 备份中。用户主动同步时先拉取远端，再合并本地和远端修订；无冲突自动完成，
  财务冲突进入 `needs-attention`，用户确认后才提交 resolution revision。
- “一直”受本地存储空间、浏览器配额、设备数据清理和账本本身损坏风险约束；它表示
  不受网络/远端同步时限限制，不表示本地数据永远不会丢失。若要让服务器的单一 `data/`
  文件夹包含全部变更，手动同步前必须先完成一次成功同步。

## Notes

- 本任务是复杂架构变更；`design.md` 和 `implement.md` 已同步记录统一 SQLite 模型、
  无迁移边界和实际验证结果。代码自动化验证已完成，任务仍保留 `in_progress`，直到
  真实主机名/HTTPS 与第二台设备的人工验收完成。
- 现有工作区包含未提交的 PostgreSQL、HTTP API 和跨端实现；不得用 HEAD 覆盖，迁移
  前必须保留可回滚检查点。
- `design.md`/`implement.md` 已按 B 的边界更新并进入实现后验收阶段；真实跨设备网络、
  证书信任和长期离线行为仍需人工核查。
- 2026-09-24 的当前源码本地复验和剩余验收边界见 [validation.md](validation.md)；
  上述复验不代表真实 HTTPS 或物理 Android 验收。
