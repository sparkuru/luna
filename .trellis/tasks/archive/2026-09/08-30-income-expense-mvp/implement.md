# 阶段 0 执行计划：边界与技术验证

## 当前整改执行顺序（2026-09-05）

以 PRD 顶部最新目标及 `research/cross-platform-audit.md` 为准；下文历史阶段延期不缩减当前交付。

1. 修复 Web 保存失败、损坏数据清除、过期副本覆盖和对象引用泄漏，补充分支回归。
2. 正式 Web 生成版本化离线缓存，提供无主机工具链 Compose 启动，并在正式构建上做离线冷启动 Playwright。
3. 升级事务化浏览器持久化及旧数据无损迁移，提供可恢复的版本化备份。
4. 共享账本变更/冲突模型、端侧密文及 S3 条件写同步；双端离线修改、重连、并发、删除与错误验证。
5. 打包内置 Web 资产的 Android APK；验证安装、离线启动/持久化、与 Web 同步。
6. 审查实用动效，验证键盘/reduced motion/窄屏；完成整体类型/测试/Playwright/部署验收和使用说明。

每步以实际命令输出记录证据。只有全部验收满足才结束目标，不能以 Compose 或设置同步的单项通过代替完整交付。

当前执行结果：143/143测试、42/42正式Web Playwright、MinIO账本/设置、
Electron打包烟测、Android实际离线/加密互通/SAF备份通过。当前规范增加
预算observed-head防过期写、跨端兼容设置密码格式、取消直达持久化提交边界。
保留CSS实用过渡，未引入anime.js。下文阶段清单保留历史，不覆盖顶部最新
验收；实际制品/hash与残余人工门禁见`research/validation-cross-platform.md`。

## 执行前提

- 当前任务必须先通过 Trellis 规划审查；用户必须明确批准最新规划摘要；之后才能运行 `task.py start`。
- 任务已在执行中；用户已于 2026-08-30 批准本轮新增范围，可以派发产品代码实现。
- `task.py start` 后，按 Codex 子代理流程派发实现与检查；每个派发提示的第一行必须是 `Active task: .trellis/tasks/08-30-income-expense-mvp`。
- 开始源码和依赖工作前，按 Trellis Plus 要求检查 `hako` 与 `.devhome`；使用 `dev-it-in-docker` 建立可复现的 Node 22+ 开发边界。当前主机 Node 为 `20.19.2`，不能作为本任务的实现基线。
- 版本和包名均需在实现开始时重新核对；研究报告中的 2026-08-30 版本只是候选锁定值。
- 任何涉及用户可见 UI 的实现，先读取项目本地 UUPM skill 和相关 frontend 规范；若只是技术 smoke harness，仍需保持无障碍语义和可自动化状态，但不把临时 harness 当作产品视觉定稿。

## 有序清单

### 0. 第一个可用本地检查点（优先完成）

- [x] 建立默认工作区初始化流程，收集工作区名称、币种、精度和可选月度开支上限，并明确提示远端加密同步尚未启用。
- [x] 实现收入/支出新增、编辑、删除和本地列表；字段至少包含金额、日期、分类、商户、支付方式和备注。
- [x] 实现月度收入、支出、结余和预算进度摘要；统计只来自未删除且通过共享领域校验的记录。
- [x] 通过关闭/重新打开 Electron 应用验证 SQLite 本地数据恢复；将数据库固定在启动前解析的当前活动本机目录下。
- [x] 用可访问的语义 HTML、键盘可操作表单、明确的错误状态和窄化 IPC 交付可实际使用的界面。

上述五项构成当前首个可用交付。浏览器 OPFS、端侧加密、远程同步和
S3 适配器仍保持在本阶段的研究/延期范围，不因本地检查点完成而伪装成
已实现能力。

### 0A. 人民币、i18n、金额隐私与配置同步扩展（当前优先）

