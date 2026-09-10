# 技术设计

## 边界与数据流

```text
本地工作区（最小 allowlist）
        │ rsync over SSH
        ▼
/tmp/luna-remote-deploy.jzhnoM
        │ docker-compose -p luna-web-deploy-*
        ├─ instance-init ──► data/.luna/{initialized,runtime.json,minio.env}
        ├─ minio ──────────► data/minio/（密文对象）
        ├─ api ────────────► data/server.sqlite（控制面元数据）
        └─ web:127.0.0.1:18080 ──► api:3000 / minio 内网
                                      ▲
                         浏览器（SSH local tunnel）
```

服务端不接收账本明文。浏览器的本地 SQLite-WASM/OPFS profile 负责明文账本；API
只处理认证、授权、版本和加密对象。远端临时目录与 Compose project 使用独立名称，
所有验证命令显式带 `-p`，避免默认 project 与其他容器发生交叉作用。

## 部署方案

1. 以 Dockerfile 的实际 `COPY` 和 `.dockerignore` allowlist 为依据传输
   `Dockerfile`、`Dockerfile.server`、compose.yaml、Node manifest/config、Web
   offline plugin、部署脚本和 `src/{server,shared,sync,api-client,renderer,web}`，不传
   `node_modules`、测试、Trellis、Android 构建物、`.env` 或凭据。
2. 在远端临时目录生成仅含非秘密绑定/路径/origin 的 `.env`，加入 SSH tunnel 端口
   的精确 origin；先运行 `docker-compose config --quiet`。
3. 运行 `docker-compose -p <unique> up --build -d`，轮询服务状态和 HTTP readiness。
   若目标机只能使用 Compose v1，保留该命令输出并避免修改仓库文档入口。
4. 通过远端回环 curl 检查 Web/API；再建立本地 `18180 → remote 18080` SSH tunnel，
   用生产 Web Playwright 测试和人工/脚本化可访问性检查验证真实浏览器路径。
5. 对 API/MinIO 做可逆的 stop/start（不删 volume、不删 data），比较重启前后的
   `/api/v1/meta` `instanceId`，然后再次检查健康和页面。

## 运行时与 UI 验证

- 健康层：Compose service health、`/healthz`、`/readyz`、`/api/v1/meta`。
- 页面层：根页面、`/setup`、`/ledger` 及 ledger 子路由响应，COOP/COEP/CSP 和
  Cache-Control 头。
- 业务层：临时账号登录、空账本/首条记录、本地提交、离线刷新、同步状态可见性。
- 回归层：启动 picker recovery 条件、稳定 catalog read、直接同步 emit、配置开关
  提交时序；全部复用现有测试和 typed `window.lunaLedger` 入口。

## 兼容、回滚与证据

- 远端只作为隔离临时实例；失败时首先停止本次 project 的容器，保留目录和日志供
  诊断，不执行全局 Docker 清理。
- 回滚优先是停掉本次 project 并恢复使用原工作区；若发现新代码回归，在本地恢复
  对应文件前先保存测试证据，不覆盖用户已有未提交改动。
- 记录 remote host、临时目录、Compose project、镜像构建结果、健康结果、重启前后
  instanceId 一致性、浏览器测试结果；所有账号密码和 `.luna` 内部凭据只留在远端
  受限文件，不出现在记录中。
