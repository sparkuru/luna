# 三端集成与部署恢复验证 — design

## Authoritative design

继承 [完整设计](../09-08-frontend-shadcn-migration/design.md) 第 8–12 节；父文档是契约唯一来源，本文件定义责任/依赖，不复制另一套接口。

## Boundaries

Docker/Compose/deploy、发布验证 scripts、跨端测试、实现后的 spec/交付文档。

共享 package.json/lockfile/tsconfig/shared API 由主会话安排单一写入者。实现代理不是代码库里唯一参与者，不得回退他人改动；发现边界变动先同步父设计。

## Dependency

部署镜像、代理和恢复工具可独立准备，不改动 C/B 的源码。最终集成验收依赖 A/B/C 全部通过；Web 生产完整验证先于桌面/Android 最终包装检查。

## Trade-offs and rollback

沿用已获认可的密文后端/本地优先方案与 Luna 品牌要求。每个单元保留检查点，只回退本单元补丁；本地旧库与秘密不能加入提交。技术不确定项受父设计 A0 gate 约束，重大调整重新审核。最新最终实施摘要已获用户“明确开始实施”批准，按依赖验收后执行。
