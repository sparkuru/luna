# 三端发布验收：当前基线对照

日期：2026-09-24。本任务的 [最终验证](research/final-validation.md) 记录的是
2026-09-08 的 PostgreSQL 方案：当时真实 Nginx、独立恢复、Electron 包装和
Android 16 模拟器各有通过证据。这些结果证明当时的产物，不能直接证明后来改为
SQLite 身份控制面、内置 MinIO 和 SQLite-WASM/OPFS 的当前源码及设备安装包。

## 当前源码已有的本地证据

| 范围 | 证据 | 当前结论 |
| --- | --- | --- |
| Compose 解析、SQLite API、同步和兼容存储 | [SQLite 任务复验](../09-10-sqlite-self-hosted-sync/validation.md) | Compose 配置通过；服务端 26/26、同步 9/9、Web 兼容存储 43/43。 |
| 生产 Web 账号路径 | [SQLite 任务复验](../09-10-sqlite-self-hosted-sync/validation.md) | 本地真实 SQLite API 与两个隔离浏览器上下文 1/1 通过；对象存储为内存夹具。 |
| 当前源码独立恢复 | [SQLite 任务复验](../09-10-sqlite-self-hosted-sync/validation.md) | 固定 MinIO 镜像与当前 API 的隔离恢复 5/5 检查组通过。 |
| 已提交生成 SDK 与构建 | [SDK 独立复验](../09-11-repair-generated-sdk-https/validation.md) | 干净源码归档执行 `npm ci` 后，生成前后 `api:check`、双类型检查、Web 构建、214/214 共享测试和 26/26 服务端测试通过。 |

上述检查没有形成当前源码的完整三端发布包验收。尤其还缺少当前 APK 的物理
Android 运行证据、当前 Electron 发布包的原生首启/目录选择检查、真实读屏与
辅助技术人工审核，以及经可信 HTTPS 入口的真实跨设备同步和生产恢复。旧版
Android WebView 的 IndexedDB 兼容路径也需要安装包证据，不能从单元测试推断。

用户于 2026-09-24 确认继续暂停 VPS 和物理 Android 操作。D6 及本任务 PRD 的
完整验收项保持未完成；本文件仅将已运行的本地证据与尚未取得的证据分开。

当日后续指令已明确恢复 VPS 和实体 Android 验收；以上暂停决定只描述此前复验
时的范围。下节记录恢复后实际运行的检查，仍不把局部证据计为完整 D6 通过。

## 2026-09-24 当前源码本地发布门复验

本轮仅使用工作区源码、隔离浏览器上下文、临时 Electron userData 和本机 Docker
开发容器；未接入 VPS、生产服务或物理 Android。复验开始时工作树为干净状态。

| 命令 | 结果与范围 |
| --- | --- |
| `npm run typecheck`、`npm run server:typecheck` | 均通过；宿主 Node 为 20.19.2，仅用于静态检查。 |
| `docker compose config --quiet` | 通过；只验证配置解析，不是容器健康或恢复演练。 |
| `npm run web:build` | 通过；生成当前 `dist-web/` 生产资源。 |
| `./hako npm run api:check` | 通过，输出 `LUNA_API_REPRODUCIBLE`；容器使用项目 Node 22 工具链。 |
| `./hako env LUNA_TEST_PRODUCTION=1 npm run test:web` | 首次以默认 8 worker 运行，196/198 通过；账号端到端流程在 120 秒超时，窄屏键盘筛选的复选框断言失败。 |
| `./hako env LUNA_TEST_PRODUCTION=1 npx playwright test tests/e2e/react-state.spec.ts:430 --project=chrome-narrow --workers=1` | 原失败项单独通过，1/1。 |
| `./hako env LUNA_TEST_PRODUCTION=1 npx playwright test tests/e2e/server-account.spec.ts:40 --project=chrome --workers=1` | 原失败项单独通过，1/1，耗时约 9 秒。 |
| `./hako env LUNA_TEST_PRODUCTION=1 npx playwright test --workers=4 --reporter=line` | 完整生产 Web 回归通过，198/198，耗时约 1.8 分钟。首次失败与并发负载相关的可能性高；尚未定位确定根因，因此保留原结果。 |
| `./hako npm run build` | 当前 Electron Linux x64 包装通过，产物为 `out/luna-linux-x64/`。 |
| `xvfb-run -a npm run smoke:electron`（首次） | 打包进程退出 1。直接隔离运行的诊断为 `LUNA_ERROR:invalid-category`，来自 `luna:create-transaction`；当时 `src/main.ts` 打包 smoke 的 renderer bridge 夹具传入 `category: 'IPC smoke'`，不符合当前目录 ID 约束。诊断日志位于 `/tmp/luna-release-electron-direct.log`。 |
| 修复后 `./hako npm run build`、`xvfb-run -a npm run smoke:electron` | 夹具改为现行目录 ID `expense:0` 后重新包装；主会话构建通过，本检查代理独立重跑打包 smoke 通过，输出 `LUNA_PACKAGED_STORAGE_SMOKE_OK`。覆盖启动、IPC/设置写入、加密备份导入、会话隔离与 userData 重开；不覆盖视觉或读屏。 |
| `npm run make -- --skip-package`、解压后 `LUNA_LEDGER_PACKAGE=<临时目录> xvfb-run -a npm run smoke:electron` | 当前 Linux x64 ZIP 生成且解压后的独立 smoke 通过。产物 `out/make/zip/linux/x64/luna-linux-x64-0.1.0.zip`，SHA256 `8b7a167d6a112068f41ccb6d0700c6fea2482367a205ceb3dccadacc42e8fbd8`；临时解压目录已清理。 |
| `LUNA_ELECTRON_NO_SANDBOX=1 xvfb-run -a node --import tsx scripts/smoke-electron-file-input.ts` | 原脚本把 `Electron` 写入如今只读的隐藏分类展示字段，附件交易没有保存；改为经真实分类弹窗选择后，打包版测试输出 `LUNA_PACKAGED_FILE_INPUT_SMOKE_OK`。覆盖附件文件选择事件、图片归一化、本地保存和解密读回；不代替原生文件选择对话框的视觉审核。 |
| 修复后 Node 22 质量门 | `./hako npm run typecheck`、`./hako npm run server:typecheck`、`./hako npm run server:test`（26/26）、`docker compose config --quiet`、与打包版相同 Nginx 镜像的 `nginx -t`、两项 Electron 打包 smoke、`task.py validate` 和 `git diff --check` 均通过。服务端 header 断言明确为 `no-store, no-transform`，覆盖 429 admission 响应。 |

