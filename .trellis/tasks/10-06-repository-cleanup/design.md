# 目录整理设计

保留业务源码、原生工程、第三方声明及与 Docker 无关的标准配置布局。不新增工具链、清理脚本或平行文档系统。按用户修订，readme 仅作精简入口，详细说明集中进已有 `.trellis/spec/` 对应文档，产品方向及任务状态留在 mainline 与正常任务树。第三方声明与许可证保留原位。第一轮之后用户澄清主要整理 Dockerfile/Compose，本任务新增以下容器布局，不将第一轮结果当作全任务完成。

## 容器配置结构（2026-10-06 已批准）

```text
compose.yaml
.dockerignore
docker/
  Dockerfile.web                  # 原根 Dockerfile：dev 与 Web build/runtime
  Dockerfile.server               # API + bucket-init，多 target
  Dockerfile.android              # Web bundle、SDK、APK、emulator、export
  Dockerfile.android.dockerignore
  compose.android.yaml
  compose.minio.yaml
```

生产主 Compose 仍可从根目录直接运行。Web build 显式选择 docker/Dockerfile.web；
API/bucket-init 显式选择同一 server Dockerfile 的对应 target；镜像名字保持原职责。
`hako` 改为读取 Dockerfile.web 的 dev target，默认开发镜像/标签/缓存/UID 不变。
可选 Compose 文件移入 docker，当前调用显式传 `--project-directory <repo-root>`，
从根调用使用 `--project-directory .`。这样保留原项目名推导与 dotenv/相对路径
基准，context/bind 仍使用原 root-relative 形式，Dockerfile 字段改为 docker/ 内路径；
不得再将这些字段改成 `..` 而越出仓库。MinIO smoke 使用绝对 ROOT project-directory
和新 Compose 路径，仍传原独立 -p。正规化对比包含项目名和所有实际绝对路径。

API 与 bucket-init 均使用相同 Node slim 版本，运行目标可以共享文件并采用明确
target；不把初始化行为塞入 API 启动脚本。保留 API production package prune、
非 root/健康检查和 bucket-init 的固定 mc 镜像来源、入口与受限职责。Android 的
SDK、BuildKit cache mount、KVM/模拟器与 Web/dev 镜像隔离，避免扩大生产工具链或
改变旧 builder 的解析需求。现有版本/digest 不升级。

根 `.dockerignore` 仍是 classic builder 的上下文规则；合并其 Web/server 输入，
更新 docker 文件路径并检验 data、.env、.devhome、archive、node_modules、keys 不入
context。server 专属 ignore 若与此界限重复则移除；Android 专属 allowlist 迁到
同名 Dockerfile 旁并保留私钥、生成 assets/build/Gradle 排除。对 Android 的 classic
builder 若存在 root ignore 适用差异，沿用其原有 BuildKit 要求，不向生产引入要求。

所有当前 spec 的签名、wrapper、测试 fixture、smoke 调用和恢复文件清单一起更新。
历史引用保留原时点含义，由本 task 记录旧→新配置映射；不复制旧配置留在根目录。
实际服务、数据路径、端口、安全边界和项目身份均不因目录迁移改变。

迁移之前保存三份 Compose 的非秘密配置快照、文件 hash 与静态路径解析结果。
复核对比只容许配置位置/明确 target 的变化，不容许挂载、网络、权限等隐式变化。
具体入口/验证见研究记录与执行计划。回退恢复原配置位置、调用者、ignore 和规范；
第一轮文档/产物不需回退。临时验证数据/镜像使用独立名字，不操作用户运行栈。

## 文档归属

