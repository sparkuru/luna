# 后端、账号与 OpenAPI 契约

## Goal

提供可独立验证的账号、密文存储 HTTP 后端与生成 SDK。

## Requirements

继承 [父 PRD](../09-08-frontend-shadcn-migration/prd.md) 的 R1/R6/R7 与所有安全/兼容边界。本子任务是用户已批准实施的统一方案的一部分，按依赖验收后执行。

## In scope

责任范围：src/server/**、contracts/**、src/api-client/**、tests/server/**、tests/contracts/**。不扩大到父任务 out-of-scope 功能；不得覆盖其他任务未提交工作。

## Acceptance criteria

- [ ] 父任务 AC1/AC4/AC5 对应证据完整，失败/边界路径与正常路径一起验证。
- [ ] 提供可独立验证的账号、密文存储 HTTP 后端与生成 SDK。
- [ ] 生成/运行结果与设计一致；未运行检查明确记录。

## Dependency and review status

父方案完成产品收敛，最新最终摘要获得批准。

父任务产品基线和最新最终摘要均已获用户“明确开始实施”批准，品牌统一 Luna（R11/AC10）。本子任务遵循依赖和主会话激活状态执行，不需重复申请实施许可。技术设计及步骤见本目录 design.md/implement.md。
