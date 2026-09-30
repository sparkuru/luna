# 执行与集成计划

- [x] 用户认可逐页审查的改进方向；创建父任务及三个planning子任务。
- [x] 完成最终PRD、设计、子任务执行计划和spec/research manifests。
- [x] 呈现最终方案并取得后续评审回复；此时才start第一子任务。
- [x] 第一轮mobile-ledger-entry：基础规格/导航、账单/筛选、录入/详情。
- [x] 第一轮完成检查和实机验收，建立后两轮共享移动组件/样式契约。
- [x] 第二轮mobile-statistics-budget：紧凑统计、直接切月预算及状态。
- [x] 第二轮完成检查和实机验收。
- [x] 第三轮mobile-settings-recovery：设置及所有子页、欢迎/恢复。
- [x] 第三轮完成检查及完整逐页复查，对照A01–A15闭环。
- [x] 稳定spec更新、整合差异、按项目质量/人工验收门槛提交前复核。
- [x] 用户于2026-09-30确认视觉反馈通过。
- [ ] 按项目门槛完成 Phase 3.4 exact-hunk 分组提交，再收尾/归档。

串行依赖写入各子PRD；子任务未完成不得假定可进入后续。父任务作为
总范围/集成评审载体，不向实施agent分派整仓改版。实施/check默认
Trellis角色；dispatch以`Active task: <child path>`开头，使用对应jsonl
原生context注入，缺失时child-side加载，附本轮ownership和起点diff。
共享styles.css/i18n/shell严禁并行写；checker必须审阅实际差异和证据。

每轮执行：./hako npm run typecheck、./hako npm test、./hako npm run
web:build；先 focused Playwright，再结束时全Web（含生产离线关键
路径）及三端适用检查。命令与相关用例在子任务implement.md。Electron
package/smoke用于跨端shared改动；出现环境阻断如实保留错误证据，不
声称通过或归为产品缺陷。UI视觉须实机截图目检；不是用pass计数代替。

手机只操作192.168.9.11:34971、majo.im.luna.lan、移动布局测试合成账本；
连接变化时先查用户新地址。浏览器/服务fixture使用独立合成账号，未
绑定当前手机真实服务。每轮保存APK hash、路线/截图/IME/BACK记录，
验证前后已有合成记录保留；新增测试记录独立标识。备份/附件成功路径
在可清理fixture验证，不为了截图删除或切换当前用户数据。

上一轮21条tracked变更和两个任务是起点，父任务research/baseline.txt
记录；禁止误提交/归档其他任务或撤销原改动。提交前分清继承与新增
变更；归属不明时保留并报告。需要人工视觉确认时提供具体前后对比。
