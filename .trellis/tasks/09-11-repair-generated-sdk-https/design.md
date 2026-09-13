# 修复生成 SDK 与 `luna.majo.im` HTTPS 验收 — design

## Authoritative design

本设计承接 [prd.md](prd.md)。目标是修复可复现构建边界，并把已有公开 CA 证书用于
`luna.majo.im` 的真实 Web/Android 验收；不改变账本、加密、同步或账号协议。

## Architecture and boundaries

| 边界 | 责任 | 计划中的改动 |
| --- | --- | --- |
| SDK source boundary | OpenAPI 契约与 Hey API vendor runtime 必须从当前源码重建 | 收窄 `.gitignore` 的 `core` 规则；提交生成的 `src/api-client/generated/core/**` 及其余生成差异 |
| Web/API build | Web 镜像包含 SDK runtime；API 只按精确 Origin 放行 | 复跑 generator、build/test；更新部署示例，不改变 API 业务接口 |
| Internal deployment | Compose Web 对外只提供内部 HTTP 8080；API/MinIO 不发布主机端口 | 保留现有 `compose.yaml` 与 `deploy/nginx.conf` 的安全边界 |
| External HTTPS | 远端既有 Nginx 终止 TLS，独立路由 `luna.majo.im` 到隔离 Web upstream | 更新运维说明；实施验证时使用可回滚的远端路由，不把证书/key 放进仓库 |
| Android | Capacitor 安全 origin `https://localhost`，远端 endpoint 由用户配置 | 不添加 Network Security Config、内置 CA 或证书忽略；用系统信任链验证 `https://luna.majo.im` |

## Data flow and contracts

1. `src/server/cli/generate.ts` 从 `createApp().swagger()` 生成
   `contracts/openapi.json` 和 `src/api-client/generated/**`。它继续只把
   `client/`、`core/` vendor runtime 编译成 JS/declaration；应用自己的 SDK/types/query
   源仍保持 TypeScript 严格检查。
2. `npm run api:check` 在临时目录重新生成并按字节比较契约和全部生成目录；生成的
   `core` runtime 必须因此成为源码边界的一部分，而不是依赖远端/本机临时状态。
3. Vite 与 Dockerfile 从同一份 `src/api-client` 构建 Web/Android。Compose Web 继续在
   内部 HTTP 端口提供静态资源和 `/api/` 反代；现有 `deploy/nginx.conf` 已产生
   `COOP: same-origin`、`COEP: require-corp`、CSP、API `no-store` 和必要缓存边界。
4. 外部 Nginx 使用现有受信证书监听 `luna.majo.im`，把 `/` 与 `/api/` 同源转发到隔离
   Compose Web，并保留 `Host`、`Origin`、`Authorization`、条件写、ETag、幂等请求头及
   `X-Forwarded-Proto: https` 等代理语义。API 环境使用精确的
   `LUNA_ALLOWED_ORIGINS=https://luna.majo.im`；`LUNA_ALLOW_INSECURE_LAN=false`。
5. 浏览器和 Android 访问同一个 `https://luna.majo.im` origin。浏览器通过真实系统/浏览器
   CA 验证证书，Android WebView 通过系统 CA 验证；任何测试证书绕过只允许用于定位，不能
   进入 AC4/AC5 的通过证据。

## Repository changes and non-changes

预期修改边界：

- `.gitignore`：在保留通用 core dump 忽略的前提下，仅解除
  `src/api-client/generated/core/**` 的忽略。
- `src/server/cli/generate.ts`：若 locked generator/compiler 产生行尾空白，在生成流程内
  做确定性的文本规范化，使生成物可审查且 `git diff --check` 通过；不在生成文件上手工
  打补丁。
- `contracts/openapi.json`、`src/api-client/generated/**`：只由
  `npm run api:generate` 生成，不手工改动；具体文件数量以 generator 结果为准。
- `deploy/.env.example`、`deploy/README.md`：增加 `luna.majo.im` 的精确 origin、
  外部 Nginx 反代示例、DNS/证书私钥边界和 HTTP LAN 不具备完整离线 Web 能力的说明。
- 只有在现有回归不能表达新约束时，才为 HTTPS origin/部署配置补最小测试；不为证书
  测试引入自签名根、全局忽略或新的网络基础设施。

明确不改：`capacitor.config.ts`、Android Manifest 的证书配置、应用数据模型、同步/加密
协议、`deploy/nginx.conf` 的内部安全头和无关外部路由。远端 Nginx/DNS 不作为
源码配置提交；若为验收临时改动，必须单独记录、校验、回滚。

## Compatibility and migration

- 生成 SDK 文件是构建输入，不是用户数据；提交它们不需要迁移已有本地账本或服务端
  `data/`。生成差异必须完全来自当前 locked dependency 和当前 Swagger。
- Android 继续使用固定的 `https://localhost` 内置安全 origin；用户输入的远端服务地址
  使用已有 HTTPS 允许规则。公开 CA 证书覆盖 `luna.majo.im`，所以正式/验收 APK 不需
  应用级 CA 覆盖。
- 默认 `.env.example` 仍应适合本机回环启动；`https://luna.majo.im` 作为生产/跨设备
  覆盖示例，不能把默认本地 origin 替换成不可用的公网地址。

## Trade-offs

- 采用系统信任链而非 APK 内置 CA：与商店 APK 和任意自托管 HTTPS 兼容，避免固定 CA
  无法覆盖用户 endpoint；代价是开发板实验环境必须有真正受信的 DNS/证书入口。
- TLS 放在已有 Nginx 而非 Web 容器：私钥不进入 Compose/源码且复用现有证书；代价是
  DNS、反代上游连通性和既有 Nginx reload 成为部署前置条件。
- 不把 DNS/证书续期自动化写入本任务：避免扩大基础设施和秘密管理范围；代价是最终
  验收需要用户/运维侧先准备 `luna.majo.im` 记录和可回滚路由。

## Operational and rollback notes

- 实施前在远端只读确认 `luna.majo.im` 的 DNS、Nginx include/route、TLS certificate
  配置和到隔离 Web upstream 的网络可达性；禁止读取或打印私钥内容。
- 远端路由使用独立、可识别的 server/include；变更前保存原配置摘要，先运行
  `nginx -t` 再 reload，随后用 `curl`/浏览器/Android 验证。失败时只撤销本次新增路由
  并 reload，确认无关外部服务仍返回预期结果。
- `192.168.9.3` 的 Compose 验收使用唯一 project、端口和临时数据目录；清理时不使用
  `down -v` 触碰既有 volume。证书私钥、账号密码和 `.luna/runtime.json` 不进入日志、
  任务文件或测试报告。
