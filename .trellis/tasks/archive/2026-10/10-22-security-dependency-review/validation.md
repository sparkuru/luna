# 安全补丁验收（2026-10-22）

## 当前实施与验证（运行门禁完成）

用户在调查结果后明确要求更新、由 agent 验证、最后本地提交。运行门禁与独立最终复核均通过，已按授权本地提交 `d9404c0`，提交时任务保留 review；后续归档授权与状态见下文。
版本与残留漏洞见 research/npm-implementation.md、research/container-implementation.md；
业务源码、生成 SDK、存储格式和 MinIO digest 保持原样。

| 检查 | 本轮实际结果 |
| --- | --- |
| 锁文件安装 | npm ci 通过；18 个锁定路径变更，无增删或跨主版本，Node SQLite ABI127 可用 |
| root/server typecheck | 新 Node22.23.4 两项复验通过；最初实施检查使用原开发镜像 Node22.22.0 |
| 新 Node22.23.4 单元/API/契约/同步 | 226 / 26 / 6 / 9，全通过，无跳过 |
| api:check / server:build / web:build | 新 Node22.23.4 均通过，SDK 标记 LUNA_API_REPRODUCIBLE |
| npm audit | 全量 36→23（0 critical/6 high/17 moderate），omit-dev 3→0；全量残留对应三个构建树底层公告 |
| API/Web/bucket-init 镜像 | 本次专用标签构建通过；没有替换生产标签或运行真实部署 |
| 部署回归 | 17/17 通过，包含 production/Android 两种真实 Docker context 排除回归，无跳过 |
| preview mock 回归 | 新 Node22.23.4，13/13 通过，无真实预览服务变更 |
| 服务恢复 | 新 API/bucket-init/Node22.23.4 通过既有八项恢复、CAS、重启及受限密钥回归 |
| nginx runtime | 真实新 nginx 非 root/read-only，受控 HTTP upstream，无外网/发布端口；health、shell、隔离头/CSP、路由、API no-store/错误转发通过 |
| 新 dev 镜像 / Browser 专项 | 含 zip 的完整镜像重建通过；Node22.23.4、Chrome156.0.8078.47；桌面/窄屏隐私与离线持久化18/18通过，53.6s，无跳过 |
| Browser（完整生产） | 344/344 通过：chrome172、chrome-narrow172，2 workers，7.2m；使用初始浏览器工具镜像，测试资源与依赖均为本轮更新版 |
| Electron package/存储烟测 | package 通过；默认 sandbox 的直接产物 storage/IPC/备份/重开烟测退出0；实际 Electron44.9.3、Node24.22.0、Chromium152.0.7977.167 |
| Electron 图片烟测 | 初次中途断言通过但清理 ENOTEMPTY，判失败；修复等待退出且显式启用 chromiumSandbox 后重跑退出0，保留实际 chooser/save/decrypt 断言 |
| Electron make / 最终 ZIP | 初次缺 zip 失败；补工具后在新 Node22.23.4 dev 镜像重跑退出0，生成 Linux x64 ZIP，完整性校验通过；解包后的 storage 与 file-input 两项默认 sandbox 烟测均退出0 |
| APK | 新工具链 assemble/export 通过，APK 签名及 SHA256 校验通过；实际 Temurin21.0.12.1+1；未覆盖原 APK |
| Android runtime | 新 APK 在本次专用 Android16/KVM 模拟器完整烟测退出0；离线首启/写入/重开、日期、BACK/IME、加密 Node 协议互通、原生图片/备份/设置持久化通过；19项汇总保存在 research/android-runtime-result.json |

Docker-aware 的宿主恢复/context orchestration 使用从官方 Node22.23.4 镜像临时导出的
`/tmp/luna-security-node22`，Electron 图形烟测与独立末次 typecheck 也使用该临时 Node，
图形测试另用既有 Xvfb。安装、构建及常规开发命令通过 hako；未安装全局工具链或修改宿主设置。
原始运行日志放 `/tmp/luna-security-*.log`，持久结论保存在本文件。
初始开发镜像 ID 为 `sha256:183cf7e2dae32c2958cf6b5dbd3baa53e84f18a456acf329062e3dcdbba02822`；
新开发镜像为 `sha256:b4936ec7a835b5c2fbbe188658691332ea77771f7000f317395c21d5fd88a8ee`，
实际版本、产物 SHA256 与成功退出汇总见 [final-artifacts.json](research/final-artifacts.json)。
产品测试没有读取真实用户数据；打包后的共享开发 SQLite 模块已恢复到 Node ABI127，查询/关闭通过。
Android 专用容器/网络已在完整烟测退出0后清理；新 APK 与截图保留在
`/tmp/luna-security-android-artifacts/`、`/tmp/luna-security-android-smoke/`，现有项目 APK 未覆盖。
该模拟器 WebView 为133.0.6943.137，不能推定实体设备或其系统 WebView 已更新。

