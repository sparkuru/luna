# 简化移动设置导航、统计触控与首次配置：设计方案

## 推荐方案

1. Web 窄屏子页用紧凑标题栏和单一“切换设置区域”disclosure；展开内容从现有 settingsAreaGroups 生成，避免另一份路径表。桌面保留现有分组导航。

2. 底栏按钮平分可用宽度且保留足够命中面积，不将图标宽度当按钮宽度。

3. 拟定统计方案：保留紧凑月趋势；图下增加明确日期选择控件，左右按钮不少于 44px，日期列表按需打开；已有明细列表仍可直接选任意日期。细柱只作为补充指针入口，不再把精确点柱设为唯一主操作。无需改变统计 bucket 和金额算法。

4. setup 的币种驱动精度，精度放高级选项；未提交时修改币种如何重设精度需明确显示当前值，不覆盖已提交账本。账号拆分呈现阶段而不拆分服务端状态所有权；复用 A 的无账本入口。

5. 必须在实施后同步项目组件规范中手机完整设置导航等发生变化的约定，保留 shared/native host 条件隔离。

## 文件边界

- `src/renderer/app/shell.tsx`
- `src/renderer/features/settings.tsx`
- `src/renderer/features/setup.tsx`
- `src/renderer/features/account.tsx`
- `src/renderer/features/budget.tsx`
- `src/renderer/styles.css`
- `src/renderer/i18n.ts`
- `src/renderer/features/server-i18n.ts`

上列是拟影响/研究边界，不是授权覆盖整个文件。实施前读取当前内容，保留其他任务差异。

## 数据流与兼容

保留离线写入、备份/同步、最初观察的 revision/heads、草稿、防重提交、中英文、现有 URL、summary-only 隐私及键盘/低动效。既有未提交设置整理属于用户基线，不可覆盖。

由现有 renderer→typed host API→本地存储/同步服务返回真实结果；不新增第二份金额/预算数据状态，不迁移 schema 或协议。保留原 URL 和 native 条件分支。

## 状态覆盖

正常、空、加载、保存中、成功、失败、禁用、取消分别验收；失败不得清空有效输入，保存成功后刷新失败不得重放写入。无 workspace/无账号等状态按本任务路径明确呈现。

## 依赖与回滚

依赖 A/B 的入口、页头和状态边界；串行修改 shell/styles，不能覆盖前两批。

按功能小批修改与回滚，不撤销前序子任务和用户修改。若发现必须改变 host/API 或财务语义，先更新设计和范围后重新评审。
