# 修正备份冲突页面语义与表单错误反馈：设计方案

## 推荐方案

1. LedgerTools 根据 page 使用独立标题、帮助及状态块；sync 的连接状态不成为 backup/conflicts 的通用页头。冲突空态只在查询成功且结果为零时显示。

2. 共享设置 catalog 保留路径/分组元数据，但每个入口使用独立 help key；冲突描述按状态决定，而非始终插值一段警告。

3. 将交易表单错误建模为字段错误或表单错误，使用稳定错误码分类而非解析本地化文本；金额合法时分类失败聚焦 choose-category，通用错误聚焦 alert/恢复操作。字段变化清理其错误，不抹去其他错误。

4. 用户常规密码提示说明至少 12 字符和遗失不可找回；特殊超限单独解释，底层字符/UTF-8 校验不变。

## 文件边界

- `src/renderer/features/tools.tsx`
- `src/renderer/features/settings.tsx`
- `src/renderer/features/settings-navigation.ts`
- `src/renderer/features/entry.tsx`
- `src/renderer/features/setup.tsx`
- `src/renderer/i18n.ts`
- `src/renderer/ledger-tools-i18n.ts`
- `src/renderer/features/server-i18n.ts`

上列是拟影响/研究边界，不是授权覆盖整个文件。实施前读取当前内容，保留其他任务差异。

## 数据流与兼容

保留离线写入、备份/同步、最初观察的 revision/heads、草稿、防重提交、中英文、现有 URL、summary-only 隐私及键盘/低动效。既有未提交设置整理属于用户基线，不可覆盖。

由现有 renderer→typed host API→本地存储/同步服务返回真实结果；不新增第二份金额/预算数据状态，不迁移 schema 或协议。保留原 URL 和 native 条件分支。

## 状态覆盖

正常、空、加载、保存中、成功、失败、禁用、取消分别验收；失败不得清空有效输入，保存成功后刷新失败不得重放写入。无 workspace/无账号等状态按本任务路径明确呈现。

## 依赖与回滚

建议在 A 完成后实施，避免同时重排 shell/tools/setup；没有 A 时须先冻结共享入口边界。

按功能小批修改与回滚，不撤销前序子任务和用户修改。若发现必须改变 host/API 或财务语义，先更新设计和范围后重新评审。