Spec 同步：backend/quality-guidelines.md 补充 audit 集合与实际发布运行时的区别、
Node/Electron SQLite ABI 的检查顺序，以及 Playwright sandbox/退出清理语义；backend/index.md 对应更新入口描述。
frontend/android-runtime.md 记录原生日期夹具与当前表单月份一致的契约。
没有新增命令签名、环境键、数据格式或用户流程。

### 运行中发现并修复的验证阻断

- make 的 ZIP 工具缺失：首次退出1；新增 dev-stage 独立 zip 安装层，保留已有浏览器缓存层；最终重建/make/解包 smoke 已全部通过。
- 桌面图片脚本在子进程真正退出前删除 profile，ENOTEMPTY；改为 await close，无吞异常/固定睡眠。
  同时纠正 Playwright `_electron.launch` 默认会禁用 sandbox 的测试配置，当前默认显式开启。
- Android 首次专用只读测试容器未给 tsx 提供可写 /tmp，在安装前退出；后续挂载专用 tmpfs，根只读保留。
- Android 随后在保存固定9/29交易后断言10月列表，出现正确空列表；改成表单当前月份15→16日，
  仍通过真实系统日期对话框选择并验证 ISO 保存/重启。没有改变产品筛选或减弱断言。
  早期失败日志保留为 `/tmp/luna-security-{electron-make,electron-file-input,android-smoke,android-smoke-retry}.log`。

## 当前验收边界

AC1–AC5 已通过；独立 [Trellis check](research/quality-check.md) 通过，
提交门禁为 human-not-needed。AC6 已完成：本地工作提交 `d9404c0`，
显式暂存37个授权文件，提交前 context/JSON/链接/空白检查通过，提交后路径/内容已核验。
生产 npm audit 的 0 仅指 omit-dev 集合；全量 23 个命中来自 Forge 树的 braces、
sprintf-js、http-cache-semantics 三个底层公告。MinIO 固定版本的已知风险与维护迁移问题保留；
Electron44.9.3 内置 Node24.22.0，尚不包含 Node24.22.1 最新安全回移，不能称为全栈漏洞清零。
实体设备、不同系统 WebView、宿主原生对话框视觉与线上 TLS/长期运行没有在本轮重验。
实施验收阶段用户已委托可观测检查和本地提交，当时未授权归档；后续明确允许归档见下文。

## 第一轮调查交付核验（历史）

### 范围与结果

该轮交付为规划阶段的漏洞/版本调查，task 状态仍为 planning，未进入升级实施。

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| AC1 版本清单 | 通过 | locked-inventory.json：37 个直接依赖，864 个锁定依赖路径；运行时/Android 清单见研究报告与 platform-versions.json。 |
| AC2 公告与适用性 | 通过（调查范围） | 全量 audit 36 项、32 个去重 GHSA；omit-dev 3 项。研究报告区分版本命中、调用条件、来源日期、API 失败与未覆盖部分。 |
| AC3 更新目标与验证 | 通过（建议，尚未升级） | npm、Docker 官方版本元数据支持候选存在；报告给出同主版本批次、MinIO/Forge 独立决策与未来回归。 |
| AC4 只读产品边界 | 通过 | git diff 检查 package.json/lock、src、docker、compose.yaml、android、hako、preview.sh、deploy 无变化；工作树仅任务目录与主线登记变化。 |

### 实际执行

- 全量/omit-dev `npm audit --package-lock-only --ignore-scripts --json` 完成，退出码 1 为命中漏洞。
- `npm outdated --json` 完成，30 项有新版本；退出码 1 为发现过时包。
- GitHub API 29/32 成功，3 项限流，分别由维护者公告网页补查；原始失败仍保留。
- 7 个研究 JSON 全部解析成功；task.json 与两个 context JSONL 结构、存在路径核验通过。
- `task.py validate` 通过，implement/check 各 7 个有效条目，明确登记适用项目政策。
- audit 数量和 GHSA 去重独立复算通过；新文件空白核验和 `git diff --check` 通过。
- 无产品代码变更，本轮未跑产品类型检查、构建、单测、浏览器、APK 或镜像烟测，
  不引用历史通过作为本轮结果。未验证线上实装版本或漏洞可利用性。

### 交付判定

本次文档交付为 human-not-needed；不表示升级、许可、存储迁移或生产安全已验收。
PRD/design/implement 与研究证据已就绪。调查结论可交付，task 保持 planning；
后续升级需用户选择范围，再更新规划并按正常 Trellis 流程执行。无提交、部署或归档。

## 归档收尾（2026-10-22）

用户明确「可以归档」。在工作区干净、工作提交及独立复核已核验后，使用
`task.py archive 10-22-security-dependency-review --no-commit` 归档。
22 个任务文件完整保留，task 为 completed，completedAt 为 2026-10-22，旧目录消失，
当前活动指针已清除。两个 context manifest 的本任务引用随新目录修正。
本轮仅验证归档状态、文档/上下文路径和提交范围，不重复执行已通过的产品测试。
归档保留上文全部残留风险和未覆盖项，不改变安全结论；未推送或部署。
