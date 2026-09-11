# 后端、账号与 OpenAPI 契约 — implementation

## Entry gate

父方案与最新最终摘要已获用户“明确开始实施”批准，按各子任务依赖验收和主会话激活状态执行。

## Ordered work

- [x] A0 固定版本与 SDK/CSP 原型；不连接生产数据库。
- [x] A1/A2 实现服务、迁移、账号/会话及限额。
- [x] A3/A4 实现 CAS/幂等对象 API、生成契约与真实 DB 集成测试。
- [x] A5 完成并发、越权、撤销、断线、超限检查。

## Validation

server:typecheck、server:build、server:test、api:generate、api:check、test:contracts（已由本单元新增并执行）。

完整验收归属：AC1/AC4/AC5。以父 implement.md 定义的环境和数据隔离执行，不能将尚未新增的 scripts 当作已运行。

## Dispatch and completion

激活本子任务后再委派 trellis-implement/trellis-check，prompt 首行必须是 Active task: 本子任务路径；使用已整理 JSONL。质量检查后更新父进度和证据，人工残余门按父计划。严禁无证据宣称整个父任务完成。

## Verified checkpoint

实现与独立审查完成；见 research/review.md。PostgreSQL17/17、SDK4/4、api:check、root/server typecheck、server build 通过。已有143项回归由实现代理执行通过；C/D整体与三端发布仍待验证。
