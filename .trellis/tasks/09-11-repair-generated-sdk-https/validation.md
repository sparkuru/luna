# 生成 SDK：已提交源码独立复验

日期：2026-09-24；来源提交 `2c40315`。使用 `git archive HEAD` 将全部已跟踪源码
提取到 `/tmp/luna-sdk-clean.oTktqN/source`。本轮工作树另有直观记账 UI 的未提交
任务改动，归档不包含它们，也不复用主工作树的 `node_modules`。

## 已运行

1. 在独立归档中通过项目 `./hako` 执行 `npm ci`，安装锁定的 765 个包。
2. 生成前执行 `npm run api:check`，输出 `LUNA_API_REPRODUCIBLE`；随后执行
   `npm run api:generate` 和第二次 `api:check`，同样通过。
3. `diff -qr` 比对生成前后 `contracts/` 与 `src/api-client/generated/`，两处均无
   字节差异。已提交的 `src/api-client/generated/core/` 包含 16 个文件。
4. 同一独立归档运行 `typecheck`、`server:typecheck`、`web:build`，全部通过；
   `npm test` 为 214/214，`server:test` 为 26/26。

以上只证明当前**已提交** SDK 源码与本地构建门禁可复现。`npm ci` 报告四项高严重度
依赖公告，本轮未改动锁文件，也未进行依赖安全审查。

## 未覆盖

没有连接 VPS、公开 HTTPS 入口或物理 Android。AC4 的真实 HTTPS 账号/同步、AC5
的当前 APK 远端登录/同步，以及 AC6 的远端隔离部署与第二客户端验收仍保持部分
完成。隔离本地 SQLite/MinIO 恢复的当前源码证据另见
[SQLite 任务验证](../09-10-sqlite-self-hosted-sync/validation.md)，不能替代真实部署。

任务继续为 `in_progress`。`.trellis/spec/backend/http-api-guidelines.md` 已要求用
`api:check` 检查生成契约并禁止手改 SDK，本轮没有新增代码规范。

## 2026-09-24—25 当前提交续验（`f69e851`）

- `./hako npm run api:check` 再次输出 `LUNA_API_REPRODUCIBLE`，`./hako npm test`
  为 214/214；Web/API 从当前已提交源码独立构建成功。
- 在 `192.168.9.13` 的 `/tmp/luna-sdk-validation.HGNsyK`，以唯一 Compose project
  `luna-sdk-validation-20260924` 从 `git archive HEAD` 构建并启动 Web/API/MinIO/
  两阶段初始化。Web、API、MinIO 健康，Web 仅映射到主机回环 `127.0.0.1:18082`。
  Web/API/bucket-init 镜像 ID 分别为 `c10227f4d588`、`19c29e4512ca`、
  `92f083dd71df`；隔离 `data/` 与 `.luna/` 权限为 0700，两个密钥文件为 0600。
  这些检查证明当前 Compose 可启动，尚未覆盖 API 重启后数据保留或两客户端收敛。
- 经本机和 VPS 两个仅绑定回环的临时 SSH 转发，按先前授权临时启用独立
  `luna.majo.im` Nginx 站点。正常 CA 校验的公网 `/healthz` 返回 200，Web
  COOP/COEP 和 API 精确 CORS、`no-store, no-transform` 均可见。Chrome 在该真实
  HTTPS origin 上完成本地账本/交易、secure context、OPFS 与 Service Worker 检查。
  完整公开浏览器烟测未通过：一次性账号的 HTTP 登录请求返回 201，但脚本在 UI 账号
  确认处超时；当时账号元素存在，页面另显示工作区不匹配提示。尚不能判断是烟测
  状态/期望、旧数据状态，还是产品流程问题，故不能宣称账号、双客户端、手动同步或
  离线冷启动通过。烟测脚本已按当前记账入口、账号导航、首次绑定确认和账本选择页
  修正，并经独立静态复核与 typecheck；主机离线后尚未对修正版本进行公网复测。
- 当前源码 APK 通过容器构建、签名验证，SHA256 为
  `8b75c5139744f48d09ebc988b8ee194dbb9df53c1ed4ee716c15facdbe5d2731`，包名为
  `majo.im.luna.validation`。AIO-3568J / Android 11 / WebView 96 上，以 WebView
  离线网络模拟通过本地写入、离线刷新、进程重启持久化、无横向溢出与实体 Back 输入
  保留草稿。次日用户提供 PLR110 / Android 16 / WebView 143；同一 APK 在其
  `https://localhost` 安全 origin 上再次通过这些项目，`navigator.storage.getDirectory`
  可用，视口宽度与页面滚动宽度均为 427。PLR110 的独立验收包已卸载。
  这些是设备本地证据，尚无本轮 APK 经公网 HTTPS 的真实账号同步和证书信任结果。
- 2026-09-25，`192.168.9.13` 暂时离线，SSH 返回 `No route to host`；两条隧道
  已断。VPS 上本轮唯一临时站点
  `/etc/nginx/sites-enabled/luna-sdk-validation-20260924.conf` 已删除，`nginx -t`
  通过并 reload；公网 `/healthz` 恢复 HTTP 404，TLS 校验结果为 0。
  **待 9.13 上线后**，核对并清理唯一 project `luna-sdk-validation-20260924` 与
  `/tmp/luna-sdk-validation.HGNsyK` 中的合成数据；当前不能确认远端项目是否仍存在。
  旧 AIO-3568J 同时离线，其 `.validation` 包尚待确认并仅卸载该包；不能把这两项
  清理写成已完成。

AC1—AC3 保持通过，AC4—AC6 保持部分完成，任务不归档。远端恢复后先核对隔离资源
并完成上述精确清理，再按当前提交重测真实 HTTPS 账号、双客户端和 Android 远端同步。