容器内用 Xvfb 运行同一 Electron smoke 时先收到 `SIGTRAP`，因此以上失败诊断
取自宿主 Xvfb 的隔离运行；容器结果不能用作产品行为结论。当前无可用 Android
模拟器，且本检查代理未操作物理设备。Electron 的本机打包和 ZIP smoke 已通过，
但原生视觉/读屏与真实部署等 D6 边界不能由这些检查替代。真实 HTTPS、跨设备、
辅助技术及生产恢复条件保持上节列出的未验收状态。

## 2026-09-24 实体 Android 与独立主机续验

用户将测试主机地址更正为 `192.168.9.13`，并提供免密 SSH 账号 `lsf`。
以下所有交易、口令和备份内容均为新建的合成夹具；未清除或覆盖既有 Luna 安装。

| 范围 | 实际结果 |
| --- | --- |
| 当前源码 Android 包 | `Dockerfile.android` 的 `apk` 目标使用 `LUNA_ANDROID_APPLICATION_SUFFIX=.validation` 构建通过；独立 APK SHA256 为 `a57554926209d5df93a112ce1925fdf5525e0a206f1f7c17cf5b01e3097360cd`。`aapt` 确认为 `majo.im.luna.validation`，安装前此包名不存在；既有 `.lan` 包未覆盖。 |
| AIO-3568J / Android 11 WebView | 独立包从 `https://localhost` 安全 origin 启动。该 WebView 不提供 `navigator.storage.getDirectory`；兼容存储路径新建合成账本和一笔 `-1250` 分支为 `expense:0` 的支出，`am force-stop` 后重新启动读回同一交易。无 Service Worker 注册、无横向溢出。设备截图保存在 `/tmp/luna-android-current.EX1pWV/restarted.png`。这是物理设备上的本地持久化证据，未关闭设备网络，故不宣称断网测试。 |
| 返回键与草稿 | 实体设备 `KEYCODE_BACK` 关闭分类弹窗和交易编辑器；重新打开编辑器后合成金额 `42.00` 草稿仍在。未连接实体硬件键盘。 |
| Android DocumentsUI 备份 | 第一次取消系统保存选择器后，应用提示“已取消保存，未生成备份”。第二次仅在确认目标 `/sdcard/Download/luna-ledger-2026-09-24.luna-backup` 原本不存在后保存；从该确切文件读取 `2655` 字节，用共享 `decodeFullBackup` 独立解密，核对账本名和唯一 `-1250` 交易，密文中未包含测试口令或账本名明文。验证后已删除设备上这一个新生成的文件；本地合成密文副本保存在 `/tmp/luna-android-current.EX1pWV/physical-backup.luna-backup`。 |
| 独立主机恢复 | 从已跟踪 HEAD `96630e9` 仅传输 API 构建与恢复脚本输入至主机 `/tmp/luna-release-validation.STxRBz`，构建独立镜像 `luna-api:release-validation-20260924`（ID `sha256:8fd0b609b7f4fe3f989f5f0b87a4b0e1e3c0e8d1fefe30d3e6b23e1b14ba695c`）。运行 `LUNA_RESTORE_API_IMAGE=... node scripts/smoke-server-restore.mjs` 通过五组检查：新装、停机复制完整 `data/`、graph/附件/ETag/幂等恢复、两认证客户端 CAS 合并、API 重启。报告见 [current-source-remote-restore-20260924.json](research/current-source-remote-restore-20260924.json)。标签查询确认演练容器和网络均已清理；原有 `luna-web-1`、`luna-api-1`、`luna-minio-1` 保持 healthy。MinIO 生成的文件归属 root，首次以普通用户清理合成数据失败；确认密码免输 sudo 可用后，已仅删除本次生成的 `/tmp/luna-server-restore-DuNpRk`。此为隔离合成数据，不是生产恢复。 |
| HTTPS 入口诊断 | 正常证书校验访问公开 `https://luna.majo.im/healthz` 得到 HTTP `404`，TLS 校验码为 0；测试主机回环 `http://127.0.0.1:8080/healthz` 为 `200`。主机现有 `luna-gateway-1` 监听 `8443`，配置 `server_name 192.168.9.3`（旧 IP），对 `luna.majo.im:8443` 的直接 TLS 校验缺少可信签发链。没有绕过证书来宣称 HTTPS 通过，没有改动网关、Nginx 或现有服务。 |
| 当前源码隔离 Compose | 在 `192.168.9.13` 的 `/tmp/luna-release-validation.STxRBz` 以独立项目名 `luna-release-validation-20260924` 构建并启动 Web/API/MinIO，三个服务均 healthy/running；仅把 Web 映射到主机回环 `127.0.0.1:18081`。本机 `curl http://127.0.0.1:18081/healthz` 返回 200。现有主栈未重建或停止。验收结束已执行该项目的 `compose down --remove-orphans` 并删除该确切临时目录和合成数据；原有主栈 Web/API 仍 healthy。 |
| VPS 临时连通性 | 用户说明 `ssh wkyuu@ssh.majo.im` 是 `luna.majo.im` 的 VPS，且尚未实施 VPS 侧 Luna 路由。只读 `nginx -T` 确认现有站点中没有 `luna.majo.im`，证书路径与其他域名共用 `majo.im` 泛域证书。两个仅绑定回环的临时 SSH 转发使 VPS 的 `http://127.0.0.1:19440/healthz` 到达上述隔离实例并返回 200。实际启用的单独 Nginx 站点内容见 [临时路由草案](research/vps-luna-temporary-route-20260924.nginx)，不是持续部署。 |

