# 修复生成 SDK 与 HTTPS 部署验收阻断

## 当前执行优先级（2026-09-12）

用户要求停止 VPS/Android 连接，将优先级切换到产品界面改进。本任务保留
`in_progress`，不将尚未完成的 HTTPS/物理设备验收标为通过，也不继续远端操作。
本轮本地 SDK 干净候选快照与 SQLite 恢复证据分别见
`research/sdk-reproducibility.md` 和 `research/sqlite-restore-validation.md`。
`scripts/smoke-deployed-sync.ts` 是未执行、未完成复核的草稿，不计入验收结果。
生成 core 文件已纳入本次待提交快照；先前改动和历史验收记录均保留。

## 当前执行节奏（2026-09-13）

本轮先提交已有本地进度；部署、真实跨端联动、同步及相关平台验收暂缓。任务继续保留未完成状态，后续优先级让位于前端与使用体验，不进行 VPS、用户设备或真实部署操作。

2026-09-24 从已提交 HEAD 独立归档、全新安装依赖后的 SDK/构建/测试复验见
[validation.md](validation.md)。本地复验强化 AC1/AC2，不改变 AC4–AC6 的部分完成
状态；VPS 和物理 Android 操作继续暂停。

## Goal

让当前仓库从干净检出即可重现生成 SDK、通过本地构建/类型/测试门禁，并让 Web、Android
与自托管服务之间的 HTTPS 验收边界与文档一致。用户价值是：后续可以从提交内容可靠地
构建发布物，不再依赖临时生成文件或忽略规则之外的本地状态；跨设备访问也不会因为
证书信任或非安全上下文在运行时才失败。

## Confirmed facts and evidence

- 2026-09-11 的真实验证中，当前源码复制到隔离部署目录后，先执行 `npm run api:generate`
  才能成功构建 Web/API；生成后真实浏览器的 Web、账号、同步、配置、备份和冲突场景
  共 19 项通过。
- 本地干净工作树的门禁结果：`server:typecheck` 通过；`web:build` 在
  `src/api-client/generated/client/index.js:2` 找不到 `../core/bodySerializer.gen`；
  `api:check` 报 `Generated SDK differs`；`typecheck` 报生成客户端与当前 Hey API
  类型不一致；`npm test` 为 149/150，`server:test` 为 20/21，失败均包含同一个缺失
  的 generated core runtime。
- 本地 `.gitignore:66` 的宽泛 `core` 规则会忽略
  `src/api-client/generated/core/bodySerializer.gen.ts` 及其生成运行时文件；
  `src/server/cli/generate.ts:41-77` 明确要求生成并编译 `client/` 与 `core/` vendor
  runtime，`generate.ts:108-116` 又要求生成结果与工作树完全一致。
- `Dockerfile:5-12` 和 `Dockerfile.android:5-16` 都把 `src/api-client` 复制进构建阶段，
  因此缺失的 generated core 会同时阻断 Web、Android Web 资源和容器构建。
- `deploy/README.md:21-26,48-66` 一方面说明跨设备默认需要受信任 HTTPS，另一方面允许
  可信 RFC1918 LAN 直连 HTTP；真实 Web 生产构建在 HTTP LAN origin 上无法启动离线壳，
  因为 secure context/OPFS/Service Worker 不成立。HTTPS 入口还必须保留 Origin、认证、
  条件写头、错误状态和 COOP/COEP。
- Android 开发板 `192.168.9.14` 为 AIO-3568J、Android 11、WebView 96；现有安装包已
  通过离线建账、记账、重启持久化、物理返回键、未保存草稿和窄屏无横向溢出测试。
  它访问测试服务的实验 CA HTTPS 时返回 `Failed to fetch`，说明设备尚未信任该证书。
  当前物理验证针对板上已有 APK，尚未证明它来自修复后的当前工作树。
- 测试主机 `192.168.9.3` 的临时隔离部署已清理；现有网关和服务保持运行，不能把现有
  服务数据当作本任务的测试夹具。
