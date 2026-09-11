# 服务器同步与旧数据迁移

## Goal

将生成 HTTP SDK 接入既有加密同步，并安全迁移原数据到账号隔离 profile。

## Requirements

继承 [父 PRD](../09-08-frontend-shadcn-migration/prd.md) 的 R3/R4/R6/R7/R8 与所有安全/兼容边界。本子任务是用户已批准实施的统一方案的一部分，按依赖验收后执行。

## In scope

责任范围：src/sync/**、src/web 的 profile/storage/API、src/main 的 profile/IPC、shared API 和账号/同步 UI 集成。不扩大到父任务 out-of-scope 功能；不得覆盖其他任务未提交工作。

## Acceptance criteria

- [ ] 父任务 AC3/AC4/AC5/AC6 对应证据完整，失败/边界路径与正常路径一起验证。
- [ ] 将生成 HTTP SDK 接入既有加密同步，并安全迁移原数据到账号隔离 profile。
- [ ] 生成/运行结果与设计一致；未运行检查明确记录。

## Dependency and review status

A 的真实后端/SDK 验收通过，B 的本地 React 界面验收通过。跨层改动串行推进。

父任务产品基线和最新最终摘要均已获用户“明确开始实施”批准，品牌统一 Luna（R11/AC10）。本子任务遵循依赖和主会话激活状态执行，不需重复申请实施许可。技术设计及步骤见本目录 design.md/implement.md。
