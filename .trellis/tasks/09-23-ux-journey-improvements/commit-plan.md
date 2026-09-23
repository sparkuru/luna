# 已确认的提交计划

状态：2026-09-23 用户已明确批准本计划及后续验证安排。产品提交 f40f0dd 已完成；随后提交任务文档、归档六任务并记录会话。不推送、不部署。

## 1. fix: improve ledger recovery and mobile workflows

包含 A–D 产品修改、回归与规范。下列文件中保留了本轮开始前的设置/账单工作；由于共享文件和模块依赖，本计划建议将这些原有修改一并纳入，用户已明确同意。原始边界见 research/final-worktree-status.txt，全部已纳入集成验证和独立代码检查。

- `.trellis/spec/frontend/component-guidelines.md`
- `.trellis/spec/frontend/quality-guidelines.md`
- `.trellis/spec/frontend/state-management.md`
- `src/renderer/app/shell.tsx`
- `src/renderer/data/local.tsx`
- `src/renderer/features/account.tsx`
- `src/renderer/features/budget.tsx`
- `src/renderer/features/entry.tsx`
- `src/renderer/features/ledger.tsx`
- `src/renderer/features/server-i18n.ts`
- `src/renderer/features/settings-navigation.ts`
- `src/renderer/features/settings.tsx`
- `src/renderer/features/setup.tsx`
- `src/renderer/features/tools.tsx`
- `src/renderer/i18n.ts`
- `src/renderer/ledger-copy.test.ts`
- `src/renderer/ledger-copy.ts`
- `src/renderer/ledger-tools-i18n.ts`
- `src/renderer/settings-navigation.test.ts`
- `src/renderer/styles.css`
- `tests/e2e/config-sync.spec.ts`
- `tests/e2e/entry-form-polish.spec.ts`
- `tests/e2e/intuitive-ledger.spec.ts`
- `tests/e2e/ledger-tools.spec.ts`
- `tests/e2e/offline-and-storage.spec.ts`
- `tests/e2e/offline-update.spec.ts`
- `tests/e2e/privacy-and-web.spec.ts`
- `tests/e2e/react-state.spec.ts`
- `tests/e2e/router-offline.spec.ts`
- `tests/e2e/server-account.spec.ts`
- `tests/e2e/settings-interface.spec.ts`
- `tests/e2e/ux-entry-summary.spec.ts`
- `tests/e2e/ux-feedback.spec.ts`
- `tests/e2e/ux-mobile-navigation.spec.ts`
- `tests/e2e/ux-query-budget.spec.ts`
- `tests/e2e/workspace-setup-visual-polish.spec.ts`

## 2. docs: record UX tasks and session undo design

- `.trellis/tasks/09-23-ux-entry-and-summary/`
- `.trellis/tasks/09-23-ux-feedback-and-recovery/`
- `.trellis/tasks/09-23-ux-mobile-navigation/`
- `.trellis/tasks/09-23-ux-query-and-budget/`
- `.trellis/tasks/09-23-ux-delete-recovery-design/`
- `.trellis/tasks/09-23-ux-journey-improvements/`

其中 E 仅记录已确认的当前 host 会话30秒撤销设计，不包含撤销功能代码。

## 排除与后续

- 不纳入、不归档原有 `.trellis/tasks/09-18-settings-interface/`，不处理其他历史任务。
- 不纳入临时构建、浏览器报告、.devhome 或个人 .codex/.agents 文件。
- 原有产品/测试修改已在第1组明示；如用户要拆分，需先确认旧修改的提交归属。
- 用户确认范围和验证边界后，先完成工作提交，再处理本轮6个任务的归档和会话记录；不推送远端。

## 为什么需要确认

项目 .trellis/workflow.md Phase3.4要求“Present the plan once, ask for one-shot confirmation”。.trellis/spec/trellis-plus/index.md要求提交前核对未自动化的UI/设备/辅助技术风险，具体见 visual-review.md。trellis-finish-work/SKILL.md要求先提交当前任务代码再归档。因此结果先保留为可审查的工作区，不提前提交或归档。

用户确认原文：“按计划提交，接受上述后续验证安排”。
