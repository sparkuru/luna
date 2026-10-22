# 核查设计

## 边界

前一轮完成只读调查，用户随后明确授权安全补丁实施、验证和提交。
仓库版本、公开修复信息和项目调用条件分别取证；不解析秘密配置、不连接已部署环境或执行漏洞利用。
数据仅来自 package.json/lock、容器与 Android 构建声明、相关调用源码和公开官方元数据。

## 证据模型

- locked-inventory.json：声明/实际锁定版本，包含 dev 与 optional 标记。
- npm-audit-all/prod.json：包级聚合及原始 GHSA；全量与 omit-dev 的差异不冒充真实服务端 SBOM。
- github-advisories.json：去重公告的日期、CVE、范围、修复字段；保留失败状态。
- npm-outdated/security-versions.json 与 platform-versions.json：更新候选的存在证据。
- research/security-review.md：版本命中、调用条件、优先级、更新批次和未覆盖项。

供应商首发与数据库入库时间分别注明。修复版本不存在、字段缺失或渠道变化时，
保留未知，不用 latest、audit fixAvailable 或隔离配置替代修复证明。

## 兼容性与取舍

实施同主版本补丁；Node 的内置库与 npm 库、Electron 与宿主 Node 分开处理。
MinIO 迁往 AIStor 涉及许可与存储边界，Forge 8 涉及打包链，均需后续明确选择。
nginx 采用报告推荐的稳定线 1.30.6-alpine3.24；Node 保留 Bookworm，JDK 保留 Noble/21，
APK export 保留 Alpine 3.23 同线。保留 MinIO digest 与现有权限边界。
传递依赖先用满足父依赖约束的更新；必要 override 按父版本范围限定，避免跨主版本覆盖。
保留已有 tar/tmp/uuid/ZIP alias；js-yaml override 升至 4.3.2，不降级 OpenAPI 生成器。
braces/sprintf-js 无已发布补丁时保留已知风险，不为 audit 清零引入未经验证的 fork。
Capacitor core/android/cli 保持配对，同步生成的 Android 配置仅保留必要差异。
开发镜像重建后用于验证，不重启原有预览或生产服务。

## 验证分层

Docker hako 执行安装和项目命令；测试只使用临时目录/合成数据。先执行类型、单元、
API/契约/同步与 Web 生产构建，再做桌面/窄屏浏览器、Electron 原生产物、APK、
API/Web/bucket-init 镜像和隔离容器布局/恢复回归。原生 Electron 重建可能切换 SQLite ABI，
测试顺序须避免同一 node_modules 同时用于宿主 Node 和 Electron 重建。
完整锁文件安装与 audit 后确认目标版本、保留跨主版本和 Electron 内置 Node 补丁缺口。
不将构建、浏览器模拟尺寸或本地容器成功称为实机/线上验收。

## 回滚

基线为 73b4384。依赖回滚需同时恢复 package.json/lock，并重新执行锁文件安装；
容器回滚恢复固定 FROM/image。升级前记录本地开发镜像 ID，保留现有运行容器；
不删除已有镜像、APK、数据或缓存。提交只含任务与更新必要路径，归档仍未授权。