- 对用户提供的 `majo.im` 公共 CA 证书的公开 HTTPS 端点只读检查显示：证书主题为
  `CN=majo.im`，SAN 覆盖 `majo.im` 与 `*.majo.im`，签发者为 Google Trust Services
  `WE1`，有效期至 `2026-12-01 07:49:41 GMT`；本地 OpenSSL 使用系统信任库校验链路成功。
- 开发板当前 Android 11 WebView 加载该公开 CA 证书覆盖的 HTTPS 端点成功完成 TLS，
  没有证书错误；因此该设备不需要为这张公开 CA 证书在 APK 中额外内置 CA。这个结果只
  证明 TLS 信任，不证明 `luna.majo.im` 已经存在 Luna 业务路由。

## Android certificate options

- 应用商店 APK 通常连接使用公共 CA 签发证书的主机名，Android 系统预置的 CA 直接完成
  校验；APK 不需要也不应该携带服务器私钥。
- Android 也支持在 APK 的 `res/raw` 中携带自定义 CA，并通过 Network Security Config
  作为该应用的额外信任锚；debug-only CA 可以用 `debug-overrides` 限制在可调试构建。
  这只影响该 APK 的安全连接，不会让桌面浏览器或其他应用信任同一服务器。
- Luna 的 endpoint 是用户可输入的自托管地址，因此固定打包一个 Luna 实验 CA 不能覆盖
  任意用户的服务器；正式版更适合继续使用设备系统信任链。开发板验收可以采用仅 debug
  APK 内置测试 CA 的方案，但需要真实验证当前 WebView 是否按预期使用该应用配置。

## Resolved deployment decision

- 本任务的跨设备 HTTPS 入口固定为 `https://luna.majo.im`。现有 `majo.im`/`*.majo.im`
  公开 CA 证书由 TLS 终止层使用，证书私钥只留在远端 Nginx，不进入仓库、容器镜像或
  APK；本任务不加入 Android 自定义 CA 或忽略证书错误的逻辑。
- 外部 Nginx 只新增/启用 `luna.majo.im` 的独立路由，转发同源 `/` 与 `/api/` 到隔离
  Compose Web 服务，并保留无关路由和数据。API 使用精确的
  `LUNA_ALLOWED_ORIGINS=https://luna.majo.im`，`LUNA_ALLOW_INSECURE_LAN=false`。
- DNS 记录和远端 Nginx 路由是验收前提，但不由仓库自动申请或写入；当前受限规划环境对
  `luna.majo.im` 的 DNS 状态未能完成可靠解析，实施阶段必须在目标网络重新验证解析、
  上游连通性、证书链和回滚后的既有服务健康状态。

实施阶段已在目标网络完成上述解析、证书链、上游连通性和回滚后健康检查；临时路由与
验收栈已清理，当前仓库只保留下述源码、配置示例和任务证据。

## Requirements

### R1. Generated SDK is part of the reproducible source boundary

- 收窄或排除误伤的 `core` ignore 规则，使生成 SDK 所需的 runtime 文件能被版本控制；
  不放宽对真正 core dump/系统转储文件的忽略保护。
- 使用仓库自己的 `api:generate` 重新生成并提交与 `contracts/openapi.json` 匹配的全部
  SDK 产物，保留 vendor runtime 的 JS/declaration 编译边界，不手工编辑生成文件。
- Web、Android 和 server/runtime 的 Docker 构建上下文都必须包含实际运行所需的生成文件，
  不通过本机 `node_modules`、临时目录或远端生成结果补文件。

### R2. Local quality gates are green from a clean checkout

- 生成检查、应用类型检查、Web 生产构建、单元测试、server 类型检查和 server 测试均通过。
- 现有生成 SDK、API transport、SQLite/OPFS、加密同步和 UI 行为不因修复打包边界而改变；
  生成 SDK 的真实 HTTP listener/SQLite 契约测试继续运行。

