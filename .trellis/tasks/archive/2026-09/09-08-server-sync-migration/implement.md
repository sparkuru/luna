# 服务器同步与旧数据迁移 — implementation

## Entry gate

用户已明确批准实施；A/B验收通过，C宿主与界面现已完成独立审查和生产回归。发布验证继续由D执行。

## Ordered work

- [x] C1/C2 拆传输中立同步 input，接 HTTP provider 和专用认证服务。
- [x] C3/C4 加 profile/绑定/取消/切账号流程，不自动上传旧数据。
- [x] C5 两独立客户端离线竞争、重连、显式冲突与幂等重放。
- [x] C6/C7 四类原数据迁移与回退，验证图等价、取消到提交边界、秘密不入缓存。

## Validation

既有 test、web:build、test:web，加 test:server-sync 和迁移 fixtures；真实 PG+两个独立浏览器 context。

完整验收归属：AC3/AC4/AC5/AC6。以父 implement.md 定义的环境和数据隔离执行，不能将尚未新增的 scripts 当作已运行。

## Dispatch and completion

激活本子任务后再委派 trellis-implement/trellis-check，prompt 首行必须是 Active task: 本子任务路径；使用已整理 JSONL。质量检查后更新父进度和证据，人工残余门按父计划。严禁无证据宣称整个父任务完成。

## Renderer C checkpoint — 2026-09-08

Completed account/profile UI in `src/renderer/features/account.tsx` with typed dedicated host service calls (credentials never Query mutations), English/Chinese safe errors, offline profile chooser, explicit source copy/remote restore, independent ledger/preferences passwords, manual/automatic sync status, sessions/revoke/logout. Local Query keys include profile and host generation; before/after scope guards reject late old-profile reads, transitions cancel caches, and explicit discard resets original financial drafts only on profile changes. Ordinary login retains hidden drafts and revision/head tokens. Host notifications refresh all local months, handle external profile changes, and startup errors retain corrupt data with retry.

Real API browser evidence: `tests/e2e/server-account.spec.ts` uses isolated PostgreSQL accounts and a real loopback Fastify listener. Verifies no upload on login, hidden draft retention, explicit copy/discard, encrypted database bytes, independent preferences sync, second-device restore, actual device revoke/401/safe signed-out/re-login, and original local copy offline recovery. `tests/e2e/react-state.spec.ts` also covers delayed stale settings queries and category selection focus. `src/renderer/scoped-read.test.ts` verifies old scopes cannot start/publish reads across profile changes.

Validation: strict typecheck and production Web build passed; full production browser suite **68/68** (`/tmp/luna-c-final.log`), root unit suite **150/150** (`/tmp/luna-c-final-unit.log`). Delayed settings-query test reproduced a failure against pre-fix build (`/tmp/luna-settings-race-before.log`) and passes after cancelling old settings queries before publishing accepted updates. Parent inspected desktop/narrow account screenshots; modal width fits375 viewport. Host WebIDL fetch receiver, S3 target/session preservation, concurrent sync dedup and401 accepted-commit fixes belong to host/check agents and are included in this passing build. No commit/archive performed; parent independent review and release/native gates remain.
