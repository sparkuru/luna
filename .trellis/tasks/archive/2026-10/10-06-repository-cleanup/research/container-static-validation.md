# 容器阶段静态与 wrapper 验证

2026-10-06 已执行以下检查；实际镜像构建/runtime/context 和恢复 smoke 由主会话另记，
本记录不提前判定 AC8 全部通过。

| 门禁 | 结果与证据 |
| --- | --- |
| Compose 非秘密基线/对比 | Compose 2.26.1-4；三份配置×三种环境共 9 份正规化结果逐字段相等，仅 dockerfile/target 为设计中的变化。Android smoke profile 包含在比较中；移入 docker 的文件用显式 project-directory 保持所有绝对路径及 identity |
| Web/Android Dockerfile、MinIO Compose | 当前 SHA256 与预迁移原始完整文件 hash 相同 |
| `git diff --check` | exit 0，无输出 |
| `bash -n hako` | exit 0 |
| `shellcheck -x hako` | exit 0；第一次未加 -x 时仅 SC1091 提示无法加载既有 source，按既有 source 读取后通过 |
| `shfmt -d hako` | exit 0，无 diff |
| `node --check scripts/smoke-server-restore.mjs` | exit 0 |
| `node --check tests/deploy/container-layout.test.mjs` | exit 0 |
| `./hako node --test tests/preview.test.mjs` | 13/13；包括临时路径的真实 --file/dev/context 调用断言、dotenv、生命周期和输出 fixture |
| `./hako node --test tests/deploy/container-layout.test.mjs` | 3/3；Compose 所有 build targets/file/COPY 输入真实存在、显式 project-directory/仓库 bind confinement、server 共享 Node base 与独立 runtime 设置 |
| `./hako npm run typecheck` | exit 0 |
| `./hako npm run server:typecheck` | exit 0 |
| 当前引用扫描 | 现行 specs/hako/scripts/tests 的入口均更新到 docker；历史引用保留。通用测试中的缺省 Dockerfile 字符串是 Compose 标准 fallback，不是旧调用 |

基线保存在 [container-baseline.json](container-baseline.json)；全字段对比 scratch helper
为 `/tmp/luna-container-config.mjs`，最终 after 输出
`/tmp/luna-container-config-S4QHIy/after.json`。helper 用 clean env、临时空 env-file，
不会读取根生产秘密；对比过程没有 Docker daemon mutation。
测试 fixture 位于容器 `/tmp`，没有在根生成报告或改现有 preview。

普通 sandbox 中 wrapper 的 Docker socket 初次不可访问（operation not permitted），
随后使用范围明确的 `./hako` 执行审批运行临时容器通过；没有扩大个人配置或 raw Docker
规则。没有依赖安装/升级，也没有运行完整业务/设备验收。

首次交接时未由实现者执行：Docker 实际 context 过滤、Web/API/bucket-init/dev/Android image 构建，
合并目标的真实 restore smoke、MinIO provider runtime 及任何实体设备测试。
静态 COPY 输入存在并不证明其通过 ignore 后仍在真实上下文；主会话须完成此边界。

## 实际构建暴露的 ignore 问题与修复

主会话的真实 Web/Android build 首次失败：不能解析 renderer 的 `./data/local`。
原先新增 `**/data/` 误过滤 `src/renderer/data/local.tsx`，之前 COPY source 存在的
静态测试未覆盖 context 排除。只将两份 ignore 的该规则收窄为 `/data/`，保护实际
仓库根持久数据，保留普通业务源码；所有嵌套秘密/key/cache/archive 排除仍生效。

| 文件 | 修复前 SHA256（本阶段首次实现） | 修复后 SHA256 |
| --- | --- | --- |
| `.dockerignore` | `b3c8bfdf91a92df6f62b90ffa021ebf0fd6d4c3ed391956f0d1937622a50e9e1` | `497d215b28fe59a14324e6ff4f4d415dd7f4819a4efc22e8f61c080dc85bf64e` |
| `docker/Dockerfile.android.dockerignore` | `7d6ce94e362985dbcf6605a139b0416093c5f9d9dcbcd41a6926c1800e425f25` | `490427ae5ac8e8a4e0c117bdef3755d72ca878aa2ec5b37e35baa2f6283616cf` |

在 `tests/deploy/container-layout.test.mjs` 新增 opt-in 真实 Docker regression。
`LUNA_DOCKER_CONTEXT_TEST=1 node --test tests/deploy/container-layout.test.mjs` 经范围明确
的执行审批通过 **4/4，0 skipped**：使用缓存 Node 22、两个 `/tmp` 合成 fixture，
根 classic builder 与 Android adjacent BuildKit 分别实际 `COPY .` 并检查镜像内文件。
`src/renderer/data/local.tsx` 均保留；root data/.env/cache/archive、source 和 Android
嵌套 `.env/.env.local/.luna/key/pem/node_modules/.devhome/archive` 均排除，Android
Gradle wrapper 保留而生成 assets/build、签名密钥和 local.properties 排除。
未复制任何真实数据或秘密；唯一 label/tag 的测试镜像已清理，fixture 已删除。
普通 hako（没有 Docker CLI）运行时该 opt-in 行明确 skip，不把静态运行记成 context 通过。
Node syntax 与 `git diff --check` 再次通过。实际产品 Web/Android 重建结果继续由主会话记录。