### R3. HTTPS deployment behavior is explicit and supported

- 将 `https://luna.majo.im` 作为跨设备 Web 的目标 origin；外部 TLS 终止层转发同源的
  `/`、`/api/`，内部 Compose Web 继续监听受保护的 HTTP 端口，不直接公开 API/MinIO。
- 验收配置必须使用 `LUNA_ALLOWED_ORIGINS=https://luna.majo.im` 和
  `LUNA_ALLOW_INSECURE_LAN=false`；不得把 HTTP LAN 或证书忽略参数当作正式入口。
- 明确 Web 跨设备部署的安全上下文要求：首页、Service Worker、SQLite-WASM/OPFS 和 `/api/`
  必须通过同源或受支持的 HTTPS 入口工作；不能把普通 LAN HTTP 宣称为完整 Web 离线部署。
- 更新部署示例/说明，使 `LUNA_ALLOWED_ORIGINS` 与实际访问 origin 一致，并说明证书必须
  被目标浏览器/Android WebView 信任；保留 API 不缓存、CORS 精确来源、COOP/COEP 和反代
  必要请求头的约束。
- 不在本任务中引入新的账号、明文金融 API、加密协议或公网基础设施自动配置。

### R4. Current-source release validation

- 用修复后的当前工作树生成 Web 和 APK；APK 通过签名/清单检查后安装到
  `192.168.9.14`，配置服务端地址为 `https://luna.majo.im`，重新执行离线、重启、返回键、
  草稿、布局和真实 HTTPS 证书信任验证。
- 在 `192.168.9.3` 的全新临时目录和独立 Compose project 中部署当前产物，验证健康启动、
  API 登录、密文对象创建/条件写、重启持久化、经 `https://luna.majo.im` 的真实浏览器
  离线冷启动和第二客户端同步；若 TLS 终止主机与部署主机分离，先验证反代上游可达。
- 证据必须区分：本地门禁、真实浏览器、物理 Android、测试主机部署和证书信任；测试临时
  容器/端口清理后不得影响现有服务。

## Acceptance Criteria

- [x] **AC1 — Generated SDK complete:** 从干净检出执行 `npm ci`、`npm run api:generate`
  后，`npm run api:check` 输出 `LUNA_API_REPRODUCIBLE`；生成 core runtime 文件存在且
  受版本控制，`git diff` 不出现未解释的生成差异。
- [x] **AC2 — Build and test gates:** `./hako npm run typecheck`、`./hako npm test`、
  `./hako npm run web:build`、`./hako npm run server:typecheck` 和
  `./hako npm run server:test` 全部成功；单测和 server 测试不再因 generated core
  缺失而失败。
- [x] **AC3 — Container reproducibility:** 不执行临时手工生成步骤时，独立 Docker Web/API
  构建成功并健康启动；构建上下文包含全部运行时 SDK 依赖。
- [~] **AC4 — Supported HTTPS Web:** 真实浏览器以目标 HTTPS origin 访问当前构建时，
  `https://luna.majo.im` 的 Service Worker、SQLite-WASM/OPFS、离线冷启动、隐私/窄屏/
  离线路由和服务器账号/同步场景通过；响应包含证书可信、精确 Origin、COOP/COEP 和
  API `no-store` 等必要约束。HTTP LAN 若不再支持完整 Web 离线，文档与配置明确说明
  并有可观察失败状态。
- [~] **AC5 — Android current APK:** 当前工作树生成的 APK 安装到 `192.168.9.14` 后，
  物理返回键、草稿保留、离线写入/重启恢复、无横向溢出通过；访问远端 API 时证书信任
  `https://luna.majo.im` 的结果与系统信任策略一致，不把忽略证书错误当成产品验收。
- [~] **AC6 — Deployment/recovery evidence:** 隔离测试主机完成健康、登录、账本条件写、
  重启后数据保留和第二客户端同步；清理临时资源后现有服务仍健康，工作树只保留任务
  文档和获准的源码/配置改动；若为验收临时调整了远端 Nginx，恢复原配置后无关服务
  仍健康。

