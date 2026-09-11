# 后端、账号与 OpenAPI 契约 — design

## Authoritative design

继承 [完整设计](../09-08-frontend-shadcn-migration/design.md) 第 2–6、11–12 节；父文档是契约唯一来源，本文件定义责任/依赖，不复制另一套接口。

## Boundaries

src/server/**、contracts/**、src/api-client/**、tests/server/**、tests/contracts/**。

共享 package.json/lockfile/tsconfig/shared API 由主会话安排单一写入者。实现代理不是代码库里唯一参与者，不得回退他人改动；发现边界变动先同步父设计。

## Dependency

父方案完成产品收敛，最新最终摘要获得批准。

## Trade-offs and rollback

沿用已获认可的密文后端/本地优先方案与 Luna 品牌要求。每个单元保留检查点，只回退本单元补丁；本地旧库与秘密不能加入提交。技术不确定项受父设计 A0 gate 约束，重大调整重新审核。最新最终实施摘要已获用户“明确开始实施”批准，按依赖验收后执行。
