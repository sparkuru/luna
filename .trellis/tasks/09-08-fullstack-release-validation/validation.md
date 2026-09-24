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