- [x] 在共享设置模块定义版本化 schema、`zh-CN`/`en` locale、portable/device-local/local-secret 分区、默认隐藏金额和严格 decoder。
- [x] 建立 `settings.json` 原子持久化、损坏文件安全回退与配置读写测试；文件固定在当前活动本机目录，秘密不得进入 renderer 可读 DTO。
- [x] 用消息 catalog 替换 renderer 主要流程全部用户可见硬编码英文，提供语言切换与键一致测试；金额、日期、月份使用当前 locale 的 `Intl`。
- [x] 工作区币种支持 `CNY`（界面别名 RMB/人民币），人民币金额以 minor unit 无损保存并按 locale 显示。
- [x] 实现金额默认隐藏配置与会话级显示/隐藏按钮；默认仅遮罩收入、支出、结余和剩余预算四项顶部汇总，预算详情、分类和交易列表金额保持可见，DOM/ARIA/live region 不泄漏被隐藏的汇总值。
- [x] 实现 S3-compatible 配置同步的本机连接配置、凭据隔离、版本化认证加密 envelope、GET/条件 PUT、失败分类与有限重试。
- [x] 实现“同步所有设置”本机开关：开启同步全部 portable settings，关闭时不执行远端配置读写且不得覆盖本机展示偏好；开关和凭据本身不被远端改变。
- [x] 用两个独立 userData 等价设置目录及固定版本 MinIO endpoint 验证新设备恢复、重复同步、确定性合并、幂等、秘密不上传和开关关闭零调用；错误口令、篡改和冲突重试由同一生产服务的自动化契约测试覆盖。
- [x] 更新 packaged smoke，使其覆盖 CNY、中文界面、隐私重启恢复和至少一个 renderer → IPC → settings file round trip；真实 S3 兼容性另以契约测试证据覆盖。

### 0B. 应用标识与本机目录选择（当前追加）

- [x] 将包名、产品名、可执行文件和主要用户可见标题统一为 `luna` / `Luna`，同步更新打包、文档和 smoke 断言。
- [x] 建立主进程目录解析器：默认 `~/.config/luna`，进程启动前已有默认目录则直接进入；仅默认目录不存在时通过原生对话框创建默认目录、选择其他本地目录或取消退出。
- [x] 将 settings、SQLite 和 local-secret 文件固定到当前活动目录；自定义目录用版本化本机位置指针记住，指针不进入 renderer、远端配置或日志。
- [x] 覆盖默认目录、取消、选择文件/非法路径、损坏指针、自定义目录重启恢复和原子目录创建；清除账本只需移走数据库及 WAL/SHM，不影响 `settings.json` 和秘密文件。
- [x] 更新 README 与人工验收说明，明确当前版本是单工作区、通过目录选择实现本机隔离；真正的多工作区切换仍另行实现。

### 0C. 汇总隐私与 Web-first 验收（本轮追加）

- [x] 调整金额隐私边界：默认只遮罩收入、支出、结余、剩余预算四个顶部汇总值；预算编辑值、预算使用/上限、分类统计和交易列表金额保持可见。
- [x] 汇总被隐藏时收缩顶部 summary row；会话级显示/隐藏不写回配置，reload/重启后重新采用配置默认值；编辑交易和预算不因汇总隐藏而被禁用。
- [x] 建立 `src/web` Vite 入口与浏览器本地适配器，注入与 Electron 相同的 `LunaLedgerApi`；Web reload 恢复 origin-local 数据，配置同步显示为桌面端专属且不接触秘密。
- [x] 增加固定浏览器项目的 Playwright 配置和 E2E：setup/CNY、交易录入、隐私显示边界、summary compact、reload reset、语义控件、共享 stylesheet 生效和 375px 无横向溢出。
- [x] 增加固定版本 MinIO compose 与 wrapper；启动/健康检查/随机 bucket/生产配置同步 conformance/清理全流程可复现，输出不含秘密或明文业务数据。
- [x] 用 `npm run web:build`、`npm run test:web` 和 `npm run smoke:config-sync:minio` 形成可复制的浏览器与 S3-compatible endpoint 证据，并更新 research/spec。

### 1. 建立最小工具链与运行边界

- [x] 重新确认并锁定 Electron、Forge、Vite、TypeScript、`better-sqlite3` 及 Node 要求；SQLite WASM 仅保留为后续 Spike 研究项。
- [x] 建立 npm lockfile、Node 22+ 版本约束、TypeScript strict 配置和最小 typecheck/test/build 脚本。
- [x] 用 Forge `vite-typescript` 建立 main、preload、renderer 和打包入口，并记录 Vite plugin 的 experimental 风险。
- [x] 保持 browser OPFS Spike 为独立研究边界；本轮新增的是 localStorage Web 预览，不把它描述为 OPFS、PWA 或跨端同步。
- [x] 运行 typecheck、build/package、最小测试和 packaged smoke，确认工具链先于业务代码可重复执行；桌面 `start` 留给具备显示库的主机人工启动。

