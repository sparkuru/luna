# 2026-10-06 文档合并记录

范围：根 README 精简，三份重复使用说明合并进现有 `.trellis/spec/`。用户已回复
“开始”授权；未修改业务源码、脚本、依赖、部署配置、用户数据或本地 `.env`。
下表是来源与去向，不保存长期规范副本。原始正文可用 `git show edbd4dc:<path>`
完整恢复，历史任务的旧源路径/行号仍表示当时来源，不重写历史结论。

## 来源完整性

实施前与 Git `edbd4dc` 的正文一致，SHA256 如下：

| 来源 | 原 SHA256 | 处理 |
| --- | --- | --- |
| `readme.md` | `4aef91ac28eb409ad56b459e7cce0bde30e4b99b9af2be1df26b24a674d529d5` | 保留标语，扩为 15 行入口 |
| `prd.md` | `cd880e07c82f713cdb6f38fd312b9d29d60db36eadbe44ff7b80715c08ba88be` | 以下逐节合并后移除 |
| `deploy/README.md` | `b08d4d8262ad3c5f6704c7844fcce0128257056a39765025044548e2c4aaa684` | 以下逐节合并后移除 |
| `contracts/generation.md` | `0e1ca9db85e56c6986ab36938a120fd68c7c0a2c65e522057c84a3820be9e323` | 以下逐段合并后移除 |

## 根 PRD：节到节

目标链接均指当前规范。这里的行号只针对上面的原始来源版本。