## 2026-09-24 公网 HTTPS 与跨设备续验

用户审阅并明确同意临时启用 `luna.majo.im` 站点，并要求验收后回滚。VPS 只新增
`/etc/nginx/sites-enabled/luna-validation-20260924.conf`，检查 `nginx -t` 通过后 reload；
公网 `https://luna.majo.im/healthz` 在正常证书校验下由 404 变成 200。
测试账号、账本和交易全部属于上述隔离 Compose 数据集。

| 检查 | 结果 |
| --- | --- |
| 两个独立浏览器上下文 | 第一个上下文通过公网 HTTPS 登录、上传含 `Synthetic HTTPS transaction` 的加密账本；第二个上下文登录并恢复同一交易，刷新页面后仍可读回。 |
| 实体 Android 接收 | 在隔离 `.validation` 包中，经 `https://localhost` WebView 登录同一公网账户并恢复浏览器交易；`am force-stop` 后重新启动仍可读回。隔离 API 同时允许 `https://luna.majo.im` 与 `https://localhost` 两个精确 origin；Android 预检返回 `Access-Control-Allow-Origin: https://localhost`。 |
| Android 反向同步首次失败 | 实体设备新增 `Synthetic Android return` 后，重新登录解锁未成功；本地交易仍保留。WebView 的加密对象 GET 返回 `Content-Encoding: gzip` 和弱 `ETag: W/"…"`，后续 PUT 以同一弱值作 `If-Match`，连续四次收到 412。直接回环以及公网 `Accept-Encoding: identity` 请求均取得同一对象的强 ETag。代码路径、HTTP 约束和证据见 [弱 ETag 排查](research/android-reunlock-weak-etag-20260924.md)。 |
| 边缘压缩修复与重试 | 仅在隔离 Web 镜像中把 API `Cache-Control` 改为 `no-store, no-transform` 并重建 Web；公网 gzip-capable 请求与 Android WebView 均收到未压缩响应及强 ETag。Android 原有本地交易在再次解锁后同步成功，新的独立浏览器从公网恢复并读回 `Synthetic Android return`。Android WebView 对同一加密对象的复查为 HTTP 200、强 ETag、无 `Content-Encoding`、`Cache-Control: no-store, no-transform`。源码修复在 `deploy/nginx.conf`；这轮隔离 API 镜像未包含后来补充的直连 API header 修复。 |
| 回滚与清理 | 删除临时 VPS 站点和草案副本，`nginx -t` 再次通过并 reload；公网 `/healthz` 恢复 HTTP 404 且 TLS 校验码 0。关闭两个临时 SSH 转发，停止并删除隔离 Compose 及合成数据；只卸载 `majo.im.luna.validation`，确认既有 `majo.im.luna.lan` 仍安装。VPS 没有留下 Luna 业务路由。 |

这些结果证实当前源码的 Web 与 Android 在临时可信 HTTPS 入口上的双向合成数据
同步，但没有形成长期 VPS 路由或生产数据恢复证据。真实读屏/辅助技术、实体硬件
键盘及 Electron 原生首启目录选择仍未人工审核；D6 与本任务完整交付标准保持未完成。