### 2. 实现共享领域最小切片

- [ ] 建立平台无关的 Workspace、Transaction、Split、Revision、Tombstone、Operation 和 Conflict DTO/类型。
- [x] 建立金额、符号、拆分总和、本地日期和月度预算的单一验证函数；内部保持无浮点误差，边界编码无损。
- [ ] 建立最新有效版本和冲突候选的派生统计函数；保证删除立即排除、候选不重复计入。
- [x] 使用 `node:test` 覆盖正常路径、边界值、无效拆分、日期/时区、墓碑和重复操作；测试不得导入 Electron 或数据库实现。
- [x] 共享层不得出现 Node/Electron/供应商 SDK import；所有外部 payload 通过一个解码/规范化入口。

### 3. 建立 Electron 原生 SQLite 适配器与安全桥

- [x] 在精确锁定的 Electron 运行时中验证 `better-sqlite3` 版本、ABI rebuild 和 packaged runtime；`node:sqlite` 不作为默认基础。
- [x] 将数据库放在启动前解析的当前活动本机目录；禁止写入 ASAR、resources、源码或测试共享目录。
- [x] 实现最小迁移表和短事务：workspace、transactions/revisions、splits、tombstones、pending operations、conflicts；schema 仍为内部实现，不作为公开格式。
- [x] 实现 LocalStore port；测试首迁移、重复迁移、回滚、整数往返、重启 reopen、临时目录隔离和错误分类。
- [x] 实现 main → preload → renderer 的逐项 typed API；开启 `contextIsolation`、sandbox、`nodeIntegration: false`，校验 IPC sender 和参数，不暴露原始 `ipcRenderer`。
- [x] 通过离线 renderer smoke 完成保存、关闭、重新打开、查询；对象存储未接入且不会阻塞本地事务。

### 4. 执行浏览器 SQLite WASM/OPFS Spike

- [ ] 建立独立 browser entry、module Worker 和真实 HTTP/localhost dev server；按需提供 COOP/COEP headers。
- [ ] 锁定 `@sqlite.org/sqlite-wasm` build，先测标准 `opfs` VFS；只在有测量理由时追加 `opfs-wl` 或 `opfs-sahpool` 对照。
- [ ] 验证 Worker 初始化、schema/migration、写读、关闭/重开、reload 后持久化以及跨 Worker/页面争用。
- [ ] 记录 `SQLITE_BUSY`/generic I/O、短事务重试、配额、清除 site data、隐私模式、不支持和权限拒绝的行为。
- [ ] 记录浏览器/OS、WASM build、VFS、secure context、cross-origin isolation、headers、代表性操作耗时和失败证据。
- [ ] 形成“支持/不支持/延期”的结论；不将 OPFS 结果写成 PWA 或跨浏览器生产承诺。

### 5. 验证端侧加密边界

- [ ] 建立隔离的 CryptoProvider contract 和 synthetic test vectors：root-key envelope、加密载荷、完整性失败、错误密码和版本不兼容。
- [ ] 验证改密码只重新包裹稳定 root key；主密码不进入 IPC 持久化、对象存储或日志。
- [ ] 明确错误分类和无部分明文返回；用测试密钥/假数据，不把原型当作安全评审结论。
- [ ] 将具体 AEAD/KDF/轮换方案记录为后续安全设计输入，不在阶段 0偷偷固化生产协议。

### 6. 验证双客户端变更与对象存储契约

- [ ] 建立确定性的 in-memory ObjectStore/test transport 和两个客户端状态模型。
- [ ] 验证离线新增、编辑、删除、重复上传、下载应用、operation-id 去重、墓碑阻止旧记录复活。
- [ ] 验证金额、类型、日期、拆分和删除状态冲突不会被 timestamp/LWW 静默覆盖；非重叠非财务字段可以合并，同一标量字段进入冲突。
- [ ] 建立至少一个经过测试的 S3 兼容适配器契约：上传、下载、条件写入/版本、失败分类和重试；保留供应商/服务版本与配置证据。
- [ ] 不在本阶段冻结完整对象命名、因果协议、检查点发布、压缩或广泛供应商矩阵；把未验证部分标为 deferred。

### 7. 打包、回归与阶段报告

