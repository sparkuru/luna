# 简化移动设置导航、统计触控与首次配置：执行计划

状态：针对性实施与自动化验收完成；最终集成门禁由父任务统一执行。见 validation.md。

## 启动条件

- [ ] 获得本规划摘要之后的对应实施/研究批准，再 task.py start。
- [x] 检查工作区最新差异、读取清单内真实规范与代码。
- [x] 按 UUPM 项目要求记录任务专属设计建议；采用既有 Luna 主题，不引入无关字体/样式。

## 顺序

- [x] 以 A/B 为输入冻结入口和页头，生成 task-specific UUPM 建议并保留现有主题。
- [x] 实现手机子页标题/返回/区域切换，更新导航回归和当前项检查。
- [x] 实现等宽底栏、图表日期大控件及明细选择；补充真实尺寸与键盘断言。
- [x] 简化建账/登录呈现，加入密码显隐，检查空 workspace、会话失效和已绑定 profile。
- [ ] 对比中英文 320/375/768/1440、横屏、低动效及桌面，单列真实软键盘/辅助技术未测边界。

## 验证


```sh
./hako npm run test:web -- tests/e2e/settings-interface.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/intuitive-ledger.spec.ts tests/e2e/server-account.spec.ts tests/e2e/workspace-setup-visual-polish.spec.ts --workers=4
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

依赖 A/B 的入口、页头和状态边界；串行修改 shell/styles，不能覆盖前两批。

不更换设计系统，不新增远程字体，不重做 Android/Electron 外壳，不改变统计计算口径或账号同步权限。

提交与归档在实际交付验证后处理，本轮不执行。
