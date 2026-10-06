# 容器配置迁移记录

2026-10-06 用户回复“可以”批准容器方案后实施。第一轮文档/产物修改保留；
本记录只覆盖新增 AC6–AC8。原配置内容与 hash 见 [配置基线](container-baseline.json)，
Git 来源为本轮开始时的 `edbd4dc`；历史任务的旧文件/命令引用保持原时点含义。

| 原路径 | 当前归属 | 实际处理 |
| --- | --- | --- |
| `Dockerfile` | `docker/Dockerfile.web` | dev/build/runtime 全文件字节一致，仅迁移 |
| `Dockerfile.server` | `docker/Dockerfile.server` 的 build/api | 保留 build、prune、runtime、USER、健康检查、CMD，Node 镜像提为 node-base |
| `Dockerfile.bucket-init` | 同 server 文件的 minio/bucket-init | 相同 MinIO digest、mc 来源、Node base、UID 与 ENTRYPOINT |
| `Dockerfile.android` | `docker/Dockerfile.android` | 全文件字节一致，仅迁移；BuildKit cache 不进入生产文件 |
| `Dockerfile.server.dockerignore` | 根 `.dockerignore` | 移除重复专属 allowlist；根规则包含 Web/server 两类输入 |
| `Dockerfile.android.dockerignore` | `docker/Dockerfile.android.dockerignore` | 改 Dockerfile allowlist 路径；保留原生生成/Gradle/签名排除，补嵌套秘密/缓存排除 |
| `compose.yaml` | 原位 | Web build 显式选文件；api/bucket-init 显式选同文件的独立 target |
| `compose.android.yaml` | `docker/compose.android.yaml` | build Dockerfile 路径改为 docker 前缀；root-relative context/binds 原值保留 |
| `compose.minio.yaml` | `docker/compose.minio.yaml` | 全文件字节一致，仅迁移 |

## Compose 基目录与调用

可选文件移动后，单独 `-f docker/compose.android.yaml` 会把默认项目目录改为 docker，
影响项目名、dotenv、context 和 bind。采用 Compose 既有 `--project-directory` 参数：
从根执行 `docker compose --project-directory . -f docker/compose.android.yaml ...`。
其他 cwd 传仓库根绝对路径。MinIO helper 同样显式传 ROOT，保留既有固定 `-p`
测试项目。没有硬编码克隆目录名或给 Android 增加不兼容 Compose v1 的 top-level name。

生产默认根 `docker compose up --build -d` 入口保留，默认镜像标签、数据路径、内部
service、权限、端口、网络、初始化顺序与 API 的秘密隐藏挂载均保留。
9 份完整正规化配置对比通过；基线使用临时空 env-file 和只有 PATH 的进程环境，
覆盖默认、relative data、absolute data、自定义 UID/GID/端口/origin/Android suffix
以及 smoke profile。没有载入根 `.env`。Android smoke 的配置在迁移前初次快照中
未显式启用，随后按预迁移 hash 核验 Git 原始字节，在隔离临时文件与原 project-directory
重放后补齐全服务基线；不把迁移后的配置充作迁移前证据。

## 当前调用者与说明

- `hako` 仅更新 dev Dockerfile 路径与注释；镜像、UID/cache、发布和生命周期不改。
- `scripts/smoke-config-sync-minio.ts` 更新绝对 Compose 路径和显式 project-directory。
- restore helper 新增 `LUNA_RESTORE_BUCKET_INIT_IMAGE`，默认仍 `luna-bucket-init:local`。
  允许临时镜像验证合并结果，无需改写用户镜像标签；现有 API/init/MinIO selector 保留。
- preview fixture 创建 docker 目录，复制新 Dockerfile；实际 build 调用断言文件存在、
  dev target 和仓库 context。新的 container-layout 回归核验实际 Compose build/COPY 输入。
- backend deployment/config-sync、frontend Android、Trellis Plus development 更新当前
  签名；恢复示例保留 `docker/` prefix，复制两个生产 Dockerfile，根 ignore 不遗漏。

## Context 与回退边界

根 `.dockerignore` 保留 allowlist。将 `.env/.luna/data/key/pem/keystore/cache/archive`
排除放在所有允许规则之后，避免 src 下的嵌套敏感目录被后续 `!src/**` 再次允许。
Android adjacent ignore 同样保留相关排除与原有 private/generated/Gradle 边界。
静态输入检查不替代 Docker 实际 context 验证，后者由主会话执行并记录。

实际 Web/Android build 首次失败指出 `src/renderer/data/local.tsx` 被新加的
`**/data/` 排除。两份 ignore 已将此规则收窄为 `/data/`，对应真实服务端持久化
目录；普通源码 data 目录不按名字认定为用户数据库。嵌套 `.env/.luna/private keys`
与缓存/归档排除仍在最终 deny 规则中。修复未改源码或 Dockerfile；前后 hash 与
真实双 builder 合成 context 回归见 [静态验证](container-static-validation.md#实际构建暴露的-ignore-问题与修复)。

如需回退容器阶段，先检查没有新用户修改，按上表恢复 Git 原始配置及旧路径，恢复
当前调用者/ignore/spec 的本阶段 diff。不要覆盖第一轮 README/spec 的已批准内容；
不执行 broad reset。运行中的旧 preview、真实 data/.env、固定 APK 和已有镜像 tag
不属于本阶段回退或清理目标。本实现者没有构建部署镜像、启动栈或停止现有服务。
