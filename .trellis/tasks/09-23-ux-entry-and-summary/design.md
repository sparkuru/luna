# 修复首次恢复入口与手机摘要金额遮挡：设计方案

## 推荐方案

1. 按路由先区分 setup、account、backup，再按 workspace 有无决定可用内容；不要以 workspace 存在作为 AccountPanel/恢复入口的统一门禁。检查 account.tsx:241 与 :502 的空 profile 状态，抽出必要登录/恢复子组件，禁止非空断言掩盖未建账状态。

2. 复用既有备份导入和账号 profile 恢复 API，不创建替代数据导入管线。无账本恢复页只呈现恢复任务，原有 /settings/** URL 保留。

3. 摘要采用明确的标签、金额、44px 控件布局；桌面保留既有对齐，Web 窄屏样式隔离。金额列允许合理换行/宽度退让，不能绝对定位到眼睛之下。

## 文件边界

- `src/renderer/app/shell.tsx`
- `src/renderer/features/setup.tsx`
- `src/renderer/features/account.tsx`
- `src/renderer/features/tools.tsx`
- `src/renderer/features/ledger.tsx`
- `src/renderer/styles.css`
- `src/renderer/i18n.ts`

上列是拟影响/研究边界，不是授权覆盖整个文件。实施前读取当前内容，保留其他任务差异。

## 数据流与兼容

保留离线写入、备份/同步、最初观察的 revision/heads、草稿、防重提交、中英文、现有 URL、summary-only 隐私及键盘/低动效。既有未提交设置整理属于用户基线，不可覆盖。

由现有 renderer→typed host API→本地存储/同步服务返回真实结果；不新增第二份金额/预算数据状态，不迁移 schema 或协议。保留原 URL 和 native 条件分支。

## 状态覆盖

正常、空、加载、保存中、成功、失败、禁用、取消分别验收；失败不得清空有效输入，保存成功后刷新失败不得重放写入。无 workspace/无账号等状态按本任务路径明确呈现。

## 依赖与回滚

无前置子任务；后续 B/C 依赖此任务的无账本入口结构。

按功能小批修改与回滚，不撤销前序子任务和用户修改。若发现必须改变 host/API 或财务语义，先更新设计和范围后重新评审。
