# 简化筛选与预算月份操作：设计方案

## 推荐方案

1. 调整 Filter disclosure 内信息顺序，用嵌套高级条件 disclosure 承载日期/金额，不重建 query state。保留 regex 模式、错误关联及 chips，搜索文本不进入 URL。

2. BudgetEditor 由 shell 传入已有 month setter，Web 复用 WebMonthPicker；先通过 dirty blocker 再导航，不直接替换当前 draft。Router 月份作为唯一来源，snapshot 与 budget heads 按新月份查询。

3. 保持用户选定月份的过滤范围，不顺带新增跨月搜索；native 继续既有原生日期/月控件。

## 文件边界

- `src/renderer/features/ledger.tsx`
- `src/renderer/features/budget.tsx`
- `src/renderer/app/shell.tsx`
- `src/renderer/styles.css`
- `src/renderer/i18n.ts`

上列是拟影响/研究边界，不是授权覆盖整个文件。实施前读取当前内容，保留其他任务差异。

## 数据流与兼容

保留离线写入、备份/同步、最初观察的 revision/heads、草稿、防重提交、中英文、现有 URL、summary-only 隐私及键盘/低动效。既有未提交设置整理属于用户基线，不可覆盖。

由现有 renderer→typed host API→本地存储/同步服务返回真实结果；不新增第二份金额/预算数据状态，不迁移 schema 或协议。保留原 URL 和 native 条件分支。

## 状态覆盖

正常、空、加载、保存中、成功、失败、禁用、取消分别验收；失败不得清空有效输入，保存成功后刷新失败不得重放写入。无 workspace/无账号等状态按本任务路径明确呈现。

## 依赖与回滚

建议在 C 后实施，复用设置/预算页面标题结构；保持 A/B/C 修改。

按功能小批修改与回滚，不撤销前序子任务和用户修改。若发现必须改变 host/API 或财务语义，先更新设计和范围后重新评审。
