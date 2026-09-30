# 第二轮实施与浏览器验证

实施者记录；独立 checker 与实机结果由主代理另行记录。保留第二轮起点
`/tmp/luna-mobile-redesign-round2-baseline.patch` 中原21项dirty和第一轮全部
改动；未修改后端、聚合/domain、API/schema、任务状态、spec或手机数据。

## 实施范围

- `src/renderer/features/budget.tsx`：显式 mobile presentation。统计默认
  总额/紧凑真实趋势/分类/大额，复用现有 bucket 聚合与 Web plot，不默认
  铺30行日明细；原 bucket 列表放 disclosure，48px select/前后按钮仍能
  访问所有日期及未来 bucket。周/年日期标签匹配语义，移动月使用原生
  month input；收入空态明确。分类条形/环图、top5/全部、分类钻取排序与
  split金额保持原来源和口径。平均数/计数说明收进主动展开的统计说明。
- 同文件 BudgetEditor：移动页内 month/前后月复用 shell 的 changeMonth
  和 Router blocker，不另存局部月份。未设只显示真实支出和设置入口，
  已设显示已用/剩余或超额和实际进度。独立编辑区保留空值移除、原始
  observed heads、错误草稿与保存成功刷新失败不重放。开始新编辑时捕获
  用户看到的预算；已打开的编辑不会被背景刷新升级。pending 禁用月份
  控件和金额输入。Web/Electron保留原表单及月控件路径。
- `src/renderer/styles.css`：mobile 分组面、系统字体、48px控件、紧凑趋势、
  类别金额条形及预算三个状态；320px 长名称和大额重排。零值趋势柱的
  背景透明，避免空柱看似真实支出。超额 progress 的 WebKit/Moz 规则
  分开声明，最终截图显示危险语义色。
- `src/renderer/i18n.ts`：完整 en/zh-CN 预算动作/剩余/超额、周期日期与
  统计说明。未改第三轮 settings 正文。
- `tests/e2e/mobile-statistics-budget.spec.ts`：新 focused 风险回归，实际
  浏览器 host 上切换 presentation marker，不模拟为真实 Android。

无需 shell.tsx 新改动：现有 BudgetEditor 的月份 setter 和 keyed draft
已经符合新原生月份控件要求。没有新依赖、远程字体或内联 style。

## 实际验证

- `./hako npm run typecheck`：实施/新 tests 通过；最后窄屏强化断言误放
  另一循环引起 `path` 未定义，已移到正确长金额 fixture 并再次通过。
- `./hako npm test`：214/214通过。
- `./hako npm run web:build`：通过，最后两条 mobile CSS 修正后再构建
  通过。保留既有 vendor use-client/chunk-size warnings，未改打包限制。
- `./hako npm run test:web -- tests/e2e/mobile-statistics-budget.spec.ts
  tests/e2e/ux-query-budget.spec.ts tests/e2e/intuitive-ledger.spec.ts
  tests/e2e/ux-mobile-navigation.spec.ts --project=chrome --workers=4`：39/39。
- `./hako npm run test:web -- --workers=4`：242 passed、8 production-only
  skipped、0 failed，3.3m；含两浏览器项目、新11场景及原 Web月控件、加密
  sync保持原 budget precondition、旧路由/隐私/entry/附件等回归。此全量
  完成后只追加上述窄屏与 progress 色 CSS、强化测试断言。
- 最后 CSS 后两个项目 focused 34 场景：30 passed、4 failed；4项均是
  前述断言误放循环的 `ReferenceError:path`，不是产品失败。已修正且
  typecheck通过，最终 focused 由 checker 接手串行运行。不能将这一轮
  称作34全通过，也不能用此前全量覆盖 checker 后续代码。
- `git diff --check`：通过。

初次新 suite 的预算导航失败来自测试引导在修改 marker 后没有重绘
shell，点到了旧Web Settings；修复为开启/关闭真实 entry 后再导航。
随后新 suite 7通过/1失败发现 pending 禁用输入使 catch 同步 focus 无效；
改为 pending 释放后的 effect 后 focused/full通过。独立 checker 进一步
识别重复同步金额校验的同错误焦点场景，已接手 budget.tsx 与该新 test
文件窄修；实施者不并行编辑或运行 Playwright，最终结果以其报告为准。

## 浏览器视觉与状态证据

`captures/mobile-redesign-browser` 为 ignored 证据目录。目检：
`statistics-{en,zh-CN}-457.png`、`budget-unset-*-375.png`、
`budget-over-*-375.png`、`statistics-long-*-{320,375,457}.png` 与对应预算
长金额截图。最后超额图为红色 progress；320px 长类别与商户能使用整行。

457×999、三笔合成支出总计76.00的两个 locale 实测首个分类行
`bottom=810.59375`、底栏 `top=926`，见 `statistics-*-geometry.json`。
默认明细关闭，月所有日期仍可由 select/前后按钮访问；周7/year12 bucket。

fixture 覆盖分拆交易分类金额只计其 split、完整 top5/全部、按金额/日期
钻取；未设/剩余/超额/移除；dirty 取消保持月份和值，确认新月独立；
原生 month input受同一 blocker；pending disabled；保存已提交刷新失败
关闭草稿且 write count=1；第二窗口保存后等待第一页 summary 显示新的
200.00而123.45草稿保持，再保存拒绝且原 heads/输入保留；月份 query
loading/error/retry不在新月展示旧金额；两locale320/375/457、reduced-motion。

## 边界与交接

这些截图/事件是浏览器证据，不能代表 Android IME、系统月份选择器或
BACK。未操作手机、未构建/安装 APK。当前真实手机仍为主代理记录的3笔
原记录加1笔明确合成图片fixture，预算未设；实际验收交主代理。

原生验收入口：Budget `#open-budget-editor` → `#budget-input`；页内
`#previous-month`、`#month-picker[type=month]`、`#next-month`。Statistics
月 `#statistics-anchor[type=month]`；周/年切到 date，完整 bucket disclosure
`#statistics-trend-details`，替代选择器 `#statistics-bucket-select`。原
Radix entry/详情/BACK以及全部底层数据契约保持。

未重复运行已证实环境失败的 Electron smoke；最终跨端环境风险与
production offline 检查交主代理。主观设备/辅助技术评审及commit gate
仍由父集成任务管理，不提前标为任务完成。
