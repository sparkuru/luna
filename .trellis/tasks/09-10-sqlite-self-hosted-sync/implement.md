# 实施记录：SQLite 本地账本与内置 S3 加密同步

本记录对应已批准并完成的服务端控制面实现：保留本地 SQLite、revision graph 和冲突
协议，把 S3 访问收敛到认证 API。工作区中原有的 PostgreSQL、HTTP API、跨端和 UI 改动
均被保留，没有使用 reset/checkout 覆盖。

同步策略需要同时支持 `manual` 和 `automatic`；默认是应用活跃期间的 `automatic`，
用户可以按账本切换为 `manual`。应用关闭后的后台唤醒只作为尽力而为的增强。

## Phase 0：基线和可回滚检查点

1. 记录当前 `git status`、现有测试结果和 Compose/MinIO fixture 的镜像摘要。
2. 标记旧 PostgreSQL 存储实现为待替换基线，保留现有 HTTP/account/profile 行为作为
   对照，确认哪些测试迁移到 SQLite 身份控制面，不将旧数据库证据误当成新模式通过。
3. 读取 backend/frontend 规格后再按层修改；每个阶段保留可运行的最小测试。

## Phase 1：单一 Compose、身份 API 和内置 S3 引导

涉及：`compose.yaml`、`Dockerfile`、新增的 storage-init 构建/脚本文件、
`.dockerignore`、`.gitignore`、`deploy/.env.example`、`deploy/README.md`、
`deploy/nginx.conf`。

- 保留并收敛 `api` 为统一身份/会话、设备/账本授权和密文同步 API；移除 PostgreSQL
  `db`、`migrate`、named volume 和 file secret mount，改用 API 挂载的单实例
  `data/server/server.sqlite`。
- 以固定版本/摘要加入 S3-compatible 镜像；生产数据使用 `./data` 下的 bind mount，
  不复用现有 tmpfs 测试 fixture。
- 实现幂等 `instance-init`/`bucket-init` 两阶段引导：先生成/校验安装 manifest 和
  root secret，再在 S3 健康后创建受限同步 credential、bucket/prefix；处理文件模式、
  原子写、半初始化、未来版本和重启复用，避免“生成 root 凭据”和“访问 S3”循环依赖。
- 使 `docker compose up --build -d` 成为唯一正常入口；`docker compose ps` 能区分
  初始化失败、存储未就绪和 Web 未就绪。root secret 不进镜像、env、日志和前端。
- 设计并实现服务端 S3 credential 的运行时注入边界；Web 不静态公开 root/API
  credential，设备只获得登录会话和账本授权。
- 更新启动、停止、升级、端口/HTTPS、权限和故障排查文档，明确跨设备 endpoint
  不能使用只对本机有效的 localhost。

## Phase 2：本地账本 catalog、启动选择和历史

涉及：新增/更新 `src/shared/local-ledger.ts`、`src/shared/api.ts`、
`src/web/profile-host.ts`、新增 `src/web/sqlite-wasm-store.ts`/Worker、`src/main/profile-host.ts`、
`src/main/app-paths.ts`、`src/main/store.ts`、`src/preload.ts`、renderer 启动/选择界面
及相关 tests。

- 将现有 `legacy-local`/server profile catalog 改为通用 local-ledger catalog，生成稳定
  ledger ID；catalog 只存名称、类型、时间和安全状态，不存 secret。
- 启动先展示最近账本选择；没有账本时进入创建/导入。选择后再打开对应 SQLite-WASM/
  OPFS database 或 SQLite 文件/目录；未选择账本不得触发认证 API 或打开其他账本。
- 普通 Web 和具备 OPFS 的 Android 采用每账本独立 SQLite-WASM/OPFS database，
  Electron 采用每账本独立 SQLite 目录；缺少 OPFS 的旧版 Android WebView 使用
  native-only IndexedDB 兼容存储。不实现当前开发数据的 IndexedDB 迁移；
  `BrowserStateStore` 仅保留为旧版 Android 兼容适配器。Electron 文件/目录选择
  仅为可选原生能力。
- 切换账本时取消并 drain 旧请求、关闭旧 store、递增 scope/generation、清理旧会话，
  验证新账本后再发布；迟到的旧响应不能污染新账本。忘记条目默认不删除物理数据。
