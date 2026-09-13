# 生成 SDK 与 `luna.majo.im` 验证基线

日期：2026-09-11。本文只记录规划阶段已经完成的证据；临时部署、测试账号、令牌、
证书私钥和远端数据均不属于提交物。

## 当前源码与本地门禁

- 干净检出没有 `src/api-client/generated/core/`，但
  `src/api-client/generated/client/index.js`、`utils.gen.js` 和对应声明引用
  `../core/bodySerializer.gen`。
- `.gitignore` 的 `core` 规则会忽略该生成目录；`src/server/cli/generate.ts` 会生成
  `client/` 与 `core/`，并把 vendor runtime 编译成 JS/declaration 后删除源 TS。
- `./hako npm run web:build` 因缺少 `../core/bodySerializer.gen` 失败；
  `./hako npm run api:check` 报 `Generated SDK differs`。
- `./hako npm run typecheck` 当前有生成客户端与 Hey API 类型不匹配的错误；
  `./hako npm test` 为 149/150，`./hako npm run server:test` 为 20/21，失败都包含
  同一个 generated core runtime 缺失边界；`./hako npm run server:typecheck` 通过。
- Dockerfile 与 Dockerfile.android 都复制 `src/api-client`，因此这个问题会同时影响 Web
  容器和 Android APK 资源。

## 已完成的隔离部署证据

- 当前源码复制到 `192.168.9.3` 的临时 Compose project 后，先运行
  `npm run api:generate` 才能构建；生成后 API/Web 健康、登录、密文账本条件写、重启
  持久化均通过。
- 真实 Chromium HTTPS 验证在临时 TLS 入口上通过 19/19 项：SQLite-WASM/OPFS 离线
  冷启动、陈旧编辑、双标签、隐私/窄屏/离线路由，以及账号、账本同步、配置同步、备份
  和冲突场景。首次只忽略页面证书而不忽略 Chromium 进程校验时，Service Worker 仍因
  证书错误失败；这证明产品验收必须使用真实受信证书，不能只设置 Playwright 的
  `ignoreHTTPSErrors`。
- 临时 project、TLS sidecar、容器、端口和测试数据已清理；既有服务未作为本任务夹具。

## 证书与 Android WebView

- 对用户提供的 `majo.im` 公共证书的公开握手显示：主题 `CN=majo.im`，SAN 为 `majo.im`
  与 `*.majo.im`，签发者为 Google Trust Services `WE1`，有效期截至
  `2026-12-01 07:49:41 GMT`；本地 OpenSSL 系统信任链校验成功。
- 实施阶段已在目标网络验证 `luna.majo.im` 的 DNS、证书 SAN/有效期、TLS 终止层到
  Compose Web 上游的连通性和 Nginx 配置；临时路由随后已回滚。
- 当前源码 APK 已在 Android 11 的 AIO-3568J 开发板（WebView 96.0.4664.104）独立包名下
  安装，完成离线工作区创建、交易写入和进程重启恢复；开发板浏览器打开
  `https://luna.majo.im` 显示受信任连接，没有证书错误页。

## 实施阶段补充证据

- 本地生成 SDK、类型、主测试、服务端测试和生产 Web/Android 构建均成功；生成 SDK 的
  `core` runtime 已纳入工作树并通过 `LUNA_API_REPRODUCIBLE`。
- 临时 HTTPS 入口的公开浏览器测试没有启用证书错误忽略；健康、meta、登录、创建账本和
  账本列表请求成功，响应头保留 COOP/COEP、CSP、API `no-store` 和 ETag/条件请求语义。
- 公开 CDN 的大静态资源传输在部分 30 秒浏览器用例中超时；这是当前验收网络的外部传输
  限制，TLS 终止机到应用容器的本地资源传输正常。完整跨设备账号同步仍需在稳定网络中
  重新补测。

## VPS 路径修正后的二次重测

- 通过实际 VPS 管理入口完成只读检查：运行 12 天以上、负载约 `0.00/0.00/0.00`、总内存
  939 MiB（约 422 MiB 可用）、根分区使用率 40%；既有容器保持运行和健康。
- 公网入口最初稳定返回 404，原因是该 VPS 的 Nginx 没有 `luna.majo.im` 虚拟主机，
  不是 VPS 资源或链路抖动。随后在唯一临时目录中用 `rsync` 同步当前构建输入；发现并
  修正 `data/` 排除项误伤 `src/renderer/data/` 的问题后，Web/API 镜像成功构建。
- 临时 HTTPS 路由启用后，公网健康、meta、首页连续 5/5 为 200；394 KB 首页脚本连续
  3 次下载为 200，耗时约 1.4–2.3 秒；OpenSSL 系统信任链校验成功。
- 真实生产浏览器套件使用单 worker 和 120 秒用例超时重跑，Chrome/窄屏 12/12 通过，
  用时约 1.5 分钟。完整账号登录、第二客户端同步和 API 重启持久化仍需单独补测。
- 临时 Compose、Nginx 路由、部署目录和测试数据已清理；Nginx 主配置校验和未改变，
  既有容器仍运行。

## 验证边界

- `https://luna.majo.im` 应由已有 TLS 终止层使用证书，证书私钥不读取、不上传、不写入
  仓库或 APK。
- Android 本任务只走系统信任链；任何自签名/debug CA 方案属于后续独立决策，不得用来
  替代本次真实 HTTPS 验收。
