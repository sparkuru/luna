# Luna 改版实施基线

日期：2026-09-12。任务：`09-12-luna-ui-redesign`。分支：`paycheck-to-paycheck`。基线提交：`2b9534f`。

## 接管与归属

- `task.py validate .trellis/tasks/09-12-luna-ui-redesign`：通过；`implement.jsonl` 9 条、`check.jsonl` 8 条。
- `task.py start .trellis/tasks/09-12-luna-ui-redesign`：通过；任务由 `planning` 切为 `in_progress`。
- 当前工作树在接管前已有以下变化，未覆盖、未整体 stage，也未纳入本任务：`.gitignore`、`.trellis/spec/trellis-plus/index.md`、`deploy/.env.example`、`deploy/README.md`、`scripts/smoke-server-restore.mjs`、`src/server/cli/generate.ts`、`scripts/smoke-deployed-sync.ts`、`.trellis/tasks/09-11-repair-generated-sdk-https/`、`src/api-client/generated/core/`。
- 本任务新增/更新的主线状态文档和本基线记录，是本次恢复实施后的任务管理变更；产品代码尚未在基线阶段改动。

## 工具与环境

| 项目 | 结果 |
| --- | --- |
| package Node 要求 | `>=22.18.0` |
| 主机 Node/npm | Node `v20.19.2`，npm `11.19.1`；不作为产品基线执行环境 |
| 项目 wrapper | `./hako` 存在，使用 `node:22-bookworm`，`.devhome` 存在 |
| Docker | `26.1.5`；Compose `2.26.1-4` |
| 依赖 | `node_modules`、Vite、Playwright 已存在 |
| Chrome | `/usr/bin/google-chrome` |
| Android 工具 | `adb` 存在；本轮未启动 emulator/AVD，未连接用户设备 |
| 4173/4174/8080/18080 | 基线检查时均无监听 |
| Docker 权限 | 沙箱内 Docker socket 被拒绝；经项目 wrapper 的本地命令使用受控升级权限完成，未访问远端 |

## 已运行检查

以下 Node 22 检查均在项目 `./hako` wrapper 内运行：

- `./hako npm run typecheck`：通过。
- `./hako npm test`：通过，157 tests，0 failed/cancelled/skipped。
- `./hako npm run web:build`：通过；Vite 生成 Web 产物，只有依赖包 `"use client"` module-level directive 警告。
- `./hako npm run server:typecheck`：通过。
- `./hako npm run server:test`：通过，21 tests，0 failed/cancelled/skipped。
- `./hako npm run test:contracts`：通过，5 tests，0 failed/cancelled/skipped。
- `git diff --check`：通过。

浏览器基线：

- 首次在沙箱内运行 `npm run test:web -- tests/e2e/intuitive-ledger.spec.ts tests/e2e/privacy-and-web.spec.ts --project=chrome` 时，Web server 因沙箱禁止绑定 `127.0.0.1:4173` 退出（`listen EPERM`），没有执行浏览器断言。
- 在受控本地权限下重跑同一命令：9 tests 全部通过（`intuitive-ledger.spec.ts` 与 `privacy-and-web.spec.ts`，Chrome 项目）。
- 浏览器命令输出有 npm 的 `globalignorefile` 配置弃用警告；不影响本次通过结果。

## 基线结论

P0 接管门槛完成。现有能力在新功能实现前是绿色基线；之后出现的失败必须与上述既有 dirty 工作和新改动分开定位。下一步是 P1：冻结安全 DTO、v1/v2 兼容与附件/查询/统计/表达式纯函数入口及合成 fixtures。
