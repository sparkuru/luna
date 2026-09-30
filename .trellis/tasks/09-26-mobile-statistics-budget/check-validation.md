# 第二轮 checker 验证

2026-09-26。在第一轮已验证的移动布局上复核第二轮；保留此前所有
未提交修改，以 `/tmp/luna-mobile-redesign-round2-baseline.patch` 为边界。
checker只修改本轮 `budget.tsx` 和 `mobile-statistics-budget.spec.ts`，
不操作手机、APK、任务状态、提交或后端同步。

## 发现及直接修复

预算错误焦点effect原先依赖字符串error与mutation pending。同步金额
校验连续失败且文案相同时，React会合并清空/重新设置同字符串的更新，
第二次提交焦点留在保存按钮。两locale回归在修复前均实际失败于
`#budget-input` 的焦点断言；原始trace/截图保留于
`/tmp/luna-round2-focus-before`。

将错误改为每次失败创建新的 `{ message }` 状态，保留原文案与alert。
effect仍等待pending释放后才聚焦输入，不依赖snapshot刷新。回归覆盖：
两次同金额精度错误都聚焦金额；独立host预算提交触发snapshot刷新时
不抢月份控件焦点、不改草稿；随后旧heads写入失败，pending释放后
输入可用且聚焦，draft与已提交的预算/heads保留。

## 行为复核

- 紧凑趋势沿用calculateLedgerStatistics真实聚合；全部bucket仍提供
  select、前后操作和完整disclosure，未来桶有明确文字。48px选择替代
  不依赖窄日柱命中。周/月/年标签与原生input语义一致。
- 分类钻取、split金额、排序、排名和view-all保留；收入无记录显示
  空态，无虚构支出。457×999分类首项位于底栏上方。
- mobile预算月份经过shell setMonth/Router blocker；cancel保留
  月份和值，confirm进入新key；pending禁切月。背景刷新不升级编辑
  的原heads，未设预算无假progress，已设/超额按host summary显示。
- 空值仍移除预算；写成功但刷新失败关闭已保存草稿且不重放。Web
  月份控件及非mobile分支保留，未更改API、持久化或金融算法。
- 两locale与320/375/457、长金额/标题、reduced-motion、loading/
  error恢复已由本轮focused suite覆盖；真实IME/BACK及月份系统
  picker由main实机验收，不能从浏览器模拟推定通过。

## 冻结后的实际检查

| 检查 | 结果 |
| --- | --- |
| `./hako npm run typecheck` | PASS |
| `./hako npm test` | 214 passed / 0 failed |
| `./hako npm run test:web -- tests/e2e/mobile-statistics-budget.spec.ts tests/e2e/ux-query-budget.spec.ts --workers=4` | 两项目38 passed / 0 failed，40.2s |
| `./hako npm run web:build` | PASS；依赖use-client与chunk-size已有构建warning，不是失败 |
| `git diff --check` | PASS |
| 独立lint | package.json没有独立lint脚本；不伪称运行 |

实现端更早的full Web为242 passed / 8 production-only skipped /
0 failed；它发生于最终CSS和本次焦点窄修之前。最终变化已通过上面的
38 focused，并非声称最终全部源码重跑full。父任务第三轮集成继续跑
全量。先前focused 30pass/4fail来自实现端测试变量path作用域错误，
已修正，最终38覆盖并全部通过；不把该中间失败当作产品缺陷或隐藏。

## 待main集成

没有剩余已知代码缺陷。main在实机通过后同步稳定spec：state-management
预算native-path-unchanged旧句、component mobile统计/预算呈现契约。
本报告不替代当前APK的原生月份/IME/BACK或最终用户视觉评审，也不把
第一轮Electron sandbox阻断的smoke记录为运行通过。
