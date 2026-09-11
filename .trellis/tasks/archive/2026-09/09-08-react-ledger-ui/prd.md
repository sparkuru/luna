# React 查询路由与组件迁移

## Goal

用指定 React 技术栈完整替换 DOM 界面，保留现有本地记账行为。

## Requirements

继承 [父 PRD](../09-08-frontend-shadcn-migration/prd.md) 的 R1/R2/R4/R5/R9 与所有安全/兼容边界。本子任务是用户已批准实施的统一方案的一部分，按依赖验收后执行。

## In scope

责任范围：src/renderer/**、src/web/index.html、src/renderer/index.html、前端 Vite/Tailwind 配置及相关 E2E。不扩大到父任务 out-of-scope 功能；不得覆盖其他任务未提交工作。

## Acceptance criteria

- [ ] 父任务 AC2/AC7/AC9 对应证据完整，失败/边界路径与正常路径一起验证。
- [ ] 用指定 React 技术栈完整替换 DOM 界面，保留现有本地记账行为。
- [ ] 生成/运行结果与设计一致；未运行检查明确记录。

## Dependency and review status

A0 兼容性/契约原型已通过；默认执行次序在 A 完成后。不得自行并行修改 package.json/lockfile。

父任务产品基线和最新最终摘要均已获用户“明确开始实施”批准，品牌统一 Luna（R11/AC10）。本子任务遵循依赖和主会话激活状态执行，不需重复申请实施许可。技术设计及步骤见本目录 design.md/implement.md。
