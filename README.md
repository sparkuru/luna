# Luna

Luna 是一个离线优先的家庭收入/支出记录器，界面运行在浏览器、Electron 和
Android APK。账本数据先写入当前设备的本地数据库：Electron 使用原生 SQLite，
Web 使用 SQLite-WASM + OPFS Worker；Android 优先使用同一路径，旧版 Android WebView
缺少 OPFS 时在安全的内置 `https://localhost` origin 使用 IndexedDB 兼容存储；设备间同步的是端侧加密后的历史对象，
不是 SQLite 文件，也不是服务端明文账本。

## 一条 Compose 启动自托管服务

需要 Docker Engine 和 Compose v2。用户不需要预建 PostgreSQL secret，也不需要了解
内部服务：

```sh
cp deploy/.env.example .env
docker compose up --build -d
docker compose ps
docker compose exec api node dist/server/server/cli/admin.js create-account
```

打开 `http://127.0.0.1:8080`。Compose 会自动创建 `data/`，其中包含服务端 SQLite、
内置 MinIO 对象数据、实例身份和内部运行凭据；`data/` 是服务端备份边界。完整的
停止、备份、恢复、HTTPS 和权限说明见 [部署与恢复](deploy/README.md)。不要用
`docker compose down -v` 做日常清理。

## 多设备账本同步

在每台设备上只填写：

1. 服务端 URL；
2. 统一账号和账号密码；
3. 账本解锁密码。

设备不填写 S3 endpoint、bucket、access key 或 secret。服务端登录只提供身份与授权，
内置 MinIO 只保存客户端加密密文。账号密码和账本密码职责不同，账号重置不能恢复
遗忘的账本密码。

默认开启“应用活跃时自动同步”，也可以按本地账本切换为“仅手动同步”。两种模式
都允许离线继续记账；手动模式下，直到用户明确点击同步，本设备的新记录不会进入
服务端，也不会出现在其他设备。应用关闭后的后台同步只是尽力而为，不作为数据承诺。

同步发生条件是“设备已经上传”：如果 Android 只在本地追加而没有同步，Web 不能让
服务器凭空拉取 Android 的 SQLite；Android 下一次同步时会拉取远端版本、合并双方
历史，再以条件写提交。冲突不会静默覆盖，删除墓碑和待解决候选会保留。

账本同步和 portable display-settings 配置同步是两条边界。后者仍保留一个可选的
用户自有 S3-compatible 配置入口，用于兼容现有设置同步；它不需要也不会改变内置
服务端账本仓库。

## 本地账本选择与备份

启动时使用当前设备的本地账本 catalog，最近使用项会排在前面；顶部选择器可以在
多个本地账本之间切换。每个账本有独立的 SQLite 数据边界、设置、同步状态和冲突
历史。账号登录不会自动替换当前本地账本。

Web/Android 的本地存储属于浏览器 origin 私有存储，不是用户可以直接复制的目录；请使用
“加密备份”导出账本，或依赖服务端成功同步后的密文仓库。清除浏览器站点数据、
浏览器回收存储或卸载应用都可能移除本地副本。服务端 `data/` 备份不包含设备尚未
同步的手动模式变更。

Electron 的本地 profile 位于应用数据目录；Linux 默认是 `~/.config/luna`，账本使用
原生 SQLite。设备本地备份和服务端 `data/` 备份是两个不同边界，生产使用时应分别
保留。

## Android APK

构建 APK：

```sh
docker compose -f compose.android.yaml build android-apk
docker compose -f compose.android.yaml run --rm android-apk
```

产物位于 `artifacts/android/luna-debug.apk`。APK 内嵌 Web 资源，不把桌面上的
`localhost` 当作服务器地址；跨设备同步需填写 Android 可达且证书受信任的 HTTPS
服务端地址。系统文档选择器导出的加密备份只有在文件写入并关闭后才报告成功。

## 本地开发与验证

项目目标是 Node 22；`hako` 在 Docker 中提供可复现命令：

```sh
./hako npm install
./hako npm test
./hako npm run typecheck
./hako npm run server:typecheck
./hako npm run server:test
./hako npm run test:server-sync
./hako npm run web:build
```

Web 开发服务器和 Playwright：

```sh
npm run web
npm run test:web
```

`npm run web` 适合在本机使用 `http://localhost:4173`。如果要让另一台设备
通过局域网打开 Web 开发预览，请使用：

```sh
./preview.sh
```

脚本会在 `4173` 启动 HTTPS，并为本机发现到的局域网地址生成临时自签名证书；
按脚本输出的 `https://<host-ip>:4173` 打开，并在每台测试设备上接受一次证书警告。
普通 `http://<host-ip>:4173` 不是安全上下文，浏览器不会提供 OPFS，SQLite-WASM
账本无法启动。内置 Android APK 的 `https://localhost` 是受信任的安全 origin；如果
设备 WebView 没有 OPFS，APK 会明确使用 IndexedDB 兼容存储，不影响普通浏览器的
HTTP 拒绝策略。

Web 生产部署必须返回 `Cross-Origin-Opener-Policy: same-origin` 和
`Cross-Origin-Embedder-Policy: require-corp`，以启用支持多标签锁的普通 SQLite-WASM/OPFS
路径。支持 OPFS 但非隔离的 Android WebView 使用内置 `opfs-sahpool` 路径；更旧的
WebView 使用原生安全 origin 下的 IndexedDB 兼容路径。Playwright 需要已安装 Chrome channel；真实 Android、跨设备 HTTPS 证书和
生产备份恢复仍需人工核查，不能用本机 loopback fixture 代替。

服务端命令：

```sh
./hako npm run server:build
./hako npm run api:check
docker compose exec api node dist/server/server/cli/admin.js reset-password
docker compose exec api node dist/server/server/cli/admin.js cleanup
```

服务端元数据使用单实例 SQLite；AWS SDK/MinIO 只在服务端对象存储边界内，客户端
同步通过认证 HTTP API，服务端不会增加明文财务 CRUD。
