# Luna 项目主线

更新日期：2026-09-13。用户已明确授权将本次改版写入项目主线。

## 推进方式与状态

- 推进方式：guided；用户已明确恢复实施，本次进入串行交付。
- 本记录确认产品方向和计划入口；此前用户指令授权启动任务并编码，不授权提交、部署或归档。2026-09-13 用户已明确授权提交当前本地进度，并要求后续优先前端与体验；部署、跨端联动、真实同步及其验收后置。
- 当前主线事项：Luna 记账体验、统计搜索与加密图片附件改版。
- 状态：实施中；任务状态已切换为 `in_progress`，不代表功能已交付。
- 本记录不推定其他任务的优先级、完成状态或执行顺序。

## 目标与已确认范围

做一款清爽、离线可用、适合每天使用的个人记账工具。参考用户熟悉的鲨鱼记账操作习惯，保留 Luna 品牌及现有业务能力。

- 手机四项页面导航与底部中央记账动作；分类网格、加减计算键盘、清楚的明细及草稿保护；列表文案按商户→备注→分类降级并保持窄屏紧凑。
- 周／月／年统计、趋势与分类图表、最大支出排行；独立预算及完整管理入口。
- 普通文本和简单正则搜索，金额上下限、多选分类及组合筛选。
- 图片离线保存与预览，纳入完整加密备份、恢复和 HTTP／S3 跨设备同步。
- 沿用 React／TypeScript、TanStack Router／Query、Tailwind、Radix／Lucide，以及 Electron／Capacitor 宿主；不采用 Flutter。

## 计划入口与权威边界

主任务：[luna-ui-redesign](tasks/09-12-luna-ui-redesign/task.json)。详细契约只在任务目录维护，主线不复制协议或验收正文。

| 文档 | 用途 |
| --- | --- |
| [接管指南](tasks/09-12-luna-ui-redesign/handoff-luna-ui.md) | 后续模型首先阅读，了解授权、工作区基线和下一步 |
| [PRD](tasks/09-12-luna-ui-redesign/prd.md) | 范围、需求编号与设计默认值 |
| [设计](tasks/09-12-luna-ui-redesign/design.md) | 交互、导航、路由及查询统计规则 |
| [附件契约](tasks/09-12-luna-ui-redesign/attachment-contract.md) | 存储、加密、同步、版本迁移和完整备份 |
| [实施计划](tasks/09-12-luna-ui-redesign/implement.md) | 文件范围、阶段依赖、出口检查和回退要求 |
| [验收标准](tasks/09-12-luna-ui-redesign/acceptance.md) | 功能、兼容性、失败场景及视觉验证 |

本任务以修订2为规划依据，替代此前仅 UI、仅月统计、不自建计算键盘、不涉及附件和协议升级的约束。规划不改写已实现能力的技术规范；对应功能实现并验证后，再更新 `.trellis/spec/` 中描述现状的规范。

## 实施依赖与既有工作

附件需要存储、宿主接口、同步协议和备份格式升级，不能作为单纯 UI 字段交付。依赖顺序按实施计划执行：P0 建立基线，P1 冻结契约及兼容样例，P2 本地附件，P3 远端与同步，P4 完整备份，P5 UI／统计／搜索，P6 集成验收。并行工作不得绕过明确的阶段依赖。

已有 [SDK HTTPS／恢复任务](tasks/09-11-repair-generated-sdk-https/task.json) 保持独立；其状态以自身任务记录和实际验证为准。实施前核对接管指南中的脏文件基线，涉及共享 SDK、schema 或恢复脚本时先辨别已有改动，不覆盖、不顺手纳入本任务。此次主线登记不宣称该任务已完成，也不授予远端或用户设备操作权限。

## 验证与下一步

已完成源码对照、附件专项研究及独立规划一致性复核；四项协议／并发问题已在书面契约中修正，上下文引用校验通过。见 [规划检查记录](tasks/09-12-luna-ui-redesign/research/planning-validation.md) 与 [独立复核](tasks/09-12-luna-ui-redesign/research/plan-review.md)。

产品实现已完成主要本地路径；类型检查、203项单测、服务端/协议/同步门禁、按目标版本 checkpoint、profile migration lease、完整服务恢复烟测、Web构建、Electron package 及桌面/窄屏 Chrome 验收结果见任务目录 [validation.md](tasks/09-12-luna-ui-redesign/validation.md)。账单已补齐按日流水、完整交易详情和移动端操作菜单，录入类型切换会保护不兼容分类，表达式阶段 Enter 只求值、图片 staging 未完成时不会提交；统计趋势桶已支持键盘明细，分类排行已支持金额/日期钻取，最大支出默认前五并可查看全部，统计日期按 locale 格式化且图表不依赖用户可见 inline style；空正则保持当前账本结果；嵌套分类、交易详情和图片查看器的 Escape 已在 Radix 捕获边界修复；同步单测新增两客户端加密附件上传→下载→重启读回闭环，并验证 graph 引用晚于对象上传；服务端附件 PUT/repair 已加入实际 body 摘要校验，HTTP CORS 暴露附件摘要与长度头并允许附件请求头；新增真实浏览器双 context 的 S3 图片对象同步回归，覆盖离线本地写入、对象先于 graph 引用、第二个独立 IDB 客户端下载/GCM 读回和 reload；账号浏览器 E2E 另覆盖真实 HTTP 图片上传、跨源摘要头读取、第二浏览器下载与刷新后解密读回；重建后的生产 Web 全量为桌面/窄屏合计 74/74 通过（排除 real server login），开发 Web 合计 68 passed、6 skipped；兼容 Node24 的 loopback 账号浏览器 E2E 桌面/窄屏 2/2 通过。Docker JDK21 APK build/export 与 Android 16 `luna-smoke` 隔离 AVD 完整 smoke 也已通过，包含离线重启、硬件返回、真实 DocumentsUI 选图、加密同步、SAF 备份和设置互操作；打包 Electron Renderer 文件入口的 chooser→规范化→IPC→本机保存→解密读回 smoke 也已通过。合成截图与 320/375/768/1440/横屏、640px CSS 等价视口的本地视觉检查已完成。标准 Electron packaged smoke 仍受当前容器 Chromium sandbox/native 启动边界阻断，Electron 原生文件对话框、真实 Android/桌面跨设备图片同步、真实部署 URL、真实浏览器 200% 缩放、辅助技术和用户视觉反馈仍未完成。规划复核与本地测试均不等于安全审计或全平台交付；任务继续保持 `in_progress`。服务端 schema v3、代际 fencing/精确孤儿回收、同 key 并发幂等串行化、v2→v1 降级阻断和完整备份 64MiB/512MiB 有界导出/导入测量的新增证据也已记录在上述验收文件中。