### 实施验收记录（2026-09-11）

- AC1/AC2/AC3 已通过：生成 SDK 可复现；主测试 157/157、服务端测试 21/21；类型检查、
  Web 生产构建、Compose 配置和独立 Web/API/Android 构建均成功。
- 公开 HTTPS 证书使用系统信任链校验成功，`/healthz`、`/api/v1/meta`、登录、创建账本和
  账本列表请求经 `https://luna.majo.im` 返回预期状态；响应保留 COOP/COEP、严格 CSP、
  `no-store` 和 ETag/条件请求语义。未使用证书错误忽略参数。
- 公开浏览器的离线冷启动、离线路由和存储场景已实际触发；其中部分用例在当前验收机到
  CDN 的大静态资源传输超过 30 秒而超时，单项延长超时后通过。该外部传输问题不改变本地
  157/157 回归结果，也不应被记录成完整 AC4 通过。
- 当前源码 APK 以独立包名安装到开发板，完成工作区创建、离线交易写入和进程重启恢复；
  Android 11/WebView 96 访问公开 HTTPS 时没有证书错误页。未覆盖的部分是通过开发板 UI
  完成真实账号登录/同步，因此 AC5 保持部分完成标记。
- 临时 Compose 项目、测试账号/数据、TLS 路由、端口转发隧道和 APK 独立验收包均已清理；
  主机既有健康端点仍返回 `ok`，远端 Nginx 主配置摘要未改变，因此 AC6 的清理/回滚边界
  已验证，重启持久化和第二客户端同步的本轮完整证据仍需后续专门补测。

### VPS 路径修正后的二次验收（2026-09-11）

- 通过实际 VPS 的管理入口完成只读基线：运行 12 天以上，负载约 `0.00/0.00/0.00`，
  939 MiB 内存仍有约 422 MiB 可用，根分区使用率 40%；已有容器未见异常退出。
- 首次公网重测得到的稳定 `404` 是因为 VPS Nginx 当时没有 `luna.majo.im` 的虚拟主机，
  不是 VPS 或 CDN 随机不稳定。当前源码用 `rsync` 放入唯一临时目录后，修正了过宽的
  `data/` 排除项，Web/API 镜像和 Compose 健康检查均成功。
- 临时路由启用期间，公网 `/healthz`、`/api/v1/meta`、首页连续 5/5 返回 200；394 KB
  首页脚本连续 3 次下载耗时约 1.4–2.3 秒；系统 CA 校验返回 `Verify return code: 0`。
- 生产浏览器套件以真实目标 HTTPS、单 worker、120 秒用例超时重跑，Chrome 与窄屏共
  12/12 通过，用时约 1.5 分钟。该结果覆盖离线冷启动、SQLite-WASM、OPFS、Service
  Worker、窄屏、双标签、路由和更新场景；服务器账号/第二客户端同步仍未纳入本轮。
- 临时 Compose 项目、路由、同步目录和数据已回滚；Nginx 主配置校验和保持不变，原有
  容器仍运行。公网入口在回滚后恢复默认 404，符合临时验收路由的清理设计。

## Out of scope

- 重新设计 SQLite/OPFS 数据模型、账本图合并、加密格式、账号权限或 UI 产品流程。
- 公网 DNS、商业证书购买、防火墙改造、生产 CA 签发服务和自动证书续期。
- DNS 和远端 Nginx 的永久生产运维自动化；本任务只使用已存在的公开证书，并在用户
  授权的隔离验收中验证一条可回滚的 `luna.majo.im` 路由。
- 为了让实验通过而永久关闭证书校验、扩大 CORS、允许任意 HTTP origin，或把真实密码/令牌
  写入仓库、日志和测试产物。
- 修改既有任务的历史完成状态；本任务只记录并修复本次发现的生成边界、部署文档和发布
  验收缺口。
