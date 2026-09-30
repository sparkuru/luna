# 三端集成与部署恢复验证

## Goal

形成可部署、可恢复且具备三端证据的整体交付。

## Requirements

继承 [父 PRD](../09-08-frontend-shadcn-migration/prd.md) 的 R5/R9/R10 与所有安全/兼容边界。本子任务是用户已批准实施的统一方案的一部分，按依赖验收后执行。

## In scope

责任范围：Docker/Compose/deploy、发布验证 scripts、跨端测试、实现后的 spec/交付文档。不扩大到父任务 out-of-scope 功能；不得覆盖其他任务未提交工作。

## Acceptance criteria

- [ ] 父任务 AC8/AC9 及父任务全部集成项 对应证据完整，失败/边界路径与正常路径一起验证。
- [ ] 形成可部署、可恢复且具备三端证据的整体交付。
- [ ] 生成/运行结果与设计一致；未运行检查明确记录。

## Dependency and review status

A/B/C 均完成独立验收。Web 生产完整验证先于桌面/Android 最终包装检查。

2026-09-08 的 PostgreSQL 方案已有历史三端自动化结果；现行 SQLite 自托管基线的本地复验和未完成条件见 [validation.md](validation.md)。本任务的完整验收项仍未勾选。

父任务产品基线和最新最终摘要均已获用户“明确开始实施”批准，品牌统一 Luna（R11/AC10）。本子任务遵循依赖和主会话激活状态执行，不需重复申请实施许可。技术设计及步骤见本目录 design.md/implement.md。
