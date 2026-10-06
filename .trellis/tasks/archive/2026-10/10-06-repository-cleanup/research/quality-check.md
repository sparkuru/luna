# 2026-10-06 独立整理复核

范围：本 task 的全部 README/spec、三份来源删除、ignore、迁移清单和新导航。
审查依据为用户“开始”授权后的 PRD/design/implement、19 条 check context、完整
source specs，以及 Git `edbd4dc` 中的三份旧正文。原生注入总量截断，已直接完整
读取未注入/截断的源文件。主会话负责 task 状态、mainline 和最终 validation；
checker 没有提交、stage、task 归档、部署或再次移动产物。

## 发现与直接修复

- P3：`artifact-migration.md` 把属主解释成宿主 `root:root`，但可核验观察只支持
  本执行环境的 `nobody:nogroup 0755`。已去掉无法证明的宿主解释；
  `stat -c '%U:%G %a' artifacts` 返回 `nobody:nogroup 755`。
- P3：Web host 的旧 Signatures 仍称 `./preview.sh` 在“同一端口”直接启动，
  与本轮迁入的 root `.env`、显式 image/dependency setup、运行时 host port 说明
  不一致。已合并为开发规范的 setup/lifecycle 链接与实际 ready URL 选择，保留
  自签名证书、可信网络和非生产边界。
- 没有未修复的本次整理问题。父会话补入的精简 README/正文归属长期约定与用户
  要求一致；没有扩大产品范围或改写既有验收结论。

## AC 复核

| 标准 | 实际结果 |
| --- | --- |
| AC1 / 文档 | README 15 行，保留“不是月光族”、三宿主/离线/加密介绍和开发/许可入口，无命令 fence。三份来源已逐节对照[迁移表](document-migration.md)和目标正文；四个来源 SHA256 与 Git `edbd4dc` 匹配。删除的只限三份重复正文，Git 仍可恢复原文。 |
| AC2 / 产物 | 独立重跑 manifest verifier：9 个精确映射，688 条目，618 个普通文件、70 个目录、0 个 symlink，397,980,121 bytes；所有 target 的内容、权限、uid/gid、mtime 与 before 相同，旧来源缺失。JSON 的 recorded before/after 也逐条相同，四个 APK/sidecar 原位不变。 |
| AC3 / 导航与路径 | 本次改动和全部新 task Markdown 的文件/heading 导航全部可达；归档 HTML 的静态资源和片段无新增断链。API/包/APK/Playwright 默认输出源码、脚本、配置无 diff；[产物记录](artifact-migration.md)保留生成原路径及历史真实性限制。 |
| AC4 / 忽略 | 16 项 ignored 和 6 项 allowed 路径断言通过；`.env`、`data/`、archive、产物、报告、缓存仍忽略，`.gradle`/egg 去重保持语义。真实 generated `core/auth.gen.js`、`.d.ts` 和旧 task archive 文件由 `git ls-files` 确认跟踪；root/task archive 例外均保持。 |
| AC5 / 边界 | 完整 tracked diff 已读，仅 README/spec、ignore、task 证据导航/记录及三份来源删除；`src`、`scripts`、`tests`、Android、所有构建/依赖/Compose/包装配置、受保护 Trellis runtime 无 diff。index 无 staged paths；凭据内容未读取。context validation 与 whitespace check 通过。 |

## 实际命令与证据

从仓库根执行：

```text
python3 /tmp/luna_cleanup_artifacts.py verify --manifest .trellis/tasks/10-06-repository-cleanup/research/artifact-manifest.json
python3 /tmp/luna-cleanup-links.py
python3 /tmp/luna-cleanup-review-links.py
python3 .trellis/scripts/task.py validate .trellis/tasks/10-06-repository-cleanup
git diff --check
git diff --cached --name-only
```

- 运行前完整检查两个既有临时 helper；artifact `verify` 分支只读。HTML helper
  只更新本任务的既有链接 JSON。独立 review helper 在 `/tmp`，只检查导航并写
  本任务的[质量链接结果](quality-link-check.json)，不执行 HTML JavaScript。
- manifest schema/recorded before=after、SHA256、README 篇幅、规范大小、ignore 和
  tracking 断言使用 Python 标准库与 `git check-ignore --no-index -q`、`git ls-files`；
  检查对象及结果见上表。六份合并正文都小于 32768 bytes，最大为 Web host 27035 bytes。
- context：implement/check 各 19 条，全部通过且无大小警告。
- lint：`git diff --check` 通过；没有项目 Markdown linter 或变更业务代码。
  不把未运行的运行时 lint 记为通过。
- TypeCheck：不适用/未运行，TypeScript、生成树、依赖及 build 配置没有修改。
- Tests：逐项文件/元数据、链接/anchors、ignore/context 检查通过；未运行应用单测、
  浏览器、build/install、preview、设备或部署测试，因为整理不修改这些执行路径。

内容校正独立对照了 `deploy/backup.mjs`、三个生产 Dockerfile、`.dockerignore`、
`package.json`、当前 API generator、数据库 writer mutex、response byte limiter、
API/auth 限制源码。迁入正文采用当前停写备份拒绝边界、native exact origin、global
single-process writer mutex 和真实 Content-Length，不复用旧 per-account locks 或
单 SQLite hash 作为当前契约。恢复示例覆盖当前 Docker COPY 源树，并补齐
`tsconfig.server.json`/backup helper；只是文档静态复核，未声称运行过恢复演练。

## 保留的限制与复核分类

- HTML 262 个资源路径中 245 个有效、17 个 Chromium notice 文本占位链接此前即
  无文件；另外检查了一个同页 fragment。没有新的文件或 fragment 缺失。HTML
  内嵌 JS 未执行，不证明历史截图、trace/报告仍是原测试冻结版本。
- 旧 MVP archive 的根 PRD 导航此前因相对层级错误已失效，属于[迁移记录中的既有
  缺口](document-migration.md#导航与验证)；没有改写历史 plain-source/行号引用。
- 产物清单能证明观察到的搬移前后内容与元数据一致。闲置 probe 是时点观察，
  不是 writer lock；此限制在现有[闲置检查](artifact-idle-check.json)中明确。
  `.env`、data、开发环境和个人凭据目录留在原位置，不读取秘密；checker 不补造
  不存在的 before 数据快照。主会话另持有保护路径的前后元数据结果。
- 归整材料在 ignored root archive，不随普通 Git 提交共享；共享历史证据需另外
  携带对应归档树。回退按既有精确映射反向 rename，并先拒绝旧来源新文件覆盖。
- **human-not-needed（本次目录整理）**：范围是已授权的精简/合并文档和可回退本地
  产物迁移，内容/元数据与导航已全量验证，没有账本 schema/data migration、用户
  交互、设备行为或生产配置变更。此前 UI/设备/安全/长期部署边界保持原 task
  记录，不作为本整理新门槛，也不推定其通过。当前没有提交/归档授权。

check 完成时无剩余 mutation；主会话后续新增的 validation/mainline/task 状态由
主会话最终重查，以上通过结论只覆盖本记录时的实际检查。
