# 生成 SDK：已提交源码独立复验

日期：2026-09-24；来源提交 `2c40315`。使用 `git archive HEAD` 将全部已跟踪源码
提取到 `/tmp/luna-sdk-clean.oTktqN/source`。本轮工作树另有直观记账 UI 的未提交
任务改动，归档不包含它们，也不复用主工作树的 `node_modules`。

## 已运行

1. 在独立归档中通过项目 `./hako` 执行 `npm ci`，安装锁定的 765 个包。
2. 生成前执行 `npm run api:check`，输出 `LUNA_API_REPRODUCIBLE`；随后执行
   `npm run api:generate` 和第二次 `api:check`，同样通过。
3. `diff -qr` 比对生成前后 `contracts/` 与 `src/api-client/generated/`，两处均无
   字节差异。已提交的 `src/api-client/generated/core/` 包含 16 个文件。
4. 同一独立归档运行 `typecheck`、`server:typecheck`、`web:build`，全部通过；
   `npm test` 为 214/214，`server:test` 为 26/26。

以上只证明当前**已提交** SDK 源码与本地构建门禁可复现。`npm ci` 报告四项高严重度
依赖公告，本轮未改动锁文件，也未进行依赖安全审查。

## 未覆盖

没有连接 VPS、公开 HTTPS 入口或物理 Android。AC4 的真实 HTTPS 账号/同步、AC5
的当前 APK 远端登录/同步，以及 AC6 的远端隔离部署与第二客户端验收仍保持部分
完成。隔离本地 SQLite/MinIO 恢复的当前源码证据另见
[SQLite 任务验证](../09-10-sqlite-self-hosted-sync/validation.md)，不能替代真实部署。

任务继续为 `in_progress`。`.trellis/spec/backend/http-api-guidelines.md` 已要求用
`api:check` 检查生成契约并禁止手改 SDK，本轮没有新增代码规范。