- 增加 `LunaLedgerApi` 的本地账本列表/选择/创建/忘记能力，移除 renderer 对
  旧 profile/account 绑定实现的直接依赖；保留统一身份状态，但更新启动、空状态、
  损坏/权限错误和最近历史 UI。

## Phase 3：共享同步身份和本地状态

涉及：`src/shared/settings.ts`、`src/shared/ledger-session.ts`、
`src/shared/ledger-sync.ts`、`src/shared/ports.ts`、`src/main/store.ts`、新增的
SQLite-WASM Worker/store、相关 migration/test。

- 保持 ledger/config 两种 envelope 和现有大小/KDF/AAD 约束。
- 为本地 profile 持久化稳定 device/ledger/workspace 所需元数据；新版本从空 SQLite
  catalog/ledger database 开始，不读取当前开发用 IndexedDB；已有 graph 不在每次同步
  重新 seed。
- 确保 revision ID、operation ID、parent heads 和墓碑在 SQLite 本地事务中与投影一起
  提交，响应丢失重试不会生成第二个交易。
- 明确空本地、空远端、workspace mismatch、错误密码和损坏对象的 adopt/reject 规则。
- 检查 `rememberSecrets`、WebView 和 Electron safeStorage 行为，保证 root secret
  和 S3 credential 永不进入 renderer，浏览器登录会话不被不安全持久化；本地账本解锁
  不依赖每次在线认证。

## Phase 4：认证 API 同步 transport 和对象配置

涉及：`src/sync/s3-ledger-store.ts`、`src/sync/ledger-service.ts`、现有/新增
`src/server/**`、`src/api-client/**`、认证/同步 contract 和对应 unit/integration tests。

- 保留服务端内部 `GET + quoted ETag + If-None-Match/If-Match` S3 适配器，固定 SDK
  retries=0；对设备暴露认证后的 ledger pull/conditional commit API，保持流式大小
  限制和 401/403/404/409/412 分类。
- 用最新本地图做 merge，条件写失败后重新 GET/decrypt/merge/encrypt，最多四轮；写后
  再读本地，发现并发本地编辑时继续 pending/retry，不能过早报告 synced。
- 处理首次双设备创建、并发编辑/删除、墓碑、显式冲突、响应丢失和 MinIO 重启。
- 服务端按用户/账本授权生成规范化 prefix，ledger/config 对象路径隔离；设备不会获得
  S3 credential，不会上传 SQLite 文件或秘密。
- 若内置 S3 对现有 AWS SDK 的 path-style、HTTPS、CORS、ETag 语义存在差异，增加
  生产 adapter 的 MinIO conformance 测试，不以 test-only fake 替代。

## Phase 5：服务端身份控制面与本地 profile 解耦

涉及：`src/web/profile-host.ts`、`src/main/profile-host.ts`、`src/sync/server-host.ts`、
`src/shared/server-api.ts`、`src/api-client/**`、`src/server/**`、`src/main.ts`、
`src/main/ipc.ts`、`src/preload.ts`、`src/shared/api.ts` 及 renderer account/settings
入口。

- Web host 直接使用本地 SQLite-WASM/OPFS profile；Electron host 直接使用本地 SQLite
  profile；两者通过 `LunaLedgerApi` 调用认证同步 API。
- 保留 Fastify account/session/设备撤销/HTTP ledger API 的控制面语义，移除其对
  PostgreSQL 的依赖并改用 `server.sqlite`；服务端不新增明文财务 CRUD。
- 拆开 `ServerHost` 的统一身份会话与本地 profile 选择：登录影响远端授权，不得自动
  切换或覆盖当前本地账本；同步失败/会话过期不阻止本地离线记账。
- 提供旧服务端数据的导出/弃用说明，验证不会把旧 account identity 与新 workspace
  自动拼接，也不会在迁移失败时删除旧数据。

## Phase 6：Web、Electron、Android 接入和可见状态

涉及：`src/web/web-api.ts`、`src/web/main.ts`、`src/web/profile-host.ts`、
`src/renderer/features/account.tsx`、`src/renderer/features/settings.tsx`、
`src/renderer/features/tools.tsx`、`src/renderer/features/setup.tsx`、i18n 和平台入口。

- 先在 Web host 实现本地账本选择/历史、统一账号登录、手动/自动同步策略、
  pending/failed/synced/local-only 和冲突 inbox，再接入 Electron IPC 与 Android WebView。
