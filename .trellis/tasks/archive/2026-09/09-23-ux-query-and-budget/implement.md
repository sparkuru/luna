# 简化筛选与预算月份操作：执行计划

状态：实现与定向验证完成；D01–D04 证据见 validation.md。完整生产集成由主协调统一执行。

## 启动条件

- [x] 用户已批准 A–D 实施，主协调已激活 D。
- [x] 检查工作区最新差异、读取清单内真实规范与代码。
- [x] 按 UUPM 项目要求记录任务专属设计建议；采用既有 Luna 主题，不引入无关字体/样式。

## 顺序

- [x] 以 C 的子页容器为基础添加基本搜索和预算就地选月用例。
- [x] 重排筛选信息层级，保持 query owner 和异步结果状态。
- [x] 接入预算月份选择并检查 dirty blocker、快切竞态和版本 heads。
- [x] 回归无结果、非法区间、regex、分类组合、预算并发与取消导航。

## 验证


```sh
./hako npm run test:web -- tests/e2e/react-state.spec.ts tests/e2e/ledger-sync.spec.ts tests/e2e/settings-interface.spec.ts --workers=4
./hako npm run typecheck
./hako npm test
./hako npm run web:build
./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- --workers=4
git diff --check
```

涉及 host/API 时追加 contracts、server、server-sync 及对应宿主检查。

- [x] 逐项核对 prd.md 的验收，保留实际命令/截图/状态结果，未跑项目不勾选。
- [x] 新增中英文可见搜索、折叠筛选、切月与旧 heads 断言；定向套件保留窄屏、768/1440 布局回归，最终截图由主协调执行。
- [x] 更新真实实现涉及的规范；仅设计时不把候选契约写成现行规范。

## 依赖/风险

建议在 C 后实施，复用设置/预算页面标题结构；保持 A/B/C 修改。

不新增跨月查询，不改变预算数值模型，不删除高级筛选或原生日期输入能力。

提交与归档在实际交付验证后处理，本轮不执行。
