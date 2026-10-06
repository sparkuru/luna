# 2026-10-06 整理验收

当前范围更新：用户澄清主要对象为 Dockerfile/Compose 后回复“可以”批准最新结构，
新增容器整理已实施，实际构建、隔离 runtime 验证与独立复核通过，task 进入 review。
下方第一轮实测保留其历史边界；新增 AC6–AC8 依据
[容器静态验证](research/container-static-validation.md)和
[容器实际验证](research/container-runtime-validation.md)及下方追加阶段结果。

用户回复“开始”后，按当时修订方案完成实施和独立复核。当时 task 进入 review，未 stage、
提交、推送、部署或归档；视觉 task 仍为 review，仅补充产物位置说明。

## 第一轮结果（历史实测）

| 标准 | 结果 |
| --- | --- |
| AC1 文档 | 根 README 15 行，保留标语、项目简介和必要入口；根 PRD、deploy README、API generation 三份说明按主题合并进六份既有规范，更新索引后移除重复正文。原文 SHA256 与 Git `edbd4dc` 对应，逐节来源/去向见[文档迁移表](research/document-migration.md)。 |
| AC2 产物 | 9 个精确映射移入 ignored `archive/2026-10-06/`。618 个文件、70 个目录，397,980,121 bytes；迁移前后哈希、权限、uid/gid、mtime_ns 全部匹配，0 个 symlink。主会话和独立 checker 均重跑验证；清单与回退方式见[产物迁移记录](research/artifact-migration.md)。 |
| AC3 引用 | 独立 checker 核对 23 份 Markdown 中的 131 条文件/章节导航；归档 HTML 资源及片段无新增断链。四条证据导航已更新，其中三条修正迁移前就失效的相对链接；默认输出脚本/配置未改。 |
| AC4 ignore | 去重 `.gradle/`、`*.egg`，补充 `/.tmp-tsx/`。16 项 ignored/6 项 allowed 路径断言通过，API generated core 和 Trellis task archive 跟踪例外保留。 |
| AC5 边界 | `git diff --check` 和 19+19 条 task context 验证通过，规范均小于 32768 bytes；业务源码、脚本、测试、Android、依赖/构建/Compose 配置及受保护 Trellis runtime 无 diff，Git index 为空。 |

## 主会话核验

实施后完整检查临时 artifact helper，并只运行其 read-only `verify` 分支；688 条目
及固定 APK/sidecar 均通过。另从 `artifacts/android/` 运行两份 sidecar 的
`sha256sum -c`，均返回 OK。`.env`、data、node_modules、.devhome、artifacts 父目录、
dist、dist-web、.vite 的大小/权限/属主/mtime 与实施前记录一致；不读取凭据内容。

原规划 artifacts/archive 因 artifacts 父目录当前用户不可写，改用既有 ignore
规则覆盖的根 archive；没有提权修改、chmod/chown 或停止运行服务。产物迁移为
同文件系统精确 rename，完整保留内容；这次整理没有释放这部分磁盘空间。

独立 checker 的两个 P3 文档问题已修复：属主只记录可证实的 nobody:nogroup，
旧预览说明改为当前 setup/lifecycle 和运行时 ready URL。详细检查与命令见
[独立复核](research/quality-check.md)。README 精简及正文归属约定已写入现有项目政策。

写入本验收、mainline 和 review 状态后，主会话重跑完整导航检查：24 份 Markdown
中的 135 条本地导航无失败，263 条 HTML 静态资源/片段没有新增缺失；task context
仍为 19+19 条并通过。再次核对保护源码/配置无 diff、index 为空，两个 task 均保持 review。

## 第一轮验证边界

第一轮是文档、ignore 和闲置产物归整，没有改产品执行路径，因此未运行应用单测、
typecheck、build、浏览器、设备或部署测试；不把这些未运行项记为通过。
静态 HTML 不执行内嵌 JS，不证明历史报告/截图仍是原冻结版本。17 个 Chromium
notice 占位链接和一个旧归档 PRD 相对引用是已记录的原有缺口，未新增断链。
闲置检查是时点观察而非 writer lock；ignored archive 不随普通 Git 提交共享。

