# 三端集成与部署恢复验证 — implementation

## Entry gate

用户已明确批准实施。独立部署镜像、代理、秘密配置和恢复工具可与 B/C 并行准备；最终集成验收依赖 A/B/C 均完成独立验收。Web 生产完整验证先于桌面/Android 最终包装检查。

## Ordered work

- [x] D1/D2 打包 Web/API/DB 和代理策略，核对 secrets/版本/静态缓存。
- [x] D3 Web production 全量离线和更新回归。
- [x] D4 Electron 隔离 smoke、Android build/emulator/返回与文件能力。
- [x] D5 备份恢复演练，更新实际规范与证据。
- [ ] D6 人工实机/辅助技术审核：静态截图已由主会话审核；未运行边界见最终证据。

## Validation

既有 web:build、LUNA_TEST_PRODUCTION=1 test:web、build、make、smoke:electron、android:sync、smoke:android；新增 smoke:server-restore。命令运行环境按父 implement.md 核对。

完整验收归属：AC8/AC9 及父任务全部集成项。以父 implement.md 定义的环境和数据隔离执行，不能将尚未新增的 scripts 当作已运行。

部署基础检查点、可重放命令、实际镜像和恢复证据见 [deployment-validation.md](research/deployment-validation.md)。这些检查点不代替待 B/C 稳定后的最终 Web/原生验收。

最终稳定源产物与通过结果见 [final-validation.md](research/final-validation.md)：真实 Nginx8/8、恢复7/7、Electron 打包及 ZIP 解压 smoke、Android18项通过。人工作业边界仍明确保留，不以自动测试代替。

上述最终结果属于 2026-09-08 的 PostgreSQL 方案；后来 SQLite 自托管方案的当前源码本地证据和剩余发布验收见 [validation.md](validation.md)。不要将旧产物的通过项直接计为现版本的三端完整验收。

## Dispatch and completion

激活本子任务后再委派 trellis-implement/trellis-check，prompt 首行必须是 Active task: 本子任务路径；使用已整理 JSONL。质量检查后更新父进度和证据，人工残余门按父计划。严禁无证据宣称整个父任务完成。