- UI 只显示安全的 endpoint/连接状态/凭据存在状态；不显示 root secret、S3 SDK
  对象、SQLite 路径或内部服务名称。
- 保留离线写入、草稿、冲突排除总额、墓碑和显式 resolution；同步刷新不能覆盖草稿。
- `manual` 模式在本地 mutation 后不调用 API；只有用户点击同步才拉取/合并/上传。
  默认 `automatic` 模式在应用活跃期间于本地提交、启动/回前台和网络恢复时尽力调度
  同一流程；两种模式都不能让远端失败回滚本地提交。
- 对跨设备 API endpoint、HTTPS 证书失败、API 401/403、错误密码和 workspace mismatch 给出
  可操作错误。

## Phase 7：测试、备份恢复和人工边界

新增/更新：`src/sync/*test.ts`、`src/main/*test.ts`、`src/web/*test.ts`、
`tests/e2e/ledger-sync.spec.ts`、`tests/e2e/config-sync.spec.ts`、新增 Compose/storage
smoke、`deploy/README.md`。

- 单元：图合并、稳定 revision/operation、条件写重试、取消、大小限制、凭据边界、
  local catalog/history、账本切换取消隔离、统一 SQLite schema/migration 和回滚。
- 集成：真实认证 API 和内置 S3 两客户端并发、首次登录/设备撤销、首次创建、响应
  丢失、MinIO/API 重启、错误密码、workspace mismatch、删除不复活、完整配置/账本
  对象隔离。
- Compose：干净启动、重复启动、权限错误、半初始化、data 目录备份/恢复到新 project、
  对象密文/ETag/实例身份验证；禁止 `down -v` 作为测试清理现有资源。
- Web/Android/Electron：启动选择/最近历史、多个本地账本隔离、WASM Worker/OPFS、
  原生 SQLite 和旧版 Android IndexedDB 兼容存储的离线重启、手动模式持续离线读写、
  自动模式前台恢复、真实认证 API/HTTPS 路径、冲突 UI、安装包和设备接入；
  保留现有生产离线证据并重新确认身份
  与本地 profile 解耦后无回归。
- Web/Android host 在活跃期间每 5 秒只探测服务端的安全远端版本标记；回到前台时立即
  补探测。`automatic` 发现标记变化后调度现有加密同步流程，`manual` 只显示“远端有
  变更”并等待用户点击同步。Web 的同源 SharedWorker 与标签页范围的 sessionStorage
  共同接管 token/账本口令，使普通刷新不必重新登录/解锁；关闭标签页/浏览器或过期、
  撤销会话后仍需重新输入，且不把会话写入 localStorage、OPFS 或账本数据。
- 服务器同步返回后 renderer 必须刷新当前 profile 的 snapshot/settings/status；主界面
  顶部固定显示同步状态并提供进入同步设置的按钮，移动端保持 44px 触控目标和无横向
  溢出。WebSocket 不是正确性依赖，普通 HTTPS marker 探测作为基线。
- 验证服务器只返回已上传的远端密文；Android 未同步时，Web 同步不能读到 Android
  本地变更。Android 后续上传时必须以当时的远端版本为基准合并 Web/其他设备变更。
- 完成 secret 扫描、TypeScript/lint/unit/Web E2E/包 smoke，并记录真实 endpoint/证书
  的人工核查，不把 loopback MinIO fixture 当跨设备证据。

## 完成条件

只有以下条件全部满足才可以将任务标记完成：

1. 一个 `compose.yaml` 从空目录自动初始化并在重启后保持状态；
2. `data/` 的内容、权限、备份窗口和恢复验证命令与文档一致；
3. 启动可以选择本地账本并保留历史；不同账本的本地 graph、设置、同步状态和请求
   完全隔离，切换/损坏/权限失败不会创建空账本或串写；
4. 两台独立设备通过统一账号、账本密码和 workspace 身份经认证 API 同步，设备不接触
   S3 credential；条件写冲突不丢数据、不重复入账，财务冲突显式解决；
5. Web/Electron/Android 共用领域与同步契约并保留离线能力；SQLite 宿主通过
   LocalLedgerStore，缺少 OPFS 的旧版 Android 使用已确认的 IndexedDB 兼容存储；
6. 服务端身份/API 使用单实例 SQLite 元数据，S3 credential 只在服务端，旧数据策略有
   明确、可验证的说明；
7. 自动化和必要人工验证证据齐全。
