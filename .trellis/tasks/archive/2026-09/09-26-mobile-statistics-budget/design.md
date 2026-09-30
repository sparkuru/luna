# 第二轮设计边界

继承第一轮mobile tokens、页面title和月份控件规格。责任为budget.tsx
内Statistics/BudgetEditor、必要shell month props、styles.css mobile
统计/预算、i18n.ts标签；测试在既有统计/预算相关suite扩展。

将已有紧凑Web trend呈现可复用部分提取，原生每bucket金额仍来源同一
query；完整日列表放disclosure。图柱窄于触控标准时给48px日期select/
前后按钮作为主可访问替代，完整bucket与选择状态不丢。分类/排名默认
最多既有5项、展开全部不改，环图/排序/聚合边界保持。

预算新增mobile labelled input month及前后按钮，通过shell changeMonth
走同一Router blocker；已有BudgetEditor key保证每月draft独立，原始
budgetHeadIds仍从开始编辑观测点捕获，save pending禁切月。不是直接
set局部month或覆盖草稿。加载期不得在新月份下展示旧月值。

未设预算提供真实当月支出+设置操作，无虚假进度；已设给已用/剩余或
超额。所有显示使用existing formatter/domain结果，不通过JSX临时
生成与host不一致的新算法。WebMonthPicker/native input各自保持。

验收后更新state-management预算“native path unchanged”的旧表述，
以及component统计mobile呈现规则；只更新稳定且实测通过的合同。
