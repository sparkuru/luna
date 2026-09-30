# 第一轮复核

trellis-check独立复核完整本轮差异；修复停用分类名称、分类弹窗悬空
description引用、IME高度基线跨宽度变化误判。原21项dirty基线保留，
无后端/同步协议/数据模型改动。

最终：typecheck通过，214/214unit通过，focused13/13通过，全量Web
220passed/8production-only skipped/0failed（workers=4，2.8m），
git diff --check通过。首次8workers全量213pass8skip1账号长流程timeout，
隔离重跑13.4s通过；最终同scope全量中该场景14.8s通过。不通过增加
timeout或删断言掩盖失败，也不将初次失败武断归因环境。

本轮风险回归包括新旧Web布局隔离、金额计算/精度、两locale窄屏与旧vh、
隐藏摘要、单分类编辑/停用ID、附件pending、草稿/observed revision、
regex错误恢复、BACK捕获层级和IME导航。无已知未修复本轮代码问题。
真实设备和跨端结果以device-validation.md为准，不冒称Chrome事件
模拟是Android设备证据。稳定component/android spec由主代理更新。
