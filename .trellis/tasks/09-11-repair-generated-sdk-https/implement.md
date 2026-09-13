# 修复生成 SDK 与 `luna.majo.im` HTTPS 验收 — implementation

## Entry gate（已通过）

用户已批准本版规划，已运行 `task.py start repair-generated-sdk-https` 并完成实现。
外部 TLS 终止层的临时验证路由已按回滚边界清理；证书私钥未进入 agent 输入、仓库或容器。

## 当前暂停点（2026-09-13）

已有本地 SDK/构建进度可随本轮快照提交；部署、真实跨端联动、同步和物理设备验收不作为下一步，继续保留未完成状态。

## Ordered implementation checklist

### I. Reproducible generated SDK

- [x] 记录 `git status --short`，确认只保留用户已有改动，不覆盖无关工作。
- [x] 在 `.gitignore` 中保留通用 `core`/`core.*` dump 忽略，仅增加
  `src/api-client/generated/core/` 及其内容的显式例外。
- [x] 运行 `./hako npm ci`（或项目允许的等价容器命令），再运行
  `./hako npm run api:generate`；检查 `contracts/openapi.json`、generated client/core
  runtime 和声明文件全部位于预期路径。
- [x] 若生成器输出行尾空白，修复 `src/server/cli/generate.ts` 的统一生成流程后重新生成；
  不直接编辑 `src/api-client/generated/**`，并以 `api:check` 与 `git diff --check` 双重
  验证。
- [x] 运行 `./hako npm run api:check`，确认输出 `LUNA_API_REPRODUCIBLE`；生成文件不
  手工编辑，检查 diff 只包含当前 generator 的可解释结果。

### II. Local quality and container gates

- [x] 依次运行 `./hako npm run typecheck`、`./hako npm test`、
  `./hako npm run web:build`、`./hako npm run server:typecheck` 和
  `./hako npm run server:test`；若生成更新暴露新的非 SDK 错误，先停在证据分析，不
  通过放宽类型或删测试来消除。
- [x] 运行 `docker compose config --quiet`、Web/API 独立构建和健康检查，证明不需要
  临时远端生成步骤；按现有 deployment spec 验证 API/MinIO 端口仍是内部边界。

### III. `luna.majo.im` deployment contract

- [x] 更新 `deploy/.env.example` 和 `deploy/README.md`：默认回环示例不变，增加
  `LUNA_ALLOWED_ORIGINS=https://luna.majo.im` 的跨设备配置、`LUNA_ALLOW_INSECURE_LAN=false`
  和独立子域反代说明；说明证书私钥只留 TLS 终止层。
- [x] 在实际目标网络只读确认 `luna.majo.im` DNS、证书 SAN/有效期、Nginx 既有路由和
  到隔离 Web upstream 的连通性；若 DNS 或上游不可达，记录为前置阻断，不使用证书
  绕过参数替代。
- [~] 为当前源代码建立唯一临时 Compose project（优先复用已授权的
  `192.168.9.3` 部署测试主机），设置精确 origin，运行健康、meta、登录、账本条件写、
  API 重启持久化和第二客户端同步检查。
- [x] 在 TLS 终止主机配置/启用独立 `luna.majo.im` route（若需要远端写入，先确认
  本次实施授权）；先 `nginx -t` 后 reload。必须保留 Host/Origin/Auth/ETag/If-Match/
  If-None-Match/Idempotency-Key 等请求语义和 COOP/COEP/CSP/no-store 响应约束。
- [x] 用 `openssl s_client -verify_return_error -servername luna.majo.im`、`curl` 和
  真实浏览器确认没有证书错误；不使用 `ignoreHTTPSErrors` 作为目标 HTTPS 通过条件。

### IV. Real Web and Android release validation

- [x] 运行已生成的生产 Web 浏览器离线/SQLite-WASM/OPFS/Service Worker/窄屏/路由场景；
  目标 origin 使用 `LUNA_TEST_BASE_URL=https://luna.majo.im` 或等价的目标入口，区分
  本地 fixture 与真实部署账号/同步证据。
- [~] 构建 `compose.android.yaml` 的 `android-apk`，执行签名/清单/hash 检查；安装到
  `192.168.9.14`，配置 `https://luna.majo.im`，执行离线写入、重启恢复、物理返回键、
  草稿保持、窄屏和真实 CA 信任检查。不得以开发板系统安装 CA 或 WebView 进程证书
  忽略替代验收。
- [x] 记录 APK SHA256、Android/WebView 版本、浏览器版本、服务端镜像/Compose project、
  DNS/证书 fingerprint 和每个边界的通过/未运行状态，不记录密码、token、私钥或财务
  明文。

### V. Cleanup and handoff

- [x] 清理本次唯一标签的 Compose 容器、网络、临时数据和端口，不使用 `down -v` 清理
  既有项目；远端若是临时路由，按设计回滚并确认无关外部服务仍健康。
- [x] 运行 `git diff --check`、相关 `trellis-check` 质量门禁和 `python3 ./.trellis/scripts/task.py validate repair-generated-sdk-https`；检查生成/敏感文件边界。
- [x] 在最终摘要中分别报告本地门禁、容器、真实浏览器、物理 Android、DNS/证书、
  远端部署和清理证据；只有所有 AC 满足后才允许完成任务。

## Risky files and rollback points

- 高风险源码边界：`.gitignore`、`contracts/openapi.json`、`src/api-client/generated/**`。
  回滚只撤销本任务明确产生的生成/忽略差异，不能删除用户已有数据或覆盖其他分支改动。
- 部署文档边界：`deploy/.env.example`、`deploy/README.md`。回滚需保留默认回环行为和
  安全约束，不把实际密码/路径/证书私钥写成示例。
- 外部运行边界：`luna.majo.im` 的 DNS/Nginx route、隔离 Compose project。只回滚本次
  新增 route/project，无关外部服务和非本任务数据不可重启、删除或改写。

## 已完成的前置检查

- [x] 用户明确批准本版 Goal、范围、`luna.majo.im` 入口、证书系统信任策略和验收标准。
- [x] DNS 与 TLS 终止层的责任人/权限已明确；至少能在目标网络验证解析和 upstream reachability。
- [x] `prd.md` 无阻塞性 open question，`design.md`/`implement.md` 与真实源码路径一致。
- [x] `implement.jsonl` 与 `check.jsonl` 已填入真实 spec/research 上下文；start 后再按
  Trellis 流程委派实现与检查代理。
