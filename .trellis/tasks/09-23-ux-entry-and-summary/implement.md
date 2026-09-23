# 修复首次恢复入口与手机摘要金额遮挡：执行计划

状态：针对性实现与自动化验收完成；等待父任务集成门禁。详细结果见 validation.md。

## 启动条件

- [ ] 获得本规划摘要之后的对应实施/研究批准，再 task.py start。
- [x] 检查工作区最新差异、读取清单内真实规范与代码。
- [x] 按 UUPM 项目要求记录任务专属设计建议；采用既有 Luna 主题，不引入无关字体/样式。

## 顺序

- [ ] 先新增从欢迎页开始的恢复/账号入口回归和隐藏/显示金额碰撞断言，确认能重现两个缺陷。
- [x] 实现无 workspace 的路径分派及三条可见入口；检查取消、错误及恢复完成后的路由和 scope 切换。
- [x] 修复摘要布局，保留金额 privacy 与 session visibility owner。
- [x] 运行恢复、账号、隐私、首次建账、直观记账用例；复核长金额和桌面布局。

## 验证


```sh
./hako npm run test:web -- tests/e2e/ledger-tools.spec.ts tests/e2e/server-account.spec.ts tests/e2e/privacy-and-web.spec.ts tests/e2e/intuitive-ledger.spec.ts tests/e2e/workspace-setup-visual-polish.spec.ts --workers=4
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

无前置子任务；后续 B/C 依赖此任务的无账本入口结构。

不新增注册服务、不改变备份格式/跨工作区合并限制、不自动上传本地账本、不扩大隐私范围。

提交与归档在实际交付验证后处理，本轮不执行。

新增入口的预修复回归已复现失败；金额碰撞采用原审计证据并新增修复后多视口几何断言。未声称执行新增几何测试的预修复 red 阶段。规范同步和最终生产/视觉门禁由主会话统一完成。
