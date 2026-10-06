# 2026-10-06 容器阶段独立全范围复核

范围为最终 AC1–AC8；保留第一轮[文档/产物复核](quality-check.md)，不把其未跑运行时
门禁的历史结论用于新增容器阶段。完整读取 23 条 check context 源文件、任务
PRD/design/implement、root AGENTS、mainline 和适用 policy，原生注入截断部分已补读。
主会话负责任务状态、mainline、总验收和临时应用镜像清理；checker 不提交、stage、
归档、部署，不停止既有 preview，也不读取真实凭据内容。

## 发现并直接修复

- **P2 / Android context 的签名文件排除范围不足**：
  `docker/Dockerfile.android.dockerignore` 原先只用 `android/**/*.jks` 和
  `android/**/*.keystore`；允许的 `src/**` 中同类文件会传入构建。
  在现有真实 context 回归的 `src/shared/`、`src/renderer/data/` 和 Android 合成
  fixture 补签名文件，修复前实际 BuildKit 报 `leaked src/shared/private.jks`，
  3 项通过、1 项失败。将两条改为 allowlist 后的 `**/*.jks`、`**/*.keystore`，
  保留原生目录排除效果并避免重复规则；两份源码树均受到保护。
  `tests/deploy/container-layout.test.mjs` 保留该回归，Android spec 同步全源码树
  签名边界。修复后真实双 builder 回归 4/4、0 skip，测试镜像/fixture 自清理。
- 没有未修复的本次整理问题。未覆盖的平台结果按下方边界保留，不推定通过。

最终 Android ignore SHA256：
`c451f64bc1517e9a6277cfaa312acb94ebf70c90b5273c370d5694059cc446fb`。
修复前该文件 SHA256 为
`490427ae5ac8e8a4e0c117bdef3755d72ca878aa2ec5b37e35baa2f6283616cf`。
复现/修复日志分别在 `/tmp/luna-container-check-context-before.log`、
`/tmp/luna-container-check-context-after.log`，最终去重 fixture 结果在
`/tmp/luna-container-check-context-final.log`。只使用合成材料，不表明真实密钥曾被传输。

## AC 结果

| 标准 | 独立核对结果 |
| --- | --- |
| AC1 | README 15 行、标语保留，无命令块；三份被合并正文的逐节来源表及六份现行 spec 存在，第一轮正文审查保留。 |
| AC2 | 独立重跑只读 manifest verify：9 映射、688 条目、618 文件/70 目录/0 symlink、397980121 bytes；全部内容与元数据一致，原 APK/sidecar 未变。 |
| AC3 | 重跑改动及 task Markdown、归档 HTML 静态文件/anchors 检查，无新增断链；容器迁移后的当前 callers/spec 签名和固定输出已核对。 |
| AC4 | ignore 保留秘密/data/archive/缓存/产物边界；API core JS/declarations 和 Trellis archive 的例外及 tracked 文件核对通过。真实双 builder 回归排除嵌套秘密与签名材料，并保留 renderer data 源码。 |
| AC5 | 业务源码、Android 源码、依赖、受保护 Trellis runtime 无 diff，index 无 staged paths。相关 helper 仅批准的路径/可选镜像 selector 调整；context 23/23 与 whitespace 通过。视觉任务保持 review。 |
| AC6 | 根仅保留主 compose/default ignore；docker 下三份 Dockerfile、一个 adjacent ignore、两个可选 Compose。API/bucket-init 共享 pinned Node base，入口/health/prune 各自保留。 |
| AC7 | 独立重跑 9 份非秘密 config 对比全部等价；含 Android smoke profile、自定义相对/绝对 data、UID/GID/端口/origin/suffix，项目身份和绝对挂载不变。Web/Android Dockerfile 与 MinIO Compose hash 与 Git 原始字节相同。恢复清单保留新 docker prefix 和全部 COPY/挂载输入。 |
| AC8 | 独立 syntax/lint、root/server typecheck、13 preview/3 静态 container tests 与真实 context 4/4 通过。另核验主会话五个 target 构建日志/镜像 IDs、8 项 restore、5 项隔离 Compose、MinIO 两 provider 和 APK export 证据；实际平台限制见下方。 |