- [x] 运行共享测试、SQLite 集成、Electron bridge smoke、Web Playwright、MinIO 配置同步 conformance；browser OPFS Spike 仍按独立延期研究记录。
- [x] 运行实际 packaged/made artifact 的启动、写入、关闭、重启读取；native addon 存在且由 Electron ABI 构建。
- [x] 复核 diff、日志和测试产物不含主密码、root key、明文业务数据或对象存储凭据。
- [x] 把浏览器矩阵、Electron/OS/架构、版本、失败重试、兼容性和延期结论写入任务 research 或验证报告。
- [x] 由 `trellis-check` 对 PRD、design、implement、manifest、规范、跨层 round-trip 和测试结果做质量门禁；修复后由主会话再次确认范围。

## 验收映射

| ID | 可观察结果 | 主要验证 |
|---|---|---|
| P0-1 | 共享领域测试证明整数金额、拆分精确求和、日期归属、预算、最新版本和墓碑规则 | `node:test` domain suite |
| P0-2 | Electron renderer 通过窄 IPC 保存交易，关闭/重启后从 userData SQLite 恢复，离线不阻塞 | Electron packaged smoke + SQLite integration |
| P0-3 | 浏览器 Worker 能报告 OPFS 创建/迁移/写读/reload/锁争用/失败条件，且报告带版本和环境记录 | Browser automation/manual matrix |
| P0-4 | 加密边界能区分正确解密、错误密码、损坏载荷、改包裹；无主密码/root key/明文上传或日志 | Crypto contract tests + log review |
| P0-5 | 两个客户端的新增、编辑、删除、重复操作和关键字段冲突结果确定性可重放；墓碑阻止复活 | Sync simulation + adapter contract |
| P0-6 | 至少一个 S3 兼容适配器通过最小上传/下载/幂等/失败重试测试，供应商范围有证据 | Adapter conformance test |
| P0-7 | 阶段退出报告明确 Electron 生产基础、OPFS/PWA 是否延期、native ABI 风险、加密与同步未决项 | Task research/report + final check |
| P0-8 | Web 入口复用同一 renderer/API，干净浏览器上下文可创建并 reload 恢复本地预览；隐藏时只有顶部四项汇总遮罩且 summary row 收缩 | `npm run test:web` + `npm run web:build` |
| P0-9 | 固定版本 MinIO 可由仓库脚本启动并通过生产 config-sync adapter conformance，随后清理测试服务 | `npm run smoke:config-sync:minio` |

## 当前检查点的验证命令

以下命令已在当前工具链中落地并按任务研究记录执行。容器命令使用
项目根目录的 `hako`，made ZIP 和 Electron GUI 运行仍需要具备显示/打包
运行库的主机：

```text
./hako npm install
./hako npm run typecheck
./hako npm test
./hako npm run build
npm run make
npm run smoke:electron
npm run web:build
npm run test:web
npm run smoke:config-sync:minio
git diff --check
```

浏览器 Web 预览的 Playwright、Web build 和 MinIO conformance 命令属于本轮
追加的可复现验收入口；browser OPFS、加密实验和账本同步仍是独立延期研究，
不能用 Web localStorage 或配置同步结果代替。

扩展完成时必须新增可复现的 settings/i18n/config-sync 测试命令或纳入现有
`npm test`，并记录受控 S3-compatible endpoint 的产品、版本、启动方式和
conformance 结果。没有真实 endpoint 证据时不得宣称广泛 S3/OSS 兼容。

真实 endpoint 证据：`npm run smoke:config-sync:provider` 于 2026-08-31
通过 MinIO `RELEASE.2025-09-07T16-13-09Z`（官方镜像 digest
`sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`）验证；
结果为 `cleanup=deleted`、`get=8`、`put=2`。这只证明该固定版本与测试路径，
不扩大为所有 S3/OSS 供应商承诺。

## 高风险文件与回滚点

- `package.json`、lockfile、Forge/Vite/TypeScript 配置：版本漂移或模块格式变化会影响所有入口；先锁版本再改业务代码。
- Native SQLite adapter 与 Forge packaging 配置：ABI、ASAR unpack 和平台编译失败时回滚到端口级替换，不改共享领域。
- SQLite migrations：只作用于临时/阶段 0数据库，迁移失败必须回滚；不得删除用户路径。
- preload/IPC contract：任何 API 变化必须同步类型声明、handler、renderer 调用和测试，避免跨层 payload 漂移。
- browser Spike：保持独立目录和依赖边界，失败时只记录延期结论，不污染桌面持久化实现。
- crypto experiment：不被生产同步路径依赖；安全方案未评审时禁止把实验适配器标记为 release-ready。