| 原有内容 | 归属 |
| --- | --- |
| 标语、产品一句话介绍、使用/开发/许可入口 | 根 `readme.md`，约 15–20 行，无命令块 |
| 根 PRD 产品方向 | `.trellis/mainline.md` 的现有目标，仅补缺失事实，不复制操作正文 |
| 根 PRD Compose 启动、服务器管理；deploy README 部署/备份/恢复全文 | `.trellis/spec/backend/deployment-and-recovery.md`，合并现有契约并保留可执行操作步骤 |
| contracts generation API 生成/运行时说明 | `.trellis/spec/backend/http-api-guidelines.md`，合并已存在的版本、命令与生成约束 |
| 根 PRD 多设备同步、口令职责、手动模式与设置同步边界 | `.trellis/spec/backend/ledger-sync-guidelines.md`，链接现有 settings 专项规范 |
| 根 PRD 本地账本选择、各宿主存储、设备备份边界 | `.trellis/spec/frontend/web-host-and-validation.md`，链接后台 sync 与 Android 规范 |
| 根 PRD APK 构建、输出、原生 chooser/HTTPS 要求 | `.trellis/spec/frontend/android-runtime.md` |
| 根 PRD Docker 开发与测试命令、LAN HTTPS 预览 | `.trellis/spec/trellis-plus/development.md`，保留当前 setup/lifecycle 语义 |

逐节对照迁入正文；已存在的内容合并去重，不整段追加造成第二套说明。README 参考与结构决策在 `research/document-layout.md`；草案已落地后移除副本，长期入口仅为根 readme。规范文件若超过 context 单文件限制，先压缩重复内容；确需拆分时只在现有层内拆主题并显式登记 context。

## 迁移候选

| 来源 | 推荐目标 | 条件 |
| --- | --- | --- |
| 根 `prd.md`、`deploy/README.md`、`contracts/generation.md` | 上述 `.trellis` 归属；根 readme 仅链接 | 逐节合并无丢失，更新链接后移除三份重复正文 |
| 现存 `captures/` | `archive/2026-10-06/captures/` | 确认闲置；保留图集结构、trace、备份；维护证据链接 |
| 现存 `out/` | archive 下 `out/` | 无运行进程依赖；保留 executable 权限和 symlink |
| `playwright-report/`、`test-results/` | archive 下同名目录 | 不是正在写入的报告；核对视觉任务引用 |
| `.tmp-tsx/` | archive 下同名目录 | 闲置缓存；补充项目 ignore |
| `artifacts/android/` 的诊断截图 | archive 下 `android-captures/` | 精确识别和维护引用；APK 及 sidecar 原位保留 |

`dist/`、`dist-web/`、`.vite/` 可能被运行入口消费，默认原位保留；`node_modules/`、`.devhome/` 属开发环境；`data/`、`.env` 属用户状态，不迁移或清除。助手目录、凭据目录和受保护 Trellis 运行时不变。

## 引用与回退

实施前为精确候选建立路径、内容哈希、权限和 symlink 清单。整目录迁移保留内部相对链接，按映射更新外部证据链接；不替换容器内部 `/artifacts`、测试写入路径、历史时点命令或各任务自己的 `prd.md`。

当前规则改指真实 `.trellis` 说明入口，并更新对应 spec index。历史来源/行号、旧命令和验收结论保留原意，来源迁移由本任务清单记录；作为现存导航使用的链接更新到新位置。相对链接需按新目录解析，文档中执行命令默认仍从仓库根运行，迁移不改变命令的 cwd。不把本就失效的链接、被后来覆盖的截图或旧 SHA256 当成本次通过证据。

现有规范与旧操作文档存在描述时点差异，例如 backup helper 与旧 rsync 示例、native allowed origins、生成器事务描述。逐项对照当前源码及已验证规范再合并，不以旧文档覆盖新契约；源节到目标节的映射记录保留合并依据。只做证据支持的文档修正，不实施部署或重新声称运行验收通过。

实施盘点发现 artifacts 父目录为 nobody:nogroup 0755，当前用户无法在其中创建 archive。采用无需提权的 `archive/2026-10-06/`，复用 `.gitignore` 现有 archive 规则，不修改目录权限；Trellis task archive 仍通过原例外跟踪。材料不提交、不存入易清理的 `/tmp`。目标存在时不覆盖；无法证明可合并的材料分别保留。按映射反向移动可恢复路径。后续工具仍按原默认目录生成新输出，不改脚本/Compose/Dockerfile/打包配置。

纯文档、ignore 与闲置产物移动检查 diff、链接、ignore 和全量迁移清单。若发现必须改脚本/源码，先记录必要性、加载对应规范并收敛范围，再运行相关现有验证，不扩展为功能重构。