## 实际执行与证据核验

checker 直接执行，最终均 exit 0：

```text
bash -n hako
shellcheck -x hako
shfmt -d hako
node --check scripts/smoke-server-restore.mjs
node --check tests/deploy/container-layout.test.mjs
./hako npm run typecheck
./hako npm run server:typecheck
./hako node --test tests/preview.test.mjs tests/deploy/container-layout.test.mjs
LUNA_DOCKER_CONTEXT_TEST=1 node --test tests/deploy/container-layout.test.mjs
node /tmp/luna-container-config.mjs after
python3 /tmp/luna_cleanup_artifacts.py verify --manifest .trellis/tasks/10-06-repository-cleanup/research/artifact-manifest.json
python3 /tmp/luna-cleanup-review-links.py
python3 .trellis/scripts/task.py validate .trellis/tasks/10-06-repository-cleanup
git diff --check
```

合并 hako test 为 16 pass/1 explicit skip：13 preview + 3 静态 container。
随后宿主 opt-in test 真实构建为 4 pass/0 skip；不把 hako 的 skip 记为 context 通过。
该 test 使用缓存 Node 22 和 /tmp 合成树，生产 root ignore 经 classic builder，
Android adjacent ignore 经 BuildKit；签名文件回归确实失败后才修复。
修复后 syntax、lint、root/server typecheck 和 hako tests 再次通过。
没有配置 ESLint/Markdown linter，不声称未配置门禁已运行。

非秘密 config after 快照在 `/tmp/luna-container-config-UQHX6x/after.json`。
链接结果见 [quality-link-check.json](quality-link-check.json)；计数随主会话新增验收
导航更新，全部本次 Markdown 及 HTML 无新增失效项。HTML 原 17 个 Chromium notice
文字占位链接保留，不执行内嵌 JS，不证明历史报告曾被冻结。

主会话 runtime 结果单独见[实际验证](container-runtime-validation.md)和
[持久结果](container-runtime-results.json)。checker 读取构建/恢复/MinIO 日志、
restore/Compose report 及 Compose helper，核对各断言确实执行相应代码，实际镜像
ID/USER 与记录一致。没有重复运行完整 runtime 套件，也不将其写为 checker 执行。
主会话已按最终 Android ignore 重建 export，再次导出/校验 sidecar 成功，镜像 ID
及 APK checksum 不变；结果已写回同一 runtime 记录。API/bucket-init/dev 也按最终
根 ignore 重建成功、ID 不变；checker 核验原始日志与最终 hash 一致。
已只读确认原 preview `d326904e668a` 仍 running，本轮隔离 Compose project 没有
遗留容器/网络，独立 context 测试镜像没有残留；应用临时 tags 由主会话最终清理。

## 审查边界

**human-not-needed（本次已批准目录/配置归整）**：可回退材料完整性、文档入口、
配置等价、实际构建/过滤及隔离恢复均有自动化证据。此次没有用户账本/schema
migration、UI/设备逻辑或长期部署切换，不新增主观满意度/设备验证门槛。
这不授予提交/归档权限，也不表示生产安全审计已完成。

本轮 Compose v1 二进制不可用；保留原兼容写法并真实验证 classic context，不能
称本轮 v1 runtime 通过。Android emulator/KVM、实体设备安装/交互、全量 UI、
远端/系统信任 TLS 和长期部署未运行，不能由 APK assemble/apksigner/export 或
配置等价推出通过。原任务中的设备/安全/历史真实性限制继续按其原范围保留。
主会话负责最后总验收及状态记录，不自行抢写 implement checkbox/validation。
