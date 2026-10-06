# 执行计划

## 当前阶段

第一轮文档/产物整理已完成，记录见下方；用户后续澄清主要对象为 Dockerfile/Compose。
用户回复“可以”确认最新结构；同 task 启动容器实施阶段，保留第一轮完成结果。

## 容器阶段规划与执行

- [x] 完整盘点四份 Dockerfile、两份专属 ignore、三份 Compose、根 context ignore。
- [x] 核对 hako、preview fixture、MinIO smoke、恢复 smoke 与当前 spec 的调用关系。
- [x] 明确归属、API/bucket-init 合并、相对路径/context/旧 builder 边界与回退形态。
- [x] 用户回复“可以”确认最新容器结构方案；重新 start 同 task。
- [x] 迁移前记录非秘密 Compose config 与所有默认路径/挂载/权限/网络/项目身份基线。
- [x] 移入 docker 目录；API/bucket-init 合并明确 target，保持镜像职责与所有运行配置。
- [x] 更新 hako、MinIO smoke、preview fixture、当前 spec 签名和恢复清单，去除重复 ignore。
- [x] 检验 .dockerignore 过滤和完整构建输入，证明 .env/根 data/keys/缓存/归档不进入 context；真实构建发现源码 data 被误排除后收窄规则，双 builder regression 通过。
- [x] 运行 hako syntax/ShellCheck/shfmt、preview.test.mjs、相关 typecheck 和 Compose 正规化等价对比。
- [x] 使用独立临时 image tags 构建 Web/API/bucket-init 与 dev；restore smoke 的 bucket-init 硬编码镜像增加可选 `LUNA_RESTORE_BUCKET_INIT_IMAGE`（默认原值），与已有 API/init env 一起选择临时镜像，再跑隔离恢复 smoke，不重标用户镜像；八项恢复与五项主 Compose 检查通过。
- [x] Android Compose 验证路径/目标/挂载；临时镜像 assemble/apksigner/导出/sidecar 通过。MinIO 原独立项目与固定端口预检闲置后，两个 provider smoke 通过并清理，不触碰生产 minio。
- [x] 独立全范围 Trellis check，新增 AC6–AC8 实测通过；自修 Android 全源码树签名文件过滤，真实回归通过，human-not-needed。Compose v1 runtime、Android emulator/实机及全量 UI/远端部署明确未跑。

门禁不使用根用户秘密配置：Compose config 采用临时非秘密 env；Docker/镜像访问按
真实执行权限进行，不扩大规则。任何服务实验只使用独立 label/project/free port/data。
运行中的已有 preview 与正式服务保持原状，原 APK、.env、data、归档材料不覆盖。
优先使用既有门禁；只有需要验证根目录归属、target 和 context 边界的回归缺口时才补测试。

若 wrapper/脚本变更，完整读取 code-shellscript 与项目 preview policy；若修改 Node
helper，读取对应 backend/frontend layer 规范。开发边界调整参照 dev-it-in-docker，
沿用项目既有生命周期与授权，不重新 bootstrap 或添加个人工具权限配置。

## 规划门禁

- [x] 建立独立 task；既有视觉 task 保持 review。
- [x] 读取 project policy、mainline、development-principles、continuity、commit-policy；核对 Git、大小与引用。
- [x] 写入 PRD、design、计划、盘点和双份真实 context。
- [x] 用户明确 README 精简、详细文档归入 `.trellis`，已读取指定参考并修订归属。
- [x] 用户回复“开始”，确认修订后的整体方案，包含文档迁移去重和可回退产物归整。
- [x] 运行 `python3 .trellis/scripts/task.py start .trellis/tasks/10-06-repository-cleanup`，状态已进入 in_progress。

## 实施顺序

1. 重查 Git 与候选闲置状态；保留用户新改动。检查目标没有冲突，建立精确路径/哈希/权限/symlink/引用清单；不输出秘密。
2. 按 `research/document-layout.md` 写精简 readme，保留标语和必要入口；按 design 文档表将三份来源逐节合并到现有 `.trellis/spec/`。核对当前源码/规范，处理旧 backup/origin/生成器描述与现状差异，维护相对链接、spec index 和 policy 入口；正文及引用完整迁移后移除根 PRD、deploy README、contracts generation。记录来源节→目标节映射，不在 task research 复制长期正文。
3. 按 design 表迁移确认闲置的截图、桌面包、报告和缓存；APK 固定输出原位保留。不停止服务，不永久删除材料。
4. 按映射维护受影响的证据链接，保留历史命令、结论和任务状态；不能安全移动的候选原位保留并说明。
5. 去重 ignore 中 `.gradle/`、`*.egg` 等重复项，补充 `.tmp-tsx/` 边界，不削弱未知规则。
6. 将迁移清单、文档来源、保留项与实际结果写入本任务 research/validation。

按当前 Codex 默认委派对应 Trellis implement/check agent；主会话负责范围、任务状态和最终核验。Dispatch 以 `Active task: .trellis/tasks/10-06-repository-cleanup` 开头，明确所有权与保留他人变更；缺失/截断注入时 child 完整读取 context 源文件。

## 验证

- `python3 .trellis/scripts/task.py validate .trellis/tasks/10-06-repository-cleanup`
- `git diff --check`，检查完整 diff/新增文件，确认无秘密、业务代码或受保护运行时变更。
- 全量比较移动前后文件计数、哈希、权限、symlink，证明无丢失/覆盖。
- 检查 README 的篇幅和入口、本次涉及的 Markdown/HTML 本地链接与图集内部链接；逐节比对文档迁移映射，确保非重复契约保留。区分此前已失效项，确认 `.trellis` 规范仍符合 context 文件大小边界。
- `git check-ignore -v` / `--no-index` 检查产物和敏感边界；`git ls-files` 核对 API core、task archive 可跟踪。
- 核对 package/Compose/Dockerfile/smoke/E2E 默认路径契约。纯文档、ignore、闲置产物移动不跑全量浏览器或设备测试；若实际扩大到脚本/运行时，补充受影响面验证。
- 核对真实数据、用户配置和服务未动，记录复核 gate 与剩余限制。

更新 mainline；本轮没有提交、推送、部署或 task 归档授权，不执行这些操作。

## 完成记录

- [x] 文档按对应规范合并去重，README 15 行，三份重复正文移除，来源节映射保留。
- [x] 闲置产物按精确映射可回退归整；因 artifacts 不可写采用根 archive，无权限变更。
- [x] 全量内容/元数据、导航、ignore、固定输出、保护路径与 context 验证通过。
- [x] 独立全范围复核通过；两个 P3 文档问题直接修复，human-not-needed。
- [x] 主会话补齐 validation 和长期文档归属约定，task 转 review，未提交/归档。

容器追加阶段也已完成：五个 target 实际构建、八项恢复、五项隔离主 Compose、
MinIO 双 provider、APK 临时导出与 sidecar 均通过；9 份配置等价、13 preview 和
真实 context 回归 4/4 通过。独立 checker 修复一处 Android 签名排除缺口后重验通过。
本轮五个临时 image tags 与合成数据/测试 APK 已清理，原资源保留；task 再次进入
review，未提交/归档。详见 validation 和 research/container-quality-check.md。