| 原节/行 | 目标节 | 合并内容与处理 |
| --- | --- | --- |
| Luna / 3–7 | 根 README 项目介绍；[Web Scope/本地账本](../../../spec/frontend/web-host-and-validation.md#本地账本选择与备份)；[同步边界](../../../spec/backend/ledger-sync-guidelines.md#同步使用与边界) | 离线家庭收支定位、三宿主、原生 SQLite/OPFS Worker/native IndexedDB、密文历史而非 SQLite/明文账本均保留；产品方向继续由 mainline 承载 |
| 一条 Compose 启动自托管服务 / 9–24 | [启动与停止](../../../spec/backend/deployment-and-recovery.md#启动与停止)、[备份与恢复操作](../../../spec/backend/deployment-and-recovery.md#备份与恢复操作) | Docker/Compose、无需 PostgreSQL secret、四条启动命令、loopback 地址、完整 data 边界、down -v 规则保留；已有 `.env` 明确保留 |
| 多设备账本同步 / 26–48 | [同步使用与边界](../../../spec/backend/ledger-sync-guidelines.md#同步使用与边界) | 三项用户输入、密码职责、默认自动/手动、离线、已上传才可拉取、合并/CAS、冲突/墓碑、后台尽力与独立设置 S3 入口逐项保留，链接既有 config-sync 专项 |
| 本地账本选择与备份 / 50–63 | [本地账本选择与备份](../../../spec/frontend/web-host-and-validation.md#本地账本选择与备份) | catalog 最近使用排序、多账本隔离、登录不替换、origin 存储风险、导出/服务端副本、Linux native profile、两类备份均保留 |
| Android APK / 65–76 | Android [Signatures](../../../spec/frontend/android-runtime.md#2-signatures) | build/run、固定 APK/sidecar、内嵌 Web、设备可达 HTTPS、原生 write/close 成功边界合入已存在内容，不重复命令块 |
| 本地开发与验证 / 78–117 | 开发 [setup](../../../spec/trellis-plus/development.md#2-signatures-and-initial-setup)、[常用命令](../../../spec/trellis-plus/development.md#常用开发与验证命令)；Web [Contracts](../../../spec/frontend/web-host-and-validation.md#3-contracts)；Android [Contracts](../../../spec/frontend/android-runtime.md#3-contracts) | Node22/hako/install/tests、Web/Playwright、localhost/LAN HTTPS、证书警告、HTTP fail-closed、COOP/COEP/SAH/IDB/真实设备边界保留；preview 按当前 root `.env`、显式 image build 与实际 runtime URL，不把旧默认 4173 当所有配置固定值 |
| 服务端命令及最后一段 / 119–129 | 开发 [常用命令](../../../spec/trellis-plus/development.md#常用开发与验证命令)；部署 [管理与升级](../../../spec/backend/deployment-and-recovery.md#管理与升级)；HTTP [命令](../../../spec/backend/http-api-guidelines.md#生成与开发命令) | server build/api check、Compose reset/cleanup、single SQLite、server-only SDK/MinIO、认证 HTTP/无明文 CRUD 均保留 |

## 部署说明：节到节

| 原节 | 目标节 | 合并内容与处理 |
| --- | --- | --- |
| Luna 部署与恢复（引言） | 部署 [Scope](../../../spec/backend/deployment-and-recovery.md#1-scope--trigger) 与[启动与停止](../../../spec/backend/deployment-and-recovery.md#启动与停止) | 四服务控制面、设备密文、简单用户配置与内部 S3 边界合入现存契约 |
| 启动 | [启动与停止](../../../spec/backend/deployment-and-recovery.md#启动与停止)、[配置与跨设备 HTTPS](../../../spec/backend/deployment-and-recovery.md#配置与跨设备-https)、现存 [Contracts](../../../spec/backend/deployment-and-recovery.md#3-contracts) | 完整启动/stop/up、交互账号、无默认账号/公开注册、远端 localhost、RFC1918 例外、安全上下文/HTTP 拒绝、顺序 bootstrap、受限凭据升级、失败/有界重试保留；Compose v1 实际契约保留 |
| 配置 | [配置与跨设备 HTTPS](../../../spec/backend/deployment-and-recovery.md#配置与跨设备-https) | 所有 env 键、UID/GID、恢复路径与停机、8081 例子、精确 origin、代理条件/幂等头、状态码及 COOP/COEP 保留；origin 例子补 native `https://localhost` |
| 跨设备 HTTPS：luna.majo.im | [配置与跨设备 HTTPS](../../../spec/backend/deployment-and-recovery.md#配置与跨设备-https) 与现存 [Contracts](../../../spec/backend/deployment-and-recovery.md#3-contracts) | 公网目标域名、私网 upstream、外部 Nginx 最小模板、异机代理限制、TLS/SAN/系统信任/密钥位置、无证书绕过、DNS/连通性/有效期、独立配置检查/reload/回退、COOP/COEP/CSP/no-transform/不吞错误保留；MinIO 隐藏挂载与独立 settings 在现有 Contracts/同步说明保留 |
| data/ 是唯一服务端备份边界 | [备份与恢复操作](../../../spec/backend/deployment-and-recovery.md#备份与恢复操作) 与现存 [Contracts](../../../spec/backend/deployment-and-recovery.md#3-contracts) | data 内每个文件/目录、0600 内部秘密、元数据无财务明文、设备数据库不是服务端备份、手动未上传边界保留；树形副本收敛为完整路径列表 |
| 备份 | [备份与恢复操作](../../../spec/backend/deployment-and-recovery.md#备份与恢复操作) | 全树、停写、numeric ownership、异地敏感保存、完整性与一致性快照原则保留。旧 rsync 备份步骤与单 SQLite hash 不再作为产品入口/完整性证据，按当前 `deploy/backup.mjs` 拒绝语义校正，明确 Node/GNU cp/local Docker 前提与维护窗口 |
| 恢复到新目录 | [备份与恢复操作](../../../spec/backend/deployment-and-recovery.md#备份与恢复操作) | 新目录/project、保留原安装、数值所有权 rsync、完整 source prefix/配置复制、meta/identity、原账号/解锁/新设备/冲突/两设备合并/日志、未同步损失与会话回退风险、data path 切换保留；源清单补漏掉的 `tsconfig.server.json` 与当前 backup helper；独立 project/空闲 loopback 端口避免碰原实例 |
| 管理与升级 | [管理与升级](../../../spec/backend/deployment-and-recovery.md#管理与升级) | reset/cleanup、撤销会话而保留设备账本、cron、升级前备份/digest、stop web api/build/up、受限 runtime 升级顺序、healthy 恢复流量、失败保留/状态核查/新 project restore、不手改重置保留；cleanup 补当前 attachment orphan reconcile |
| 设备端同步边界 | [同步使用与边界](../../../spec/backend/ledger-sync-guidelines.md#同步使用与边界) 与既有 [active-session Contracts](../../../spec/backend/ledger-sync-guidelines.md#scenario-active-session-refresh-and-remote-change-notification) | 默认自动、手动、本地先提交、远端不回滚、未上传不可见、前台尽力、密文合并/CAS/冲突全部合并去重 |

## API 生成说明：段到节

原文件只有一个主标题，按其自然段记录，避免虚构原节。

| 原行 | 目标节 | 合并内容与处理 |
| --- | --- | --- |
| 3–8 | HTTP [生成与开发命令](../../../spec/backend/http-api-guidelines.md#生成与开发命令) | 不监听/内存 DB、排序 OpenAPI3.0.3、Hey0.99.0、实际 SDK/Query consumers、fresh temporary 完整树比较保留 |
| 10–17 | [生成器兼容与客户端运行时](../../../spec/backend/http-api-guidelines.md#生成器兼容与客户端运行时) | vendor client/core exactOptionalPropertyTypes 特例、JS/declarations、authored strict、可重复生成/不手改/no pre-Vite build 全部保留；补源码已有尾随空白规范化 |
| 19–28 | [生成器兼容与客户端运行时](../../../spec/backend/http-api-guidelines.md#生成器兼容与客户端运行时) | session bearer、decoded byte bound、ETag/status/CAS/idempotency/abort、parseAs text/narrow、禁 secret Query、safe metadata tags/auth callback 保留；合并当前真实 Content-Length 规则 |
| 30–35 | 现存 HTTP [Contracts](../../../spec/backend/http-api-guidelines.md#3-contracts) 与[运行时](../../../spec/backend/http-api-guidelines.md#生成器兼容与客户端运行时) | raw envelope/shared decoder/no decrypt、授权/撤销/CAS/幂等顺序、commit-before-success 保留；旧 account exclusive/shared locks 更正为当前 single-process global async writer mutex |
| 37–45 | [生成与开发命令](../../../spec/backend/http-api-guidelines.md#生成与开发命令) | Node >=22.18 与所有 server build/typecheck/migrate/admin/start/test/contract/check 命令保留，明确 cwd/TTY/build 前提 |
| 47–55 | HTTP [Contracts](../../../spec/backend/http-api-guidelines.md#3-contracts) | 每个配置键、exact origins、3000/loopback、sanitized logger/app factory、12/1MiB、4 uploads、2+8 scrypt、100 sessions/12h、IP/normalized account limits/single instance 保留 |
| 57–60 | [生成器兼容与客户端运行时](../../../spec/backend/http-api-guidelines.md#生成器兼容与客户端运行时) | 注入 seam、Compose pinned MinIO、isolated memory adapter、客户端无 S3 keys、不推定 security/device/HTTPS 验收保留 |

## 校正证据与边界

- `src/server/cli/generate.ts`、`package.json`：当前内存 DB、Hey 0.99.0、runtime 特例与
  deterministic check；`src/api-client/runtime/{client,account-queries}.ts`：decoded-byte
  bound、真 Content-Length、auth callback 与 safe cache。
- `src/server/db/database.ts`、`src/server/app.ts`、`src/server/auth.ts`：全局 writer mutex、
  授权时点、会话/KDF/上传限制；`src/server/{config,main}.ts`：默认配置和 sanitized log。
- `deploy/backup.mjs`：stopped-boundary 拒绝检查、完整树、所有权及 new destination；
  `Dockerfile`、`Dockerfile.server`、`Dockerfile.bucket-init`、`.dockerignore`：恢复源清单。
- `compose.yaml` 与现行 deployment/http spec：native exact origin 必须保留。
  `deploy/.env.example` 的旧 public-only 注释仍在源码原位；本次只修正文档，未改配置。
- 原始备份的 rsync/单 SQLite hash 与原始 API per-account locks 作为上面来源事实保留，
  不作为现行可执行安全契约复制。内容迁移不声称新运行验证或部署验收。

## 导航与验证

README 和现行 spec 入口链接已指向真实文件/目标节；frontend/backend index 更新归属。
旧三份说明没有在其他现行文档中作为 Markdown 入口引用，根 PRD 的旧 deploy 链接
随正文合并移除。历史 plain-source/line 引用保持原意。

已知此前失效项：归档 `08-30-income-expense-mvp/research/phase0-toolchain-and-validation.md`
第 48 行的 `../../../../prd.md` 在任务归档后本来就指向不存在的 `.trellis/tasks/prd.md`。
它是旧产品基线引用，不属于本次删除造成的断链；保留原文本，上述 Git 来源可核对。

本次只运行文档内容、README 行数、Markdown 本地链接/anchors、源码命令静态核对、
规范字节数与 `git diff --check`，不运行应用测试/install/preview/部署；最终迁移结果
与总体验收由主会话合并记录。本次修改的六份正文规范均低于 32768 bytes，无需拆分。

实际文档门禁：三份来源逐字匹配 Git `edbd4dc` 后才移除；README 15 行、标语保留、
无命令块；11 份本次文档的 84 个本地 Markdown 文件/anchor 链接均可达；
`git diff --check` 无输出。最大变更规范是 Web host，26860 bytes。文档迁移完成后，
已删除的仅为上述三份重复说明；原文可从指定 Git 版本恢复，未永久删除历史材料。
