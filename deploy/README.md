# Luna 部署与恢复

这一套 Compose 是 Luna 的服务端控制面：Web、认证/同步 API、服务端元数据
SQLite 和内置 MinIO 一起启动。账本仍然在设备端加密，MinIO 只保存密文；设备
只需要填写服务端地址、统一账号和账本密码，不需要知道 S3 endpoint、bucket 或
access key。

## 启动

需要 Docker Engine 和 Compose v2。首次启动不需要预先创建 secret 文件，也不需要
在宿主机安装 Node 或运行初始化脚本：

```sh
cp deploy/.env.example .env
docker compose up --build -d
docker compose ps
docker compose exec api node dist/server/server/cli/admin.js create-account
```

最后一条命令会交互式创建管理员账号；没有默认账号，也没有公开注册。然后打开
`http://127.0.0.1:8080`。其他电脑或 Android 设备不能使用它们自己的
`localhost` 访问宿主机；跨设备使用时，默认需要一个设备可达的主机名/IP，以及受信任
的 HTTPS 反向代理。若只在可信的 RFC1918 IPv4 局域网内直连 HTTP，可显式设置
`LUNA_BIND_HOST=0.0.0.0`、`LUNA_ALLOWED_ORIGINS=http://<宿主机IP>:<端口>` 和
`LUNA_ALLOW_INSECURE_LAN=true`；这不会放开公网或任意域名 HTTP。Compose 不会替你配置
DNS、防火墙或证书信任。

启动顺序由 Compose 管理：`instance-init` 先创建安装状态，MinIO 使用同一份
内部凭据启动，API 等待 MinIO 可用后才监听，Web 等 API healthy 后才提供服务。
初始化失败、权限错误、半初始化和未来版本配置都会让容器失败，不会伪装成空安装。
API 的启动重试有界；修复原因后重新运行 `docker compose up -d` 即可。

停止和重启：

```sh
docker compose stop
docker compose up -d
```

不要用 `docker compose down -v` 作为日常停止、升级或清理命令；它会删除持久化
volume（如果未来手动添加了 volume），而本项目的正式数据边界是 `./data/`。

## 配置

把 `deploy/.env.example` 复制到项目根目录的 `.env`。它只包含非秘密配置：

- `LUNA_BIND_HOST` / `LUNA_PORT`：Web 对宿主机的监听地址和端口；默认只监听回环地址。
- `LUNA_ALLOWED_ORIGINS`：逗号分隔的精确 origin，必须与浏览器实际访问地址一致，不能
  带路径或末尾 `/`。
- `LUNA_ALLOW_INSECURE_LAN`：默认 `false`；只有可信 RFC1918 IPv4 HTTP 直连时才设为
  `true`，生产和不可信网络仍使用 HTTPS。
- `LUNA_DATA_PATH`：数据目录 bind mount，默认 `./data`。恢复演练或切换到已校验的
  备份目录时可以改成另一个相对/绝对路径；不要在服务运行期间切换它。
- `LUNA_UID` / `LUNA_GID`：`data/` 的宿主机所有者，默认 1000:1000。API 容器以
  非 root 用户运行；若宿主机使用其他 UID/GID，启动前调整这两个值。

改端口时同时修改 origin，例如：

```dotenv
LUNA_PORT=8081
LUNA_ALLOWED_ORIGINS=http://127.0.0.1:8081,http://localhost:8081
```

生产或跨设备使用时，在外部 HTTPS 代理上转发 `/` 和 `/api/`，保留 `Origin`、
`Authorization`、`If-Match`、`If-None-Match` 等请求头，并保留 API 的错误状态码。
代理响应也必须保留 COOP/COEP 头；Web 端借此启用支持多标签锁的普通 SQLite-WASM/OPFS：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

内置 MinIO 是服务端内部实现细节。不要把 `.luna/runtime.json` 中的内容复制到
客户端、前端环境变量、公开 issue 或日志中。客户端账本同步界面不会要求 S3 配置。
当前应用还保留一个独立的、可选的 portable display-settings S3 兼容同步入口；它
不属于服务端账本同步，也不影响 `data/` 内置仓库。

## `data/` 是唯一服务端备份边界

Compose 会自动创建并保护这个目录，典型内容如下：

```text
data/
├── .luna/
│   ├── initialized       # 初始化完成标记
│   ├── runtime.json      # MinIO 地址、bucket 和内部凭据（0600）
│   └── minio.env         # MinIO 启动凭据（0600）
├── server.sqlite         # 账号、会话、账本授权、远端对象元数据
├── server.sqlite-wal     # SQLite 运行时 sidecar（可能存在）
├── server.sqlite-shm     # SQLite 运行时 sidecar（可能存在）
└── minio/                # 加密账本/配置对象
```

