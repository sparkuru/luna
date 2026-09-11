# React 查询路由与组件迁移 — design

## Authoritative design

继承 [完整设计](../09-08-frontend-shadcn-migration/design.md) 第 2、6、8–9 节；父文档是契约唯一来源，本文件定义责任/依赖，不复制另一套接口。

## Boundaries

src/renderer/**、src/web/index.html、src/renderer/index.html、前端 Vite/Tailwind 配置及相关 E2E。

共享 package.json/lockfile/tsconfig/shared API 由主会话安排单一写入者。实现代理不是代码库里唯一参与者，不得回退他人改动；发现边界变动先同步父设计。

## Dependency

A0 兼容性/契约原型已通过；默认执行次序在 A 完成后。不得自行并行修改 package.json/lockfile。

## Trade-offs and rollback

沿用已获认可的密文后端/本地优先方案与 Luna 品牌要求。每个单元保留检查点，只回退本单元补丁；本地旧库与秘密不能加入提交。技术不确定项受父设计 A0 gate 约束，重大调整重新审核。最新最终实施摘要已获用户“明确开始实施”批准，按依赖验收后执行。
