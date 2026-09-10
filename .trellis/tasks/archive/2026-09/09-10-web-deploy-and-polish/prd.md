# 部署并打磨真正可用的 Web 服务

## Goal

把当前 Web-first、离线优先的 Luna 收支账本部署到指定远端，并用真实的
Docker Compose 运行环境验证它从首次启动到登录、打开账本、离线使用、同步入口
和重启恢复都可用。用户不应需要理解 MinIO、SQLite、容器内部网络或本地 profile
实现；界面应保持安静、清楚、可恢复，常用记账路径不能被基础设施状态打断。

## Background and confirmed facts

- 目标主机是 `wkyuu@192.168.9.3`，已确认 SSH key 登录成功；目标为 Debian 12，
  Docker Engine 20.10.24 和 Docker Compose 1.29.2 可用。
- 目标机现有容器和服务较多，`18080`/`18081` 在探测时为空；本任务不能重启、删除
  或重新配置现有服务。
- `compose.yaml` 已定义 `instance-init`、内部 MinIO、SQLite 控制面 API 和 Nginx
  Web 四层；数据边界是临时部署目录下的 `data/`，Web 默认只绑定回环地址。
- Web 使用 SQLite-WASM/OPFS 保存本地账本，服务端只保存账户、授权、版本元数据和
  加密对象；服务端不得接收财务明文。
- 工作区已经包含一轮本地可用性修复：稳定复用 Web profile catalog、合并并发
  `profiles()` 读取、让直接同步刷新 presentation、修正启动 profile picker 条件，
  并等待配置同步开关提交后再断言。部署任务必须验证这些行为，而不是回退为只看
  HTTP 200 的演示。

## Requirements

### R1. 可控、隔离的远端部署

- 只上传 Docker 构建所需的最小源码集合；不得上传依赖目录、测试产物、Trellis
  元数据、`.env`、密钥或其他无关本地文件。
- 使用唯一 Compose project name 和 `/tmp/luna-remote-deploy.jzhnoM` 下的临时
  工作目录；默认绑定 `127.0.0.1:18080`，不擅自开放公网端口、防火墙或 TLS。
- 兼容目标机实际可用的 `docker-compose` 1.29.2；验证配置后再构建和启动，失败时
  停在诊断状态，不触碰目标机现有项目。

### R2. 首次启动和服务生命周期简单可靠

- 空数据目录能自动初始化，`instance-init`、MinIO、API、Web 按健康依赖顺序进入
  可用状态；初始化失败必须显式失败，不能显示成空账本。
- Web、API 的健康检查、readiness、元数据接口和 SPA 深链接可从部署结果验证。
- 停止并重新启动 API/MinIO 后，安装身份、SQLite 控制面和对象存储仍保持一致；
  不使用 `down -v` 或删除持久数据来“修复”启动。

### R3. 用户主流程可验证

- 创建仅用于验收的临时管理员账号，验证登录/session 与 Web 到 API 的同源请求；
  账号密码不得进入聊天、仓库或日志。
- 登录后能进入账本、查看空状态并完成一条本地记账路径；断开网络后仍能打开本地
  Web shell 和使用本地账本，恢复网络后同步入口状态可解释、可重试。
- 服务器 UI 不暴露 MinIO endpoint、bucket、access key、数据库路径或内部服务名。

### R4. Web 体验保持“能用、好用、无感”

- 首次启动选择器只在 active profile 缺失或仍为空时出现；普通刷新不会仅因存在多个
  本地副本而重复询问。
- profile 目录读取是稳定的 presentation read，不因顶栏和账户面板并发读取而产生
  SQLite-WASM worker 竞争、写入或卡死。
- 同步完成、离线、待处理、失败/冲突等状态必须可见且可恢复；重复点击不能启动重复
  操作，离线记账不得因为服务端失败回滚。
- 在桌面和约 375px 窄屏下保持主要表单、导航、焦点顺序、键盘操作和错误提示可用；
  不引入与现有设计系统冲突的新视觉体系。

### R5. 隐私和运行安全

- 保留 COOP/COEP、CSP、禁止 iframe、no-store API 等现有安全头，并确保远端部署验证
  不把 Authorization、密码、密文正文或内部凭据写入可见日志。
- 远端运行容器继续使用非 root、只读根文件系统、cap drop、no-new-privileges 和
  受限 tmpfs；不为方便测试而削弱这些边界。

### R6. 证据化交付

- 完成针对本次改动的本地 typecheck、unit/server/contract/sync 测试、Web 构建和
  production Web smoke；记录真实命令及结果。
- 完成远端 Compose config/build/start、健康检查、API/SPA HTTP smoke、重启持久性
  检查和通过 SSH tunnel 的浏览器 smoke；保留远端临时路径与可复查的 Compose project
  名称。
- 发现产品代码问题时，只做能直接改善上述主流程的最小修复，并补回归测试和必要的
  Trellis spec；不把 Android 实现混入本任务。

## Acceptance Criteria

- [x] AC1：最小上传清单可复查，上传内容不含 `.env`、密钥、依赖、Trellis 或测试
  产物；现有远端容器、端口和持久目录无变化。
- [x] AC2：唯一 Compose project 构建成功；四个服务按依赖启动，`docker-compose ps`
  显示 API/Web healthy，失败日志可定位且无秘密泄露。
- [x] AC3：远端回环端口的 `/healthz`、`/readyz`、`/api/v1/meta` 和根页面成功；响应
  包含预期安全头，SPA 深链接不返回错误页面。
- [x] AC4：临时账号可以完成登录/session 验证，Web 能打开账本并完成一条本地记录；
  生产浏览器验证覆盖桌面、窄屏、离线 shell/深链接和刷新恢复。
- [x] AC5：断开/恢复服务后，本地-first 行为、同步状态和重试路径符合既有 ledger-sync
  契约；profile picker 不误弹，并发 profile 读取无 worker 竞争回归。
- [x] AC6：API/MinIO 重启前后 `instanceId` 与数据状态一致，未使用破坏性 volume 清理；
  远端部署可用 SSH tunnel 访问，公网暴露和 Android 明确保持未实施状态。
- [x] AC7：本地质量门禁与本次远端/浏览器证据全部记录在任务研究或执行记录中；最终
  规划获用户批准后才启动实现，完成后更新 spec、归档任务并给出停止/重启/回滚说明。

## Out of scope

- Android UI、APK 发布、Android 后台同步或 WebView 专项适配；这些属于后续阶段。
- 公网反向代理、DNS、防火墙、证书签发、外部 HTTPS 暴露和多用户正式运营配置。
- 将服务端改成明文财务 CRUD、替换已批准的本地 ledger profile 模型，或增加与首次
  记账无关的新业务功能。
- 清理远端临时目录、删除现有服务或重置已有数据；用户已允许临时路径保留。

## Key decisions and risks

- 本轮部署选择“隔离临时目录 + 回环端口 + SSH tunnel”作为最小可用交付边界；这样能
  真实验证 Web，而不把公网安全、证书和反向代理决策混入本次任务。
- 远端只有 Compose v1，文档主入口虽写 Compose v2，执行时以目标机实际二进制为准并
  记录兼容结果；若 Compose 语义或镜像拉取无法满足要求，保留失败证据，不绕过安全
  边界。
- 临时管理员只用于验收；凭据通过一次性受保护输入使用，报告中只记录账号是否成功，
  不记录密码。

## Open questions

无阻塞问题。公网 HTTPS 和 Android 已明确延期，不影响本轮 Web-first 部署验收。
