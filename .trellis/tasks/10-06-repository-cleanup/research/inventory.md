# 2026-10-06 只读盘点

基线 Git clean；分支 `paycheck-to-paycheck`；HEAD `edbd4dc`。创建仅绑定本会话 planning task；视觉任务保持 review。

| 分类 | 路径及大小（du -sh） | 处理建议 |
| --- | --- | --- |
| 项目说明 | `readme.md` 17 bytes；`prd.md` 5852 bytes | 用户已要求 README 精简，详细内容归入现有 `.trellis` 规范 |
| 历史 UI 证据 | `captures/` 85M | 含图集、PNG/JSON、trace、诊断脚本和 `.luna-backup`；保留内容归整 |
| APK/诊断图 | `artifacts/` 11M | APK 和 sidecar 保留固定路径，四张诊断图可归类 |
| 桌面产物 | `out/` 296M | 包与 ZIP；确认闲置后可回退迁移 |
| 构建输入 | `dist/` 304K、`dist-web/` 2.6M、`.vite/` 1.7M | 被运行入口使用，默认保留 |
| 测试输出 | `playwright-report/` 560K、`test-results/` 8K | 与视觉末次测试有关，保留内容归整 |
| 临时缓存 | `.tmp-tsx/` 8K | check-ignore 未匹配目录本身；补充规则候选 |
| 开发环境 | `node_modules/` 428M、`.devhome/` 358M | 原位保留 |
| 用户状态 | `data/` 240K、`.env` | 不读取秘密内容，不修改 |
| 原生工程 | `android/` 3.4M | 保留 |
| 任务树 | `.trellis/tasks/` 7.9M | 不批量合并任务、改验收状态或归档 |

## 引用证据

- `scripts/smoke-android.ts:323` 默认读 APK；`compose.android.yaml:19`、`:63`、`:73` 固定输出；`Dockerfile.android:81` 导出 APK 与 sidecar。保留这些入口。
- `tests/e2e/mobile-ledger-redesign.spec.ts:75`、`:171`、`mobile-settings-recovery.spec.ts`、`mobile-period-header.spec.ts`、`mobile-statistics-budget.spec.ts`、`narrow-web-statistics-gutter.spec.ts:87` 写入 captures；不改测试默认路径。
- 历史 `09-26-mobile-ux-audit`、`09-26-mobile-experience-redesign`、`09-26-mobile-ledger-entry`、`09-28-entry-date-close-empty-month` 等记录引用截图/图集；需维护迁移映射及证据链接。
- `.trellis/spec/trellis-plus/index.md:12` 指根 PRD 为产品 evidence；合并时更新当前入口、保留历史来源。
- `.gitignore:344` 忽略 captures，`:87` 忽略 artifacts，`:81` 忽略 out，`:97`、`:98` 忽略测试输出；API generated core、Trellis archive 有跟踪例外。
- ignore 中 `.gradle/`、`*.egg` 重复；多语言规则本身不是删除文件依据。
- `.codex/`、`.agents/` 由用户全局 ignore 隐藏，不修改或 stage。

## 文档修订证据

用户指定 Kisara README 已完整读取，共三个短段落及入口链接，不包含长命令/配置说明。Luna 已有 backend deployment/API/sync、frontend Web/Android 与 Trellis Plus development 对应规范；采用既有归属，不新增 docs 层。`deploy/README.md` 272 行/13693 bytes，`contracts/generation.md` 60 行/3825 bytes，与现有规范重叠，应合并去重后迁入。规范目录各相关文件现为 11–26KB，实施后需继续控制 context 大小。

尚未整理文件、移动/删除材料、运行构建/测试、操作设备、提交或归档。实施前需核验精确候选闲置状态和文件完整性；本盘点不是实施验收通过。
