# 执行计划

## 0. 启动门禁

- [x] 用户批准本规划摘要；随后运行 `task.py start`，在实现前复查当前工作区 dirty
      文件并保留所有用户改动。
- [x] 读取 `trellis-before-dev` 对 backend/frontend/deployment 相关 spec 的要求，
      确认本任务只补必要回归修复。

## 1. 本地基线

- [x] 检查构建清单、`.dockerignore`、Compose 配置和 target-relevant source import。
- [x] 运行 `./hako npm run typecheck`、`server:typecheck`、unit/server/sync/contract
      tests、`api:check` 和 `web:build`。
- [x] 运行 production Web Playwright（含离线 shell、深链接、存储和更新）并确认没有
      把 dev server 的失败误判成产品失败。

## 2. 远端隔离部署

- [x] 用 `ssh -F /dev/null` 做最小身份/目录/端口探针，确认目标仍是预期主机；记录
      现有容器摘要和 18080/18081 监听状态。
- [x] 将 R1 清单 rsync 到 `/tmp/luna-remote-deploy.jzhnoM`；远端生成 `.env`，不把
      `.env` 复制回本地或任务记录。
- [x] 运行 `docker-compose -p <unique> config --quiet`，再执行 `up --build -d`；
      长任务使用可复查的 SSH session，不并行启动第二个 Compose project。
- [x] 轮询 `docker-compose ps`、health status、`/healthz`、`/readyz`、`/api/v1/meta`
      和 Web 安全头；记录失败阶段和截断日志。

## 3. 真实浏览器与业务 smoke

- [x] 建立一次性 SSH tunnel（本地端口选择空闲端口），通过远端 Web 运行现有生产
      Playwright 的最小集合：路由、离线存储、窄屏布局、更新缓存。
- [x] 用一次性管理员账号验证登录/session、空账本与首条记录；密码仅经受保护的
      交互输入使用，不写入命令行、日志或 Markdown。
- [x] 检查 profile picker、同步状态、刷新/离线恢复、无障碍焦点/键盘和响应式截图；
      若发现用户可见回归，先补最小代码/测试修复再重跑对应验证。

## 4. 持久性与安全回归

- [x] 对本次 project 的 `api`/`minio` 做 stop/start，不使用 `down -v`；比较重启前后
      `instanceId`、健康状态和页面访问。
- [x] 扫描本次 project 最近日志中是否出现密码、Authorization、S3 内部凭据或账本
      明文；只记录扫描结论，不复制敏感日志。
- [x] 确认远端未新增非本 project 容器、端口或系统服务，保留临时目录不做清理。

## 5. 完成门禁

- [x] 运行 `trellis-check` 要求的全范围质量检查，更新必要 spec/任务研究记录。
- [x] 做最终 diff、敏感文件检查和任务 acceptance audit；通过后运行 `task.py archive`
      / `trellis-finish-work` 流程，报告停止、重启、SSH tunnel 和回滚方式。

## 风险停止点

- SSH 主机指纹变化、认证失败、源文件安全上传再次被策略拒绝：立即停止并报告，不能
  通过 scp/clone/压缩或其他方式绕过。
- Compose build、初始化、health 或 readiness 失败：不重启其他项目、不删数据；收集
  本 project 的状态和最小日志后定位。
- 需要公网监听、sudo、证书、防火墙或修改 `/etc`：超出本任务默认边界，暂停并向用户
  提出一个具体决策问题。