复核分类：human-not-needed。AC1–AC5 的整理验收通过，无待实施项；提交和 task
归档仍等待用户另行授权，不影响本次整理已完成的结论。

## 容器追加阶段结果（最终）

| 标准 | 结果 |
| --- | --- |
| AC6 归属/合并 | 根保留 compose.yaml/.dockerignore；docker 下三份 Dockerfile、一个 Android adjacent ignore 和两个可选 Compose。API/bucket-init 合并共享 pinned Node base，Web/dev 与 Android 工具链各自保留。 |
| AC7 契约 | 9 份显式非秘密 Compose 配置逐字段等价，仅设计中的文件/target 变化；可选 Compose 使用显式 project-directory 保留项目身份、dotenv、context 与绝对挂载。hako、smoke、fixture、当前 spec 和恢复清单同步；Web/Android Dockerfile、MinIO Compose 字节未变。 |
| AC8 实测 | syntax/ShellCheck/shfmt/Node、root/server typecheck 通过；13 preview +3 静态容器测试通过，真实 classic/Android BuildKit context 4/4。五个 target 构建、八项恢复、五项主 Compose、MinIO 双 provider、Android assemble/apksigner/临时导出/sidecar 均通过。 |
| AC1–AC5 复核 | README 15 行、文档归属与迁移清单保留；688 条目及原 APK 内容/元数据不变，导航无新增断链，API core/task archive 跟踪边界正常。业务源码/依赖/Android 源码/受保护运行时无 diff；helper 修改仅在授权边界，23+23 context 和 diff check 通过。 |

实际构建首次发现 `**/data/` 误排除 renderer 业务源码，收窄为根 `/data/` 后重建
成功，并补真实 context 回归；独立复核另复现 Android 签名规则漏掉 src 下同类文件，
改为全源码树 deny 后回归与最终构建通过。两处问题及失败证据均记录，没有改业务源码。
详见[容器迁移](research/container-migration.md)、[实际验证](research/container-runtime-validation.md)
与[独立全范围复核](research/container-quality-check.md)。关键非秘密报告保存于
[持久结果](research/container-runtime-results.json)，原始日志/helper 留在专属 /tmp。

清理仅涉及本轮精确 image ID 对应的五个临时 tag、合成 data 和测试导出 APK；两个
独立 Compose 项目容器/网络为空。原 preview d326904e668a 一直运行，真实 .env/data、
artifacts 及原 APK/sidecar 元数据与基线一致；未全局 prune，未覆盖用户镜像或配置。

复核分类 **human-not-needed**，AC1–AC8 按已批准整理范围通过，平台边界保留：
本轮 Compose v1 二进制不可用，不声称 v1 runtime 通过；Android emulator/KVM/实机
安装交互、全量 UI、远端部署和长期运行未执行，不由构建/导出结果推定通过。
本次没有应用逻辑或设备交互变化；现有历史验收继续保留其原范围。

task 进入 review，视觉 task 仍为 review；本轮没有 stage、提交、推送、部署或 task 归档。

最终记录和清理后再验：30 份 Markdown 的 153 条导航、263 条 HTML 静态导航无新增
失效项；688 条目/原 APK verify、23+23 context、diff check 均通过，index 为空。
两个任务状态均为 review，.env/data/原 APK 元数据仍与基线一致。

## 提交授权

用户随后明确“可以提交；包括所有脏文件”，授权本次工作提交包含全部当前 Git
脏文件：目录/容器配置、规范、辅助脚本/测试、任务材料及历史证据链接更新。
前述未 stage/提交与 index 为空为整理完成时的检查快照；本次按完整候选路径显式
暂存、核对后提交，ignored 本地数据/归档/缓存保留。task 继续 review，不推送、部署
或 task 归档，已有实测与平台限制保持原范围。
