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

用户于 2026-09-24 确认继续暂停 VPS 和物理 Android 操作；本轮只保留本地验证
进度，任务维持 `in_progress`。

PRD 验收项继续保持未勾选，因为本轮没有证明完整条件。特别缺少当前源码的真实
HTTPS 同源账号/同步、物理 Android 的兼容存储与断网重启、第二台实际设备接入，
以及生产部署的权限/半初始化负例和完整人工验收。历史任务中的相关结果只能按其
实际版本和环境复用，不能替代这些剩余项。

`.trellis/spec/frontend/android-runtime.md` 和 Web host 规范已经准确记录上述兼容
路径，HTTP API 规范也已要求 `api:check` 校验生成契约；本轮没有新增代码规范。
