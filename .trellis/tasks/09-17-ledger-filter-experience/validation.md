# 账单筛选体验最终复核

日期：2026-09-23。使用合成账本；未接触真实财务数据或远端服务。

## 验收对照

| PRD 条目 | 证据与结论 |
| --- | --- |
| 类型、分类、文本、日期、金额、组合、计数与汇总（AC 1–2） | `tests/e2e/react-state.spec.ts` 的筛选组合用例及 `src/shared/ledger-query.test.ts`；桌面和窄屏回归通过。 |
| 分类名称、历史 fallback、类型切换保留条件（AC 3–4） | 同一浏览器用例及 15 类目录合成截图回归；既有实施记录见 `implement.md`。 |
| 输入错误、Worker 状态及恢复（AC 5、7） | 新增 Worker 构造失败、持续无响应超时两条故障注入；断言 `working`/`failed`、`role=status`/`role=alert`、旧结果保留、切回文本或清除后的恢复。非法范围及正则由现有组合用例覆盖。 |
| 清除、URL 隐私、键盘、焦点与响应式（AC 6、8） | 新增键盘用例覆盖 disclosure、搜索、模式、类型、分类、金额、日期焦点、chip 和清除；现有日期与目录回归覆盖 picker 和标签。此前实施记录包含 1440/1024/768/375/320 视觉检查。 |
| Web 顶栏与 `/luna` 路由（AC 9–10） | `react-state` 路由、月份、返回和旧路径用例通过；Nginx/Service Worker 入口已在先前实施中同步。 |
| 质量门禁（AC 11） | 本次运行命令及结果如下。 |

## 本次运行

- `./hako npm run typecheck`：通过（专项复核）。
- `./hako npm test`：214/214 通过。
- `./hako npm run web:build`：通过；依赖 `use client` 和既有 chunk 体积警告仍在。
- `./hako npm run test:web -- tests/e2e/react-state.spec.ts --project=chrome --project=chrome-narrow --workers=2`：38/38 通过，其中新增三条用例在两个视口均通过。
- 两项 UI 修改汇合后，`./hako npm run test:web` 在 198 项中 190 通过、6 跳过、2 失败；失败属于同步和账户用例在 8 worker 并行时的导航/超时问题，随后以 2 worker 单独复跑两个文件 6/6 通过。完整运行本身不记作全绿。
- `python3 ./.trellis/scripts/task.py validate 09-17-ledger-filter-experience`、`git diff --check`：通过。
- 仓库未定义 lint 脚本；先前实施记录中的 60 项专项组合未按原命令重复，但本轮另跑了上述完整开发浏览器套件。

本次复核未引入新的产品契约；`.trellis/spec/frontend/component-guidelines.md` 已记录筛选状态、分类目录、月份边界和恢复行为，故无需重复修改代码规范。

## 验证边界

原生日期控件的完整分段键盘输入、真实读屏器宣读顺序、reduced-motion 的人工视觉效果，以及 Electron/Android 打包画面未在本次复核中验证。Worker 故障注入覆盖构造失败与无响应超时，不代表所有浏览器级 Worker 异常。以上边界不作为本次 Web 筛选代码通过的证据。
