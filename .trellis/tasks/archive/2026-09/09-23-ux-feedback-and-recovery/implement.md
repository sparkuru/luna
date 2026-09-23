# 修正备份冲突页面语义与表单错误反馈：执行计划

状态：针对性实现与自动化验收完成，等待父任务集成门禁。详见 validation.md。

## 启动条件

- [ ] 获得本规划摘要之后的对应实施/研究批准，再 task.py start。
- [x] 检查工作区最新差异、读取清单内真实规范与代码。
- [x] 按 UUPM 项目要求记录任务专属设计建议；采用既有 Luna 主题，不引入无关字体/样式。

## 顺序

- [x] 在 A 的入口结构上增加未登录备份、冲突加载/错误/零状态与字段焦点回归。
- [x] 拆分工具页头和说明，处理冲突查询状态，不改变其数据源。
- [x] 实现字段错误映射/清理/焦点及中英文文案，保留 mutation 防重与草稿。
- [x] 验证旧备份、冲突候选、错误口令、权限和已提交刷新失败等保护仍有效。

## 验证


```sh
./hako npm run test:web -- tests/e2e/ledger-tools.spec.ts tests/e2e/react-state.spec.ts tests/e2e/settings-interface.spec.ts tests/e2e/intuitive-ledger.spec.ts tests/e2e/config-sync.spec.ts --workers=4
./hako npm run typecheck
./hako npm test
./hako npm run web:build
./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- --workers=4
git diff --check
```

涉及 host/API 时追加 contracts、server、server-sync 及对应宿主检查。

- [ ] 逐项核对 prd.md 的验收，保留实际命令/截图/状态结果，未跑项目不勾选。
- [ ] 新增可见入口/几何/焦点断言；中英文和 320/375/768/1440 验证，保留原有回归。
- [ ] 更新真实实现涉及的规范；仅设计时不把候选契约写成现行规范。

## 依赖/风险

建议在 A 完成后实施，避免同时重排 shell/tools/setup；没有 A 时须先冻结共享入口边界。

不改变备份密码安全约束、加密、冲突算法或错误返回协议；不把后端错误静默转换为成功。

提交与归档在实际交付验证后处理，本轮不执行。