## 2026-09-28 测试主机恢复与隔离资源清理

`ssh lsf@192.168.9.13` 已恢复。因本机系统级 SSH 配置文件权限错误，本轮使用可读的
`~/.ssh/config`（`ssh -F`）连接；密钥认证探测通过。只读核对发现唯一 Compose project
`luna-sdk-validation-20260924` 的 Web、API、MinIO 仍在运行，两个初始化容器已退出；
项目容器的 `com.docker.compose.project.working_dir` 均指向
`/tmp/luna-sdk-validation.HGNsyK`，API/MinIO 数据挂载指向该目录下的 `data/`。
该目录由 `lsf` 持有、模式为 0700、大小约 11 MB；未读取其中的凭据内容。

用户批准停止该唯一项目并删除上述整个临时目录。执行前再次核对目录不是符号链接、
项目标签和工作目录一致、没有其他项目容器挂载此目录。随后以原两个 Compose 文件和
精确项目名执行 `down --remove-orphans`，没有使用 `-v`；确认该项目的容器及网络均已消失，
再删除该目录并确认路径不存在。主机既有 `luna-gateway-1`、`luna-web-1` 和
`luna-api-1` 仍在运行，后两者显示 healthy；`luna-minio-1` 仍在运行。

此次只完成 2026-09-25 留下的主机隔离资源清理。没有重新部署公网临时路由、重测
HTTPS 账号或双客户端同步，也没有连接旧 AIO-3568J 核对其 `.validation` 包。
AC4—AC6 仍为部分完成，本任务继续 `in_progress`。后续若做远端验收，须基于当时的
源码与独立合成项目重新建立可回滚环境；不能复用此次已清理的项目。

## 2026-09-28 当前 HEAD 的真实 HTTPS 与 Android 续验

验收基线为 `85c2ce9` 的已提交源码；工作树同时有另一移动端任务的未提交改动，
没有把这些改动混入 Web/API 或 APK 产物。经用户批准，只把筛查过的 Web/API
构建文件包传至 `192.168.9.13` 的 `/tmp/luna-sdk-resume.VTbJEA`，以唯一 Compose
project `luna-sdk-resume-20260928` 构建 Web、API、MinIO 和初始化容器。
Web/API 健康，Web 只绑定 `127.0.0.1:18082`；本机与 VPS 回环 SSH 隧道将它接到
临时 `luna.majo.im` Nginx 站点。公网 `/healthz` 和 `/api/v1/meta` 均为 200，
系统 CA 校验结果为 0。API 使用精确允许来源和禁止不安全 LAN 的验收配置；
没有传输或读取 VPS 私钥。

- 当前 Chrome 153 在真实 `https://luna.majo.im/` 上运行
  `scripts/smoke-deployed-sync.ts`，六项全部通过：受信 HTTPS 头、安全上下文、
  OPFS/Service Worker；首次 UI 登录绑定上传；独立第二浏览器 UI 登录下载；
  手动模式下离线写入、刷新且不提前上传；再次手动同步后两端收敛；第二浏览器
  离线冷启动仍能读到账本。只用了独立合成账号和合成交易。
- 隔离 API 重启前后，实例 ID、账号会话、账本对象 ETag 与密文字节摘要一致，
  证明该项目的 SQLite/MinIO 数据在 API 重启后仍可用。
- 当前 `HEAD` 独立构建的 APK SHA256 为
  `70ea34e2e934e947635a8795e9c2492c0f1471fec3c3350d5199baa1248eadff`；
  Android 签名 v2 与清单检查通过，独立包名 `majo.im.luna.validation`。
  经用户批准先卸载旧同名测试包及其合成数据，再把新 APK 安装到 AIO-3568J
  （Android 11、WebView 96）。WebView 在 `https://localhost` 安全上下文
  通过真实 CA 信任的 `https://luna.majo.im/api/v1/meta` 请求（200）；该旧
  WebView 无 OPFS，按兼容路径使用本地存储。UI 完成账号登录；APK 内的
  `window.lunaLedger.server.connect` 成功下载两笔浏览器合成交易。手机新增
  第三笔合成交易并同步后，新的独立 Chrome 会话通过 UI 登录、下载并读到该交易；
  手机进程强制结束再启动后，本地仍有三笔交易及两端的合成标记。重启后会话
  显示未连接，符合需要重新登录/解锁的产品说明。
- Android 自动化最初在点击 UI 的“连接”后，因等待交易列表选择器而超时；
  账号页不会显示这个列表。随后直接调用 APK 内公开 host API 完成连接，
  UI 也显示已同步；因此这里证明了 UI 登录和 APK 运行时双向同步，**不把
  Android UI 的连接按钮单独记作通过**。手机上的当前 APK 也没有重新运行物理
  返回键、草稿保留和窄屏布局检查。

清理已获用户明确批准。卸载 `majo.im.luna.validation` 后设备仅剩原有
`majo.im.luna.lan`；移除 WebView 端口转发。VPS 临时站点、配置和反向隧道
已撤除，`nginx -t` 通过并重载，公网 `/healthz` 恢复 404 且 TLS 校验结果仍为 0。
停止唯一 Compose project 后，精确删除 `/tmp/luna-sdk-resume.VTbJEA`；
测试主机主栈 `luna-web-1`、`luna-api-1` 保持 healthy。另一个早已处于
Restarting 的 `luna-web-deploy-lsf-20260911-api-1` 未改动。本地合成凭据及
含 token 的暂存文件已删除。

AC6 的当前部署、双客户端、重启持久化和清理回滚验收已完成。AC4 的当前
生产版隐私/窄屏/离线路由套件，以及 AC5 的当前 APK 物理返回键、草稿、
离线写入/重启和无横向溢出尚缺同一版本的完整证据，继续保持部分完成。
