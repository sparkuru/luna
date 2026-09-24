# 跨平台交付审计与整改方向（2026-09-05）

范围：架构、数据边界、运行交付和验收。源码工作树是本次依据，历史勾选不作为当前运行证据。

| 严重程度 | 证据 / 问题 | 整改及验证 |
|---|---|---|
| high | `src/web/web-api.ts` 的 persist 吞掉异常；loadState 删除损坏数据 | 原子发布保存结果、保留原文、明确错误；配额/损坏/重试测试 |
| high | Web API 只在构造时读取 localStorage；多个标签持有旧副本 | 每次读取新状态、序列化写入；实际双标签并发回归；后续升级 IndexedDB 事务 |
| high | `getSnapshot` 等返回内部对象引用 | API 返回隔离数据；引用污染回归 |
| high | `src/web/main.ts` 无 Service Worker；只有 Vite 开发入口 | 正式构建生成完整版本缓存；正式服务器离线冷启动 Playwright |
| high | 无正式 Compose、无 Android 工程 / APK | 多阶段静态镜像与 Compose；复用 Web 的原生 Android 包，打包资产离线可启动 |
| high | `src/main/config-sync.ts` 只同步 portable settings；账本无协议 | 共享因果修订、冲突候选、墓碑、加密及条件写；双端真实 endpoint 回归 |
| medium | browser localStorage 无用户备份入口、容量小 | 事务化 IndexedDB + 保留 v1 原文迁移；版本化导出/恢复；未来 schema 拒绝覆盖 |
| medium | E2E 仅开发服务器 Chrome 与窄屏 | 正式构建及 Compose 实测，Android 独立验证；补充离线、错误、冲突、导入恢复 |
| low | 单个 vanilla renderer 较大 | 随功能拆分宿主无关模块，不为框架迁移重写已验证领域逻辑 |

保留：纯 TypeScript 领域 / 窄 API / Electron SQLite、严格整数金额与 decoder、i18n、语义控件、现有配置密文边界。当前规模不需要增加业务服务端或框架迁移。

设计顺序：先修复保存契约并部署离线 Web，再持久化迁移/备份，再共享账本同步，最后 Android 集成与完整回归。Android 与 Web 共享领域和 UI，APK 必须内置资产，不采用仅加载远端网页的壳。S3 仍是密文存储，不引入明文账本服务端。

正式 Web 使用内容摘要命名的应用缓存，仅缓存本次构建的 HTML/JS/CSS/manifest/icon；不缓存账本、凭据、同步请求。安装必须全量缓存成功；更新等待旧客户端关闭，避免强制刷新丢草稿或混合版本。localhost 可直接运行；远端或 LAN 完整离线能力需要可信 HTTPS。Compose 使用 Linux 容器，不依赖主机 Node、Bash、绝对路径或源码 bind mount。

资料核对：[Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)、[生命周期](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)、[Compose 安装平台](https://docs.docker.com/compose/install/)、[Capacitor](https://capacitorjs.com/docs)。这些仅支持技术选择，不代替当前产物实测。
