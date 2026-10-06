# 2026-10-06 容器配置整理研究与方案

用户澄清“我指的可能是各种 dockfile、compose 文件呢？”；原先排除标准配置的
范围判断未覆盖真正重点。本研究只读，尚未修改 Dockerfile/Compose/hako/测试。
在同 task 内增加容器阶段，已完成的文档/产物结果保留。

## 文件实际职责与调用

| 原文件 | 实际职责 | 当前调用者 | 规划去向 |
| --- | --- | --- | --- |
| Dockerfile | Node22 dev Chrome/Firefox；Web build、Nginx runtime | hako dev target；主 Compose web build | docker/Dockerfile.web |
| Dockerfile.server | server TS build、runtime dependency prune、Node API | 主 Compose api | docker/Dockerfile.server 的 api target |
| Dockerfile.bucket-init | 固定 MinIO mc + Node 初始化入口 | 主 Compose bucket-init | 同 server Dockerfile 的 bucket-init target |
| Dockerfile.android | debug Web bundle、SDK、APK、emulator/export | Android Compose 三个 target；包含 RUN --mount cache | docker/Dockerfile.android |
| Dockerfile.server.dockerignore | server-only allowlist | BuildKit server context | 与根生产 allowlist 合并后移除重复文件 |
| Dockerfile.android.dockerignore | 原生 allowlist，排除生成/私钥/Gradle | Android BuildKit context | Dockerfile.android 旁保持专属过滤 |
| compose.yaml | instance-init、private MinIO、bucket-init、api、web；data边界 | 默认生产 CLI | 原位，显式 Dockerfile/target 路径 |
| compose.android.yaml | APK 导出、KVM emulator、Node smoke；固定输出目录 | 当前 Android spec、用户构建入口 | docker/compose.android.yaml，等价路径修正 |
| compose.minio.yaml | 独立名字、loopback端口、tmpfs、合成凭据 | scripts/smoke-config-sync-minio.ts | docker/compose.minio.yaml，smoke 文件路径同步 |
| .dockerignore | 默认 root context allowlist，classic builder 依赖 | 全部生产构建 | 原位，更新文件路径及等价输入 |

四份 Dockerfile 收敛为 docker 下三份，三个 Compose 保持不同运行职责，其中两个
可选入口收纳到 docker；根容器配置只剩主 compose 与 context ignore。可选 MinIO
确有 smoke 调用，不能按名字判断多余而删掉；Android 的工具链与设备权限也有实际
用途。合并 backend 的两个 Node runtime 目标，不混用生产 minio 与合成 smoke。

## 证据锚点

- `hako:26` DEV_DOCKERFILE 目前根 Dockerfile；`:69` --target dev build 需要同步路径。
- `tests/preview.test.mjs:70` 把根 Dockerfile 复制进 fixture，需创建 docker 目录并复制新路径。
- `scripts/smoke-config-sync-minio.ts:8` COMPOSE_FILE 是旧根文件，runCompose 使用绝对 -f 及 ROOT cwd；新文件无 data bind，但项目身份/端口保持。
- `scripts/smoke-server-restore.mjs` 已支持 API/init 镜像环境输入并使用隔离 label/data；其 `:102` bucket-init 仍硬编码 luna-bucket-init:local。为不改用户现有 image tag，新增可选 `LUNA_RESTORE_BUCKET_INIT_IMAGE`，默认保持原值，以临时镜像执行合并后的恢复验证，不读真实 data。
- Android Compose 的 build.context、dockerfile、repo/output volumes 当前相对根文件解析；单独移动会把隐式项目名从仓库名变为 docker。实施选择在所有当前调用显式传 `--project-directory <repo-root>`，保留项目身份、dotenv 和 context/bind 基准；Dockerfile 字段改为 docker/ 路径，不同时引入 `..`。MinIO helper 同样传绝对 ROOT。此选择已由主会话确认，属于保持已批准行为的技术调整。
- 根 context allowlist包含三份生产 Dockerfile；旧 builder 应用根 .dockerignore，恢复章节明确保留 source prefix。移入子目录后须保留 docker/ 前缀与生产所需文件。
- Android Dockerfile:39 起使用 BuildKit RUN --mount 与专用 Gradle/key cache；生产旧 builder 兼容边界在现有 deployment spec 有记录，Android 保持独立文件。

## 验证与取舍

目录迁移涉及真实 build/context 路径，不能沿用上一轮“仅文档，不跑 typecheck/build”
作为新增阶段的验收。先比较三份 Compose 的非秘密正规化配置与绝对路径；再验证
context allowlist、preview wrapper 测试和实际目标构建，使用临时 tag/data/端口。
生产恢复 smoke 以新 API/bucket-init 镜像执行；Android/MinIO 入口按能力实测并记录。
原部署/preview不重启，不发布新生产端口，不覆盖原 APK/数据。

此方案优先保持常用根 `docker compose up --build -d` 入口，并实质减少 backend
重复 Dockerfile。没有将不同工具链强行合成单文件、把测试服务塞进默认生产栈，
也不删除已使用的辅助入口。最新方案等待阶段评审；既有第一轮操作不需重复授权。
