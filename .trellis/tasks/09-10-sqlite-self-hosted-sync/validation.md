# SQLite 自托管与加密同步：当前源码本地复验

日期：2026-09-24。基线 `a5011b2`，复验时工作树只有本任务的文档修订和由
`api:generate` 产生的 `contracts/openapi.json` 格式差异。所有账号、口令和账本
均为隔离测试夹具；本轮未连接 VPS、公开 HTTPS 入口或物理 Android。

## 已运行

| 检查 | 实际结果 | 证明范围 |
| --- | --- | --- |
| `docker compose config --quiet` | 通过 | 当前单 Compose 定义可解析；没有启动生产栈。 |
| `./hako npm run test:contracts` | 6/6 通过 | SDK 条件头、ETag、响应大小和取消边界。 |
| `./hako npm run test:server-sync` | 9/9 通过 | 隔离 profile、迁移、同步、取消与远端标记。 |
| `./hako npm run server:test` | 26/26 通过 | SQLite 身份控制面、CAS、幂等、授权和附件对象。 |
| `./hako npx tsx --test src/web/profile-host.test.ts src/web/web-api.test.ts` | 43/43 通过 | IndexedDB 兼容适配器的持久化、隔离、回滚与取消；不代替 Android WebView 实机证据。 |
| `./hako npm run api:check` | 初次失败：`OpenAPI differs`；按项目命令 `api:generate` 更新后通过，输出 `LUNA_API_REPRODUCIBLE` | 差异仅为 `contracts/openapi.json` 中 `version` 枚举的缩进；生成 SDK 文件没有变化。 |
| `./hako npm run typecheck`、`./hako npm run web:build` | 均通过 | 严格类型和当前生产 Web 资源可构建。 |
| `./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/server-account.spec.ts --project=chrome` | 1/1 通过 | 生产 Web 资源、两个隔离浏览器上下文、真实本地 SQLite API；对象存储是内存夹具，非真实 MinIO/HTTPS。 |
| `LUNA_RESTORE_API_IMAGE=luna-api:sqlite-sync-20260924 node scripts/smoke-server-restore.mjs` | 5/5 检查组通过 | 当前源码 API + 固定 MinIO 的新装、停止后复制完整 `data/`、恢复、两认证客户端 CAS/图合并、API 重启。 |
| `git diff --check`、`task.py validate sqlite-self-hosted-sync` | 均通过 | 差异空白和任务上下文清单。 |

隔离恢复报告在 `/tmp/luna-server-restore-OoW35b/report.json`。API 镜像 ID 为
`sha256:de68f8fbcdcb9f1e1e043be0e85a1d1b213a900c0139284fbfda39981011193f`，
MinIO 镜像 ID 为
`sha256:69b2ec208575b69597784255eec6fa6a2985ee9e1a47f4411a51f7f5fdd193a9`。
恢复脚本完成后，按 `luna.restore-run` 标签查询的容器和网络均为空。

## 产品边界与剩余验收

用户确认：普通 Web 使用 SQLite-WASM/OPFS；原生 Android 在缺少 OPFS 的旧版
WebView 上保留安全内置 origin 的 IndexedDB 兼容存储。任务 PRD、设计和实施记录已
据此修订；两条 Android 存储路径仍需分别取得安装包运行证据。

以上为本任务较早的本地复验记录。用户随后恢复 VPS 和物理 Android 验收权限；
后续跨设备合成数据证据记录在 `../09-08-fullstack-release-validation/validation.md`。

PRD 验收项继续保持未勾选，因为本轮没有证明完整条件。特别缺少当前源码的真实
HTTPS 同源账号/同步、物理 Android 的兼容存储与断网重启、第二台实际设备接入，
以及生产部署的权限/半初始化负例和完整人工验收。历史任务中的相关结果只能按其
实际版本和环境复用，不能替代这些剩余项。

`.trellis/spec/frontend/android-runtime.md` 和 Web host 规范已经准确记录上述兼容
路径，HTTP API 规范也已要求 `api:check` 校验生成契约；本轮没有新增代码规范。

## 2026-09-24 继续验收：受限 S3 凭据与启动选择

本轮只使用 `/tmp` 下独立合成数据 Compose project；没有改动 VPS、生产目录或实体
Android。`instance-init` 只创建 MinIO root 凭据，`bucket-init` 在 MinIO 可用后创建
`luna-sync` bucket 和仅能操作 `luna/*` 对象的 API key。MinIO 从受保护文件读取 root
配置；API 的 root 文件和对象目录被容器内挂载遮蔽。旧版 API=root 的 `runtime.json`
会原地升级为受限 key；重复启动校验策略并复用原 key。

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| `docker compose config --quiet`、`docker-compose config --quiet` | 通过 | 本机 Compose v2.26.1；没有 Compose v1 运行证据。 |
| 独立 Compose 首启、重启 | root 与 API key 不同；runtime SHA-256 未变；API healthy | 数据目录 `/tmp/luna-cred-smoke.Oz9jDz/data` 已于验收后删除，未连接现有栈。 |
| 容器权限/策略负例 | API 读 `minio.env` 得空文件，列 `/data/minio` 得 EACCES；受限 key 建桶及前缀外 PutObject 均为 403 | 只检查了上述权限，不代表完整渗透测试。 |
| 旧版 root runtime 升级 | 原 root 文件不变，API runtime 更换为受限 key | 用 `HEAD` 旧版 `instance-init.mjs` 在独立目录生成旧格式；测试项目已删除。 |
| `node scripts/smoke-server-restore.mjs` | 8/8 检查组通过 | 最终报告 `/tmp/luna-server-restore-Xf20fh/report.json`；包括停机全量复制、原密文/ETag、CAS、API 重启、旧 root runtime 升级、中断后孤儿 key 撤销、缺桶拒绝空仓库替换。 |
| `node tests/deploy/instance-init.test.mjs` | 5/5 通过 | 首启/复启、完成标记缺 runtime、非空数据缺初始化状态、错误文件权限、现有 SQLite 缺 runtime；负例保留原文件。 |
| `./hako npm run typecheck`、`server:typecheck`、`server:test`、`web:build` | 通过；server:test 26/26 | 当前源码类型、服务端回归和生产 Web 构建。 |
| 生产 Web `server-account.spec.ts` Chrome | 1/1 通过 | 两本地账本正常重载显示选择器，选中另一本地账本后数据隔离；其余 catalog 元数据和创建/导入未覆盖。 |
| 本轮 14 个改动文件的私钥头、常见 access token 格式扫描 | 0 命中 | 格式扫描，不替代人工秘密审查；初始化日志和 smoke 未打印生成凭据。 |

AC1 的受限凭据缺口已修复，AC7 的正常重载选择缺口已修复。AC1 仍需目标部署的
完整重启/权限负例，AC7 仍缺结构化 catalog 元数据、创建/导入入口和选择前不开账本。
PRD 十项验收继续保持未勾选；本任务维持 `in_progress`。09-08 的 HTTPS/实体设备证据
可按其真实范围复用，但那条公网临时路由已回滚，不等于可用的正式 VPS 部署。
