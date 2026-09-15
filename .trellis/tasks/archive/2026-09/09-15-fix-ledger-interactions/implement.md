# 账单交互修复：执行计划

状态：in_progress；已获最终规划摘要批准并进入实现阶段。

## 1. 基线与规范

- [x] 重新确认 `git status --short`、当前任务和已有 dirty 基线；保护其他 Trellis 任务记录。
- [x] 在实现前读取并遵循 frontend index、component、hook、state、quality、type-safety 和 Web host 规范。
- [x] 确认录屏 `/tmp/tmp/simplescreenrecorder-2026-09-15_09.09.40.mkv` 仅作人工视觉证据，不将真实账单写入测试或提交。

## 2. 月份 loading frame

- [x] 将 `LedgerMonthLoading` 改成与真实账单页同层级的 hero、月份控制、摘要占位和交易 panel。
- [x] 保持 `snapshotForContext` 的旧月份财务数据隔离；loading frame 不渲染旧交易、金额、计数或旧空态。
- [x] 在同一 frame 内保留 loading/error/retry 语义，去掉 shimmer 动画造成的额外闪烁，并覆盖 reduced-motion。

## 3. Web 主记账按钮

- [x] 将 `#primary-record` 移到月份控件之后，使其桌面 Web 位于月份控件正下方。
- [x] 更新 Web 桌面与窄窗口 CSS selector/宽度，保持按钮对齐、可聚焦、唯一且不遮挡内容。
- [x] 保持 native/Electron 直接收入/支出入口、Web 弹层内类型切换和既有 locator。

## 4. 新建日期

- [x] 将新建交易默认日期改为当前主机本地日期；编辑交易继续使用原日期。
- [x] 清理不再需要的日期 helper import，并确认没有改变 date 校验或保存 payload。

## 5. Regression tests

- [x] 为人为延迟月份读取增加 loading frame 稳定性与旧月份隔离回归。
- [x] 增加桌面主按钮相对月份控件的几何回归和窄屏溢出/安全区回归。
- [x] 增加本月、历史月份新建默认今天及旧交易编辑保留原日期的回归。

## 6. Validation gate

执行并记录实际结果：

```text
npm run typecheck
npm test
npm run web:build
npm run test:web -- --project=chrome tests/e2e/react-state.spec.ts tests/e2e/intuitive-ledger.spec.ts
npm run test:web
git diff --check
```

若完整 Web 或共享单测存在与本任务无关的环境失败，保留失败输出、范围和未运行边界；不得降低验收标准。

实际结果：

- `npm run typecheck`：通过。
- `npm run web:build`：通过；仅有依赖的既有 `use client` 和 chunk size 警告。
- `npm run test:web -- --project=chrome tests/e2e/react-state.spec.ts tests/e2e/intuitive-ledger.spec.ts`：22/22 通过。
- `npm run test:web -- --project=chrome-narrow tests/e2e/react-state.spec.ts tests/e2e/intuitive-ledger.spec.ts`：22/22 通过。
- `npm test`：190 项中 187 项通过；`ledger-store.test.ts`、`profile-host.test.ts`、`store.test.ts` 各因 Node 20.19.2 下 worker `SIGSEGV` 失败，未触及本任务文件。
- `npm run test:web`：74 项通过、6 项失败、2 项跳过；失败集中在 dev server 下的 offline service-worker manifest/status（Chrome 与窄屏各 2 项）及 server-account worker `SIGSEGV`（各 1 项），账单聚焦项目均通过。
- `LUNA_TEST_PRODUCTION=1 npm run test:web`：86/88 项通过、2 项失败；两项均为 `server-account.spec.ts` 的 worker `SIGSEGV`（Chrome 与窄屏各 1 项），其余 production Web 与离线测试通过。
- `git diff --check`：通过。

## 7. Review and rollback points

- [x] loading frame 完成后先检查目标月份隔离、错误重试和焦点路径。
- [x] CTA 移位后检查 Web/native DOM surface，确认没有重复按钮或旧 CSS 选择器残留。
- [x] 日期修复后检查新建/编辑 payload 和历史月份行为。
- [x] 最终逐文件检查只包含本任务实现、测试和规划记录；不覆盖父任务、SDK、部署、同步或附件改动。
