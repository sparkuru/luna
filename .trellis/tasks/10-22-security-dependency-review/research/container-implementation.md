# 容器安全补丁实施记录（2026-10-22）

> 下文是分工实施阶段记录；后续完整验证及提交状态以 [validation.md](../validation.md) 为准。

## 实施范围

按已批准的安全补丁批次修改 7 个现行入口，共 11 处固定版本引用：

| 文件 | 原版本 → 当前版本 |
| --- | --- |
| `docker/Dockerfile.web` dev | `node:22.22.0-bookworm` → `node:22.23.4-bookworm` |
| `docker/Dockerfile.web` build | `node:22.22.0-bookworm-slim` → `node:22.23.4-bookworm-slim` |
| `docker/Dockerfile.web` runtime | `nginx:1.29.8-alpine3.23` → `nginx:1.30.6-alpine3.24` |
| `docker/Dockerfile.server` node-base | `node:22.22.0-bookworm-slim` → `node:22.23.4-bookworm-slim` |
| `docker/Dockerfile.android` web | `node:22.22.0-bookworm-slim` → `node:22.23.4-bookworm-slim` |
| `docker/Dockerfile.android` sdk | `eclipse-temurin:21.0.10_7-jdk-noble` → `eclipse-temurin:21.0.12.1_1-jdk-noble` |
| `docker/Dockerfile.android` export | `alpine:3.23.3` → `alpine:3.23.7` |
| `compose.yaml` instance-init | `node:22.22.0-bookworm-slim` → `node:22.23.4-bookworm-slim` |
| `docker/compose.android.yaml` android-smoke | `node:22.22.0-bookworm-slim` → `node:22.23.4-bookworm-slim` |
| `scripts/smoke-server-restore.mjs` default initializer | `node:22.22.0-bookworm-slim` → `node:22.23.4-bookworm-slim` |
| `tests/deploy/container-layout.test.mjs` synthetic context base | `node:22.22.0-bookworm-slim` → `node:22.23.4-bookworm-slim` |

版本替换前已搜索现行仓库引用；替换后在排除任务历史/调查证据、依赖与产物的现行树中，
`22.22.0|1.29.8|21.0.10_7|3.23.3` 无匹配（`rg` exit 1）。原始调查与归档证据保留原版本。
Diff 仅修改上述版本，保留 MinIO digest、服务/网络/用户/权限/数据挂载、生命周期、
Android SDK/emulator 编号及校验和、Chrome/Playwright 安装配置。

## 镜像元数据核验

逐项执行 `docker manifest inspect <tag>`，仅读远端元数据，不拉取镜像层、不运行服务。
初次受限沙箱全部因 Docker Hub DNS 失败；按原授权使用受控网络权限重试，未发生自动审批拒绝。
下表 digest 是远端索引中的 **linux/amd64 子 manifest**，不是标签总索引 digest，
用于确认目标架构存在；仓库继续采用原有固定 tag 策略。

| 标签 | 重试结果 | linux/amd64 manifest digest |
| --- | --- | --- |
| `node:22.23.4-bookworm` | exit 0 | `sha256:de636e50060a9908cf40a20a50d027ed74a99b2e31d2635f3b13e9e4e5e97e74` |
| `node:22.23.4-bookworm-slim` | exit 0 | `sha256:ea11b74b986d520137cdef9a5346e447a00f275ecc4abc0055b7151226231e09` |
| `eclipse-temurin:21.0.12.1_1-jdk-noble` | exit 0 | `sha256:85b018ff9a266c6bc3251da2c8125078afca3bf64bc035dfee32ad49a11cba10` |
| `nginx:1.30.6-alpine3.24` | exit 0 | `sha256:84ed8c0dd296c188bfc24ed506f46589e9285fb0b11cf3a04d91d524d3067e11` |
| `alpine:3.23.7` | exit 0 | `sha256:3d67941fed5ae436b2bb9791cb3f50a252441c7706bbc5b4e738936df8ff8306` |

## 本子任务实际检查

- `node --check scripts/smoke-server-restore.mjs`：exit 0。
- `node --check tests/deploy/container-layout.test.mjs`：exit 0。
- `git diff --check`：exit 0。
- 查看 7 个配置/脚本/测试文件的完整 diff：仅 11 行版本替换。
- 现行旧版本引用扫描：无匹配。

依赖安装由 npm worker 负责；为避免并发修改 `node_modules`，未在本子任务执行依赖相关测试。
主会话负责更新后 hako 镜像、布局/preview（含真实 Docker context）、API/Web/Android 构建、
恢复烟测及整体验证。这些项目不能从元数据/静态检查推定通过。未操作生产部署、现有服务或真实数据。

## Electron make 开发环境前置修复

主会话的 `/tmp/luna-security-electron-make.log` 显示 Electron Forge 已成功完成
Linux x64 package（含原生依赖），在 `Making a zip distributable for linux/x64` 失败，
精确错误为 `spawn zip ENOENT`。这是开发镜像缺少 ZIP maker 必需命令。

在 `docker/Dockerfile.web` 的 dev stage 中、既有 Playwright/Firefox provisioning 后，
新增独立的 `apt-get update && apt-get install -y --no-install-recommends zip` 层并清理 apt lists。
保留前序 Node/Chrome/Firefox 层以复用正在进行的构建缓存；未改变 hako、挂载、权限、
production build/runtime 或 APK 边界。本次按 `dev-it-in-docker` 技能核对既有源码开发模式。

本子任务未启动镜像重建或重新运行 make；主会话负责重建后核验 `zip`、重跑 make 与
打包烟测。补丁的 `git diff --check` 通过，安装/产物结果不得从静态 diff 推定通过。