服务器 SQLite 只保存控制面和远端对象的校验元数据；财务明文不进入 API 或 MinIO。
每台设备仍有自己的本地数据库：Web 使用 SQLite-WASM + OPFS；Android 优先使用
SQLite-WASM + OPFS，旧版 Android WebView 缺少 OPFS 时使用安全内置 origin 下的
IndexedDB 兼容存储；Electron 使用原生 SQLite。`data/` 不是设备本地数据库的替代备份；手动同步模式下尚未主动上传
的本地变更也不在这里。

## 备份

备份必须覆盖整个 `data/`，不能只拷贝 `server.sqlite`，也不能在 API/MinIO 正在写入
时直接复制 WAL 或对象目录。推荐短暂停止写入窗口：

```sh
docker compose stop api minio
umask 077
mkdir -p backups
rsync -a --numeric-ids data/ backups/luna-data-2026-09-10/
sha256sum backups/luna-data-2026-09-10/server.sqlite \
  > backups/luna-data-2026-09-10/server.sqlite.sha256
docker compose start minio api
docker compose ps
```

将 `backups/luna-data-YYYY-MM-DD/` 作为一个整体保存到脱机或异地位置；不要把
`.luna/runtime.json` 和 `minio.env` 放进公开备份。它们包含安装级内部凭据，备份本身
按敏感数据处理。恢复前先校验目录完整、权限可读且没有被改名或截断。

若不能停机，必须使用支持一致性快照的文件系统快照，并同时覆盖 SQLite WAL/SHM 与
MinIO 对象目录；普通 `cp -r` 不算一致性备份。

## 恢复到新目录

恢复时保留旧安装不动，先在新的 Compose project 或新的空目录验证：

```sh
mkdir -p luna-recovery/data
rsync -a --numeric-ids backups/luna-data-2026-09-10/ luna-recovery/data/
cp compose.yaml Dockerfile Dockerfile.server package.json package-lock.json tsconfig.json \
  vite.web.config.ts luna-recovery/
mkdir -p luna-recovery/deploy luna-recovery/scripts luna-recovery/src
cp deploy/instance-init.mjs deploy/nginx.conf deploy/.env.example \
  deploy/server-runtime-package.mjs luna-recovery/deploy/
cp scripts/web-offline-plugin.ts luna-recovery/scripts/
cp -r src/server src/shared src/sync src/api-client src/renderer src/web luna-recovery/src/
cp deploy/.env.example luna-recovery/.env
cd luna-recovery
docker compose up --build -d
docker compose ps
curl -fsS http://127.0.0.1:8080/api/v1/meta
```

如果只想在当前项目切换到恢复目录，可把根目录 `.env` 的
`LUNA_DATA_PATH=./data` 临时改成恢复目录路径，再执行同一组 `docker compose up`；
验证完成后恢复原值。恢复目录必须先完整复制并在停机窗口校验。

`data/` 中的安装身份、账号哈希、会话元数据、SQLite schema、MinIO bucket 和密文
对象必须一起恢复。检查 `/api/v1/meta` 的 `instanceId` 与原安装一致，然后人工验证：

1. 用原账号登录；
2. 用账本密码打开期望的本地账本或在新设备选择恢复服务器副本；
3. 检查工作区、交易、预算历史、墓碑和冲突 inbox；
4. 在第二台测试设备完成一次拉取/合并/上传；
5. 检查服务端日志只包含请求元数据，没有密码、Authorization 或密文正文。

恢复不会找回已经丢失且从未同步的设备本地记录。恢复后客户端应重新读取远端版本，
不要拿旧的本地快照盲目覆盖恢复后的对象。若备份早于密码重置或会话撤销，恢复后应
立即重置密码并撤销不再信任的会话。

## 管理与升级

```sh
docker compose exec api node dist/server/server/cli/admin.js reset-password
docker compose exec api node dist/server/server/cli/admin.js cleanup
```

密码重置会撤销该账号的服务端会话，不删除设备上的本地账本。`cleanup` 清理过期
会话、幂等记录和旧安全事件；按需通过宿主机 cron 或外部调度器运行。

升级前先备份 `data/`，记录镜像 digest，然后在维护窗口运行：

```sh
docker compose build
docker compose up -d
docker compose ps
```

若迁移失败，保留原目录，查看 `api` 和 `instance-init` 的状态并恢复备份到新的
project 验证。不要手工编辑 SQLite、删除 `.luna/initialized` 或删除 MinIO 对象来
“重置”安装；这可能使元数据和对象版本不一致。

## 设备端同步边界

默认是“应用活跃时自动同步”，用户可以按本地账本切换为“仅手动同步”。本地写入
始终先提交到设备 SQLite，远端失败不会回滚本地记录。手动模式下，直到用户明确点
击同步，新增记录只存在当前设备；另一个设备无法让服务器替它上传未同步的数据。

自动同步是前台/活跃期间的尽力调度，不承诺应用被系统完全关闭后仍能后台运行。两台
设备使用同一账号和账本密码时，服务器只返回已经上传的密文；条件写冲突由客户端
重新拉取、解密、合并并在需要时显示冲突，不能通过覆盖整个 SQLite 文件解决。
