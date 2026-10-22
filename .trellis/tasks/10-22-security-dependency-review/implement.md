# 调查执行记录与后续边界

## 第一轮调查（历史，已交付）

- [x] 加载主线、项目政策，记录干净基线和任务范围。
- [x] 读取 npm 锁定依赖、运行时/镜像、Android 构建声明及相关调用条件。
- [x] 用 hako 查询 npm audit 全量/生产集合和 outdated；不安装、不修复。
- [x] 官方公告与版本元数据交叉核查，保留 API 限流与数据差异。
- [x] 保存版本清单、漏洞优先级、候选更新和未覆盖项。
- [x] 完成任务 context/JSON、路径及范围核验，写 validation.md。
- [x] 已向用户交付调查结果；当时任务保持 planning，未 start、提交或归档。

## 第一轮调查核验（历史）

`python3 .trellis/scripts/task.py validate .trellis/tasks/10-22-security-dependency-review`；
解析全部任务 JSON/JSONL；复算 audit 数量与 GHSA 去重；`git diff --check`；
确认 package.json、package-lock.json、src/、docker/、compose.yaml、android/ 没有改动。
文档交付不需要运行产品测试；不得复用历史通过记录作为本轮测试。

## 已授权安全补丁实施（2026-10-22）

用户在阅读结果后要求更新、验证、最后提交，授权采用报告中的安全补丁建议。

- [x] 补齐适用 spec/context，start 后派发 Trellis implement：npm 与容器配置分别负责，互不改写对方文件。
- [x] npm：Capacitor/Electron/Vite/Fastify 与有补丁的同线传递依赖；锁文件可重现安装，保留既有 overrides。
- [x] 容器：Node/nginx/JDK/Alpine 版本与恢复/测试引用同步，保留 MinIO/服务/数据边界。
- [x] 重建 hako dev 镜像，记录 Node 版本；安装后运行 typecheck、server:typecheck、npm test、server:test、test:contracts、test:server-sync、api:check、server:build、web:build。
- [x] 生产 Web 相关桌面/窄屏浏览器回归；生产隔离头、API 代理与容器布局/恢复检查。
- [x] Electron package/make、默认 sandbox 与原生 SQLite 烟测；APK assemble/export/签名核验，记录设备覆盖边界。
- [x] 全量/生产 audit 对比，记录残留路径与不能由本批次修复的风险。
- [x] Trellis check 独立复核并修正，必要 spec 同步，更新 validation/主线。
- [ ] 完整候选路径检查、diff --check、显式 staging，本地提交并核验；不推送/部署/归档。

风险点：安装与 Electron ABI 重建串行；镜像构建使用临时标签/隔离项目；不清理未知产物。
验证环境不足时先排查可在授权本机完成的替代，保留精确失败，不降低通过标准。
