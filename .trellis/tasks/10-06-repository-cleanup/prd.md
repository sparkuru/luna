# 整理仓库目录与冗余文件

## 目标

响应用户 2026-10-06 的“整理当前目录；将多余的各类文件，合并、规整处理一下；建 task”：减少目录散乱和重复说明，使项目入口、开发产物、历史证据各有明确位置，保持开发、测试、打包和部署行为。

## 背景

建任务前 Git clean，分支 `paycheck-to-paycheck`，HEAD `edbd4dc`。另一任务 `10-05-visual-refinement` 为 review，本任务不改变其状态。根 `readme.md` 仅有“不是月光族”，根 `prd.md` 目前主要承载使用说明。用户随后明确要求 README 足够精简，其他内容移入 `.trellis` 对应位置，并指定 `05-kisara/readme.md` 为参考；该参考已读取，采用简短介绍、开发入口及版权声明结构。截图、报告、APK 与打包产物存在固定路径和历史引用；详见 `research/inventory.md`。

文档/产物第一轮整理完成后，用户澄清主要指“各种 dockfile、compose 文件”。第一轮把容器配置排除在外，未满足这一重点；同一 task 回到 planning，增加容器配置的归整与去重。第一轮实际结果保留，不撤销已授权的 README、文档和可回退产物整理。

## 要求

- R1 文档入口：按用户要求让现有 `readme.md` 保持简短，保留“不是月光族”，只放项目定位、使用/开发入口和许可/第三方声明链接；以 Kisara README 的结构和篇幅为参考，不复制其项目事实。详细使用、部署、同步、备份、APK 和开发命令按职责合并到现有 `.trellis/spec/` 文档，产品方向保留在 mainline。根 `prd.md`、`deploy/README.md`、`contracts/generation.md` 的内容和引用全部迁移后移除重复文件；不另建 docs 或在任务 research 中保存长期规范副本。
- R2 产物归整：把确认闲置的现存截图、报告、桌面包、临时缓存按来源收纳到 ignored `archive/2026-10-06/`；保留内容、权限、符号链接和图集内部相对结构，不永久删除历史材料或加密备份。原 artifacts/archive 候选因 artifacts 属 nobody、当前用户不可写而调整，复用现有 archive 忽略边界，不提权或改目录权限。
- R3 引用与入口：记录旧→新精确路径映射，修正受影响的证据链接，只改路径不改历史结论。保留产物默认输出契约及 `artifacts/android/*.apk` 和 sidecar；容器配置路径迁移时同步修正当前调用者，不保留重复旧文件作为兼容副本。
- R4 忽略规则：去重 `.gitignore`，补充临时目录边界；保留秘密、本地数据、产物保护和 generated API core、Trellis archive 跟踪例外。
- R5 范围保护：确认候选闲置后才移动；保留用户新改动、真实数据、本地配置、依赖与正在使用的输出，不读取凭据内容，不批量 clean，不改业务代码、依赖或受保护 Trellis 运行时。允许为容器路径迁移修改构建/Compose 配置、hako 的 Dockerfile 路径、MinIO/restore smoke helper、相关测试与现行规范，不能顺带改变预览生命周期或产品协议。
- R6 容器配置归属：根目录保留生产 `compose.yaml` 和构建上下文根 `.dockerignore`；Dockerfile、专属 ignore 和可选 Android/MinIO Compose 集中到 `docker/`，根目录不再散落 Dockerfile.* 和 compose.*.yaml。
- R7 合并与契约：API 与 bucket-init 合并为同一服务端多 target Dockerfile，移除重复配置；Web/dev 和 Android 按用途保留独立构建。保持生产服务名/镜像职责、UID、端口、网络、data 挂载、内部凭据隔离、健康检查、Android/MinIO 测试隔离及开发默认行为；相对路径按实际 Compose 文件位置校正，保留项目现有旧构建器/Compose 兼容边界。
- R8 有效验证：以显式非秘密环境和隔离临时资源检查 Compose 解析/路径等价、构建上下文过滤、hako/预览回归及实际构建。服务端合并需验证临时镜像的恢复 smoke；Android/MinIO 路径需按能力验证实际入口，不修改用户数据、原 APK 或运行服务。无法执行的门禁明确保留为未验证。

## 验收标准

- AC1 / R1：根 README 约 15–20 行，无长操作步骤、配置表或命令块；标语和原文有效契约保留，详细正文归入对应 `.trellis/spec/`，入口链接可达，三份被合并文档的来源/去向有逐节记录。
- AC2 / R2、R5：迁移清单齐全，前后文件计数、哈希、权限和 symlink 匹配；未知或在用候选明确保留。
- AC3 / R3：本次迁移涉及的有效 Markdown/HTML 链接可达，图集完整；开发、APK、服务端和测试默认路径契约一致。
- AC4 / R4：敏感/临时文件仍忽略，API core 和 Trellis archive 可跟踪，没有意外暴露用户材料。
- AC5 / R5：diff 无业务代码、凭据或受保护运行时变更，容器相关辅助改动限于 R5 边界；`git diff --check` 和 context 验证通过，实际结果和保留项写入任务。
- AC6 / R6：根目录仅保留主 compose 和上下文 ignore；四份 Dockerfile 收敛为 docker 下三份，server/bucket-init 的重复定义合并，两个可选 Compose 与专属 ignore 移到对应目录。
- AC7 / R3、R7：新的 Compose 正规化结果除预期 Dockerfile/target/位置字段外与迁移前一致，绝对数据/仓库/输出挂载及服务隔离不变；调用者和现行规范无失效旧路径，恢复清单可重现新构建树。
- AC8 / R8：相关 syntax/lint/typecheck、preview helper 回归、context 过滤与生产目标构建/恢复 smoke 有实际证据，Android/MinIO 入口按可用环境验证；无用户服务或真实数据操作，未跑项不记通过。

## 不在范围内

功能/UI、升级依赖、远端操作、提交、推送、部署、task 归档、清除真实账本、停止用户服务、永久删除证据，以及迁移与 Docker 无关的标准配置。

## 授权与状态

第一轮已授权实施及独立复核，原 AC1–AC5 结果见 `validation.md`。用户澄清后，同 task 补充容器方案，用户回复“可以”确认最新结构于 2026-10-06 实施；容器依据见 `research/container-layout.md`。新增 AC6–AC8 已完成实际构建/隔离恢复与独立复核，task 进入 review，平台限制在验收中明确；第一轮结果保留。不重复索取既有授权，不推定提交/归档权限。UI/移动端应用交互不变；构建和容器入口的验证边界已扩展。
