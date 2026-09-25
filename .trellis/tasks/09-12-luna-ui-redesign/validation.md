# Luna 改版实施验收记录

日期：2026-09-12–13（Asia/Singapore）
任务：`09-12-luna-ui-redesign`
状态：`in_progress`；本地实现和可运行 Web 验收已完成主要部分，平台与人工边界仍待验收。

## 2026-09-25 当前验收增量

- 后续按当前已提交源码重新执行 `npm run web:build`，通过。生产 Web 全量 Playwright 在宿主 Node 20.19.2 上为 **192 passed、4 failed**；四项均为 `ux-mobile-navigation.spec.ts` 中中英文真实登录用例，桌面/窄屏各一项，worker 在调用本机 SQLite 原生模块时以 `SIGSEGV` 退出。改用此前验证过的 Node 24.15.0，在同一生产构建、宿主 Chrome、`chrome`/`chrome-narrow`、2 workers 与 `--grep-invert 'real server login'` 范围下重跑，结果 **196/196 passed**。这补齐了计算器修复后的生产 Web 全量回归；该 grep 仍排除另外两项 `server-account.spec.ts` 真实服务登录测试，不等于远端 HTTPS 验收。
- 对 `192.168.9.13` 作免密 SSH 只读连通探测，仍返回 `No route to host`。未改动远端资源；09-11 的隔离 project 清理、公开 HTTPS 账号烟测和真实跨设备图片同步仍待主机恢复。
- 兼容 Node 24.15.0、宿主 Chrome、生产 Web 构建、`chrome` 与 `chrome-narrow` 的全量 Playwright 回归为 **196 passed、2 failed**（共 198 项）。两项失败是同一计算器键盘用例在两个视口复现：展开原生 `<details>` 后立即键入，首键进入金额输入框。修复改为表单捕获阶段同步读取 `<details>.open`；收起时金额框仍直接输入，展开时计算表达式先留在 LCD。独立复核还确保焦点位于计算器按钮时 Enter 执行该按钮，保留其原生键盘行为。修复后重建 Web，`entry-form-polish.spec.ts` 生产桌面/窄屏 **16/16 passed**；`./hako npm test` **214/214 passed**，TypeScript typecheck、Web build 与 `git diff --check` 通过。未把修复前的 198 项结果写成修复后的全量通过。
- 用户授权的 PLR110（`192.168.9.9:45797`，Android 16）使用独立 `majo.im.luna.validation` APK，SHA-256 `8b75c5139744f48d09ebc988b8ee194dbb9df53c1ed4ee716c15facdbe5d2731`。该 APK 是计算器修复前的构建；本轮真机验证的是不依赖该修复的选图与备份路径。实际 `com.android.documentsui` 选择唯一命名的 1×1 合成 PNG，附件在交易保存后经 `readTransactionImage` 读出正确 PNG 签名、尺寸与 MIME；强制停止并重启应用后读回内容一致。系统文件选择器还导出 3,352 字节完整备份，文件头为 `LUNABK02`，未含测试口令或商户明文。本轮未在真机执行备份导入，既有隔离 AVD 验证仍单列。
- 真机合成 PNG、媒体索引、备份文件均已检查清理；隔离 APK 已卸载，`pm list packages majo.im.luna` 无结果。PLR110 未接入远端同步，不能据此宣称真实 Android/桌面跨设备图片同步通过。
- 9.13 测试主机暂时离线，部署 URL、真实跨设备同步及前一任务隔离项目清理仍待主机恢复。Electron 原生文件对话框、真实浏览器 200% 缩放、辅助技术及用户视觉认可仍待验；本任务保持 `in_progress`。

本轮范围调整（2026-09-13）：用户已授权提交当前本地进度；后续优先前端与体验，部署、跨端联动、真实同步及相关验收后置。以下未完成项继续保留，不因本地验证通过而视为产品交付。

## 已通过

| 范围 | 证据 |
| --- | --- |
| UX01–UX05、EN01–EN05、ST01–ST03、QU01–QU03、RT01 的可运行 Web 路径 | 最新开发服务器桌面/窄屏 Chrome 合计 68 passed、6 skipped；最新生产构建桌面/窄屏 Chrome 合计 74 passed（均排除 real server login 账号场景）。覆盖四个一级页、设置子页、空态/录入/计算器、隐私摘要、预算草稿、统计趋势桶键盘明细与分类金额/日期钻取、搜索筛选、按日流水、键盘可达的完整交易详情、独立编辑、旧路由迁移、备份导入导出、Service Worker 离线更新、图片附件保存/刷新/预览和窄屏无溢出；录入类型切换会保护不兼容分类，表达式阶段 Enter 只求值不保存，分类网格保留原生按钮语义，图片 staging 未完成时禁止提交；列表主文案按商户→备注→分类降级并在窄屏单行省略；统计最大支出默认前五并可查看全部，日期按 locale 格式化，趋势使用 progress、环图使用 SVG；空正则模式仍显示当前账本结果；Radix 对话框在 Escape 时只关闭最上层并恢复触发器焦点。 |
| 账号浏览器 E2E | 使用兼容 Node 24.15.0 运行时、宿主 Chrome、loopback Vite 4174 和每次生成的合成账号执行 `server-account.spec.ts`；桌面/窄屏 `2 passed`。覆盖登录、HTTP 加密图片附件上传与跨源摘要头读取、第二浏览器恢复/刷新后图片读回、会话撤销/续登、离线本地副本恢复。 |
| F 视觉尺寸与合成数据人工检查 | `/tmp/luna-ui-redesign-20260913/`；宿主 `/usr/bin/google-chrome` 本地 Vite 4174，合成 11 笔账目、负预算结余、大金额、长商户/备注、1×1 PNG，英文与中文。已打开查看 375×812 账单/搜索/统计月与年环图/预算/设置/录入分类与计算键盘/附件/图片详情/交易详情、320×740、768×1024、1440×900、812×375 横屏及 640px CSS 布局等价视口；几何探针均无文档级横向溢出，375px 三摘要和两笔交易位于固定导航上方，320px 首屏入口不被固定底栏覆盖。 |
| AT01–AT05 的共享/Web/Native 桥接边界 | 共享完整备份、附件加密/哈希、v1/v2、Web SQLite/OPFS/IDB、Android 分块桥和服务端对象测试通过；同步覆盖并发2、单对象60秒/最多3次重试、幂等键、缺图失败和并集 quota；按目标持久化版本 checkpoint、能力协商、profile local-only 迁移的 durable lease/续租/过期恢复和跨 adapter 写入阻断均有测试。Web E2E 覆盖有图备份恢复、冲突和错误保留；新增真实浏览器双 context 的 S3 协议夹具回归，验证离线本地写入、加密附件对象上传、graph 引用顺序、第二个独立 IDB 客户端下载/GCM 读回和 reload 后读取；Android 隔离 smoke 覆盖离线持久化、硬件返回、真实 DocumentsUI 选图、加密同步、SAF 完整备份和设置互操作。真实 Android/桌面跨设备图片同步仍未运行。 |
| Android APK 与隔离 AVD smoke | Docker JDK 21 `assembleDebug`、APK 签名/完整性、默认 UID 导出及 `luna-smoke` AVD 均通过；Android 16 的完整 smoke 输出 `result=passed`，包含真实 DocumentsUI 选择合成图片、离线 staging/保存和重启后解密读取；APK SHA-256 为 `c5d3704f1345aa6e9b5d4f3f3d3a0f9bc3ef96e7f982d86357b461056cddbb83`。运行期间只使用 Compose 定义的 `emulator-5554` / `luna-smoke`，结束后已停止并移除容器。 |
| MG01 服务端和同步基础能力 | server tests 26/26；server-sync tests 9/9；contracts tests 6/6；服务端 typecheck/build 通过。schema v3 的附件 reservation generation、过期租约 fencing、精确孤儿回收、同 key 并发幂等和 v2→v1 降级阻断均有回归；附件 PUT/repair 在数据库 reservation 前校验实际 SHA-256，HTTP CORS 暴露附件摘要头并允许自定义请求头；另有本地 API/MinIO 完整服务恢复烟测，保留 graph、附件 metadata/ciphertext、ETag、digest、usage、幂等重放和重启后的 instance/session。 |
| 共享逻辑与存储 | `./hako npm test`：203/203 passed；覆盖 Native schema5、Web state v4、IDB v2、附件二进制、迁移租约和安全随机 ID 回退，并覆盖完整最大支出排序及两客户端附件下载、GCM 读回、重启重建。 |
| 生成 API 与 Web 产物 | `./hako npm run api:check` 输出 `LUNA_API_REPRODUCIBLE`；`./hako npm run web:build` 通过；`./hako npm run typecheck` 通过。Vite 仅报告依赖包 `use client` module directive 警告。 |
| Electron 本地集成 | 当前代码的 `./hako npm run package` 通过；`xvfb-run -a env LUNA_ELECTRON_NO_SANDBOX=1 npm run smoke:electron:file-input` 已通过打包 Renderer 的 chooser→规范化→IPC→本机保存→解密读回；该脚本明确不替代 GTK/Windows/macOS 原生文件对话框人工审阅。标准 packaged smoke 在当前容器因 Chromium sandbox 权限退出 127，主机直接运行为 SIGSEGV，使用 `xvfb-run` + `--no-sandbox` 的环境等价 smoke 退出 0，但未将其替代为正式 smoke 通过。 |
| 工作区卫生 | `git diff --check` 通过；本轮未连接 VPS、未操作真实用户设备或部署环境。当前提交已获用户明确授权；部署、跨端联动和真实同步验收仍后置。 |

## 2026-09-12 增量记录

- 修复了 SQLite-WASM 对既有 `luna_state` 表检查迁移列时只检查首行、导致旧库启动报 `duplicate column name: migration_json` 的问题；改为精确查询目标列。修复后的 public API 诊断中 `getSettings`、`getSnapshot`、`getLedgerSyncStatus` 均成功。
- `npm run test:web -- tests/e2e/*.spec.ts --project=chrome --workers=2 --grep-invert "real server login"`：31 passed、3 skipped；`--project=chrome-narrow`：31 passed、3 skipped。两次均由项目标准配置启动 Vite，生产 Service Worker 场景按配置 skip；按日流水/交易详情、图片附件与 320px 最小宽度回归在两种项目均通过。
- `./hako npm run smoke:server-restore`：通过，输出目录为 `/tmp/luna-server-restore-kgrgss`；API/MinIO 停止后复制并恢复的完整边界保留了账本、附件对象、精确 ETag、usage 和幂等语义。
- 迁移并发的真实 profile 测试使用同一 IndexedDB 的第二个 adapter 尝试写源账本，确认在复制期间收到 `LUNA_ERROR:migration-locked`；租约续期、释放和过期恢复由 Native/Web 存储测试覆盖。
- 统一 Web、Renderer、完整备份会话和附件 ID 的安全随机实现：优先 `crypto.randomUUID()`，否则使用 `crypto.getRandomValues()` 的 UUID v4；无密码学随机源时显式失败，仓库无 `Math.random()` ID 回退。新增 3 项共享单测，并用 `crypto.randomUUID` 缺失的 Chrome 用例完成工作区、交易和完整备份下载回归。
- 发现并修复 `320×740` 在大金额交易操作区的 5px 横向溢出及固定底栏覆盖首屏收入入口；窄屏操作区现允许换行，顶部间距在 `≤520px` 断点收紧，并新增 `minimum mobile width keeps critical actions above the fixed navigation` 回归。聚焦 `intuitive-ledger` Chrome 8/8 通过，开发/生产完整矩阵已用重建后的 Web 产物复跑。
- 已完成人工可复核的合成视觉截图：最终目录为 `/tmp/luna-ui-redesign-20260913/`，截图不写入仓库。检查覆盖长账本、长类别/备注、大金额、超预算、图片预览、交易详情、中文/英文、320/375/768/1440/横屏和 640px CSS 布局等价视口；未把截图视为像素快照或用户视觉认可。

## 2026-09-13 收尾复核

- 在按日流水、交易详情和移动端操作菜单适配加入后的中间基线，开发 Web `chrome`/`chrome-narrow` 各 `31 passed、3 skipped`；重建 `dist-web` 后生产 Web 两个项目各 `34 passed`，均排除已知宿主 Node20 `better-sqlite3` SIGSEGV 的 `real server login`。本轮新增统计/Enter/空正则回归后，最新全量合计为开发 `66 passed、6 skipped`、生产 `72 passed`。
- `./hako npm run typecheck`、`./hako npm test`（198/198）、`./hako npm run web:build`、`./hako npm run server:build` 和当前 `./hako npm run package` 均通过；`git diff --check` 与任务上下文校验通过。没有提交、部署、连接 VPS 或操作用户设备。
- UX02 使用 375×812 的 3 笔合成记录验证月份、三摘要、两笔完整交易和中央记账动作；长备注在列表单行省略、在详情完整显示。详情主按钮支持鼠标/Enter 打开，关闭后焦点回到原行，并可从详情继续编辑；当前详情截图为 `/tmp/luna-ui-redesign-20260913/transaction-detail-375x812.png`。
- ST02/ST03 统计交互已补齐：趋势桶支持鼠标/Enter 选中并显示所选时间段、总额和前三笔交易；分类排行支持键盘选择，并可在金额/日期之间排序展示钻取明细。开发版桌面/窄屏及生产构建桌面/窄屏全量回归均再次通过。
- 录入回归又覆盖了收入/支出类型切换：已有另一类型分类时，取消确认会保留原类型，确认后才清空分类并切换；同时修复分类网格把原生按钮覆盖成 `role=listitem` 的无障碍回归。图片 staging 期间提交按钮保持 disabled；桌面/窄屏 targeted 与四个全量 Web 矩阵、最新 Electron package 均通过。
- 列表主文案补齐商户为空时的备注摘要降级，并为 375px 首屏增加长备注标题单行省略；详情仍显示未截断备注。该修复后的开发/生产桌面与窄屏矩阵均已重跑通过。
- 生产桌面焦点回归曾暴露原生 `onKeyDown` 晚于 Radix 文档级 Escape 捕获、导致嵌套分类对话框连带关闭；现改用 `onEscapeKeyDown` 在 dismissable-layer 边界拦截，保留微任务恢复父触发器焦点。修复后的 React 状态、详情和图片 Escape 回归均包含在最新开发/生产桌面与窄屏全量通过结果中。

## 2026-09-13 主线缺口补齐

- 统计共享函数现在保留期间内完整的确定性最大支出排序，Renderer 默认显示前 5 条；超过 5 条时可通过带 `aria-expanded`/`aria-controls` 的按钮查看全部，切换期间、日期或收支类型会恢复前 5 条。新增 6 笔排序单测和 Playwright 展开/收起回归。
- 金额输入在表达式阶段按 Enter 只调用求值，不触发表单保存；简单金额仍可按 Enter 保存。正则开关在空查询时走本地普通查询，保留筛选结果，不启动无意义的 Worker。
- 统计日期改用所选 locale 的 `formatDate`/`formatMonth`；趋势比例使用原生 `progress`，分类环图使用 SVG 圆环，避免用户可见 inline style 并保持 CSP 边界。交易详情、图片查看器也统一使用 Radix `onEscapeKeyDown`。
- 账号浏览器 E2E 先在宿主 Node20 的 `better-sqlite3` ABI 段错误处失败，随后修正独立 BrowserContext 的本地 workspace 初始化与设置/账单路由切换；使用兼容 Node24.15.0、loopback Vite 4174、宿主 Chrome 和合成账号重跑，桌面/窄屏共 `2 passed`。
- 本轮重新运行：`./hako npm run typecheck`、`./hako npm test`（198/198）、`./hako npm run web:build`、`./hako npm run package`、API/contract/server-sync/server typecheck/server test 及全量 Web。开发桌面/窄屏合计 `66 passed、6 skipped`；生产桌面/窄屏合计 `72 passed`；标准 Electron smoke 仍为容器 Chromium sandbox 的 `status=127`，`xvfb-run` + `--no-sandbox` 环境等价检查退出 0。临时 smoke 目录已移除。
- Android 以 Docker JDK 21 完成 `assembleDebug`，`apksigner`/ZIP 完整性与默认 UID 导出均通过；在 Android 16 `luna-smoke` 隔离 AVD 上运行完整 `scripts/smoke-android.ts`，离线首启/写入/进程重启、隐私与无 Service Worker、硬件返回、WebView↔Node 加密合并、SAF 取消/保存/解密恢复、设置同步和最终离线重启全部通过，输出 `result=passed`。为适配 Android WebView 在输入法收起后的瞬时 CDP target 状态，smoke 视觉证据改用 Android device surface capture；同时修正备份详情默认展开和 `.luna-backup` 文件名解析。隔离容器已在验证后清理。
- 同一 Android 16 隔离 smoke 另通过了真实 `ACTION_OPEN_DOCUMENT`/DocumentsUI 选图：将合成 1×1 PNG 写入 disposable AVD 的 Downloads 并建立临时 MediaStore 索引，选择后断言规范化 PNG、附件加密 staging、离线保存，以及 force-stop/reopen 后 `readTransactionImage` 返回的真实字节/尺寸；测试文件和媒体行均在 finally 清理。
- Android 原生多选失败分支补充了 `LedgerImageInputPluginTest`：在第二个 provider 条目拒绝时，所有尚未发布的 `SelectedImage` 流都会关闭；Docker JDK 21 中 `testDebugUnitTest` 通过（`BUILD SUCCESSFUL`）。
- 新增 `scripts/smoke-electron-file-input.ts` 作为打包桌面文件入口的可重复边界检查；在隔离 `HOME`、Xvfb 和 `--no-sandbox` 环境下通过真实打包 Renderer 的 `<input type=file>` chooser 注入合成 1×1 PNG，验证规范化、Native IPC、本机保存及解密读回。Playwright 会拦截宿主 chooser，因此原生 GTK/Windows/macOS 文件对话框视觉与键盘行为仍单列待人工验收。

## 2026-09-13 两客户端附件同步闭环

- `src/sync/ledger-service.test.ts` 新增两客户端附件回归：第一客户端的每个加密对象在 graph PUT 前上传；第二客户端从同一远端 graph 下载并按 descriptor、长度、SHA-256 和 AES-GCM 验证后保存；重建第二客户端本地状态后仍可解密读取全部合成 PNG。该测试是本地 HTTP/S3 协议等价夹具证据，不替代真实 Android/桌面跨设备验收。
- `./hako npx tsx --test src/sync/ledger-service.test.ts`：16/16 passed；`./hako npm run typecheck`：passed；随后 `./hako npm test`：199/199 passed。

## 2026-09-13 HTTP 服务端附件完整性与浏览器闭环

- `src/server/app.ts` 与 `src/server/db/operations.ts` 现在在附件 reservation、repair 和发布前校验实际 body SHA-256；错误摘要不会留下数据库 reservation，也不会把不可读的 repair 对象写入服务端对象存储。
- HTTP CORS 现暴露 `X-Luna-Cipher-SHA256`/`Content-Length`，允许 `HEAD` 及附件所需的 `X-Luna-Cipher-SHA256` 请求头；`tests/server/attachments.test.ts` 覆盖错误摘要、repair、读取响应头和 OPTIONS preflight。
- `./hako npm run server:test`：22/22 passed；`./hako npm run test:contracts`：6/6 passed；`./hako npm run test:server-sync`：9/9 passed；`./hako npm run server:typecheck`：passed；`./hako npm run api:check`：`LUNA_API_REPRODUCIBLE`；最终 `./hako npm run typecheck`：passed。
- 使用 Node 24.15.0、宿主 Chrome、loopback Vite 4174 执行 `tests/e2e/server-account.spec.ts`：桌面/窄屏 `2 passed`。真实浏览器通过生产 HTTP 客户端上传加密图片对象，第二个独立浏览器下载并在刷新后解密读回；服务端内存对象也确认密文长度为明文 PNG 加 16 字节且不等于明文。该证据仍不替代真实 Android/桌面跨设备验收和真实部署 URL。

## 2026-09-13 版本门槛、代际回收与完整备份容量

- 服务端 schema 已升至 v3；新增 `attachment_orphans` 精确对象回收表。过期 reservation 会先 fencing token，再按 generation/physical key 记录并回收；首次删除后仍保留孤儿记录，以捕获迟到或取消上传重新落盘的旧代际对象。`server:admin cleanup` 已接入同一 reconcile 路径。
- reservation publish、repair 最终提交会在等待 SQLite writer 后重新授权；同一进程同 actor/scope/key 的幂等请求在对象发布前串行化，避免并发同 key 产生双对象或唯一键失败；同 key 不同 body 仍返回 409。v2 ledger 写入后再发 v1 写入会明确返回 409。
- Android SAF 完整备份适配层现在校验 native 写入回执、宿主导入回执、最终总字节数和非法 Base64；失败时会同时取消宿主 job、释放 native handle，并由定向测试覆盖。
- Web `tools.tsx` 完整备份路径也已在 OPFS sink 关闭前校验 EOF/总字节数、逐块校验宿主追加回执，并在失败时取消 `File.stream()` reader；本次重跑开发 Web `68 passed、6 skipped`、生产 Web `74 passed`，`web:build` 与 Electron package 均通过。
- `./hako npm test`：`203/203 passed`；`./hako npm run server:test`：`26/26 passed`；`./hako npm run server:typecheck`、`./hako npm run server:build`、`./hako npm run typecheck`、`./hako npm run web:build`、`./hako npm run api:check`、`./hako npm run test:contracts`、`./hako npm run test:server-sync` 均通过，`api:check` 输出 `LUNA_API_REPRODUCIBLE`；`git diff --check` 通过。
- `./hako npm run measure:full-backup` 的 64MiB 合成测量完成导出及逐 1MiB 块导入：写出并读回 `67,140,128` bytes、32 个附件，最大 chunk `1MiB`，峰值 RSS `155,324,416` bytes、相对基线增量 `64,843,776` bytes；同一脚本的 512MiB 近上限测量完成导出及逐块导入：写出并读回 `537,118,805` bytes、256 个附件、513 个导出 chunk，峰值 RSS `160,153,600` bytes、相对基线增量 `70,049,792` bytes，均低于 128MiB 门槛，未随完整包线性保留内存，临时文件同样已清理，`memoryBounded=true`、`bounded=true`。Native backup 文件写入也改为处理 partial write 的 `writeAll`。
- 以上是本地/隔离运行证据，不替代真实部署、真实 Android/桌面跨设备同步、标准 Electron sandbox/native chooser、浏览器 200% 缩放、辅助技术和用户视觉验收；任务仍保持 `in_progress`。

## 实际运行命令

```text
./hako npm run typecheck                         PASS
./hako npm test                                  PASS: 203/203
./hako npm run api:check                         PASS: LUNA_API_REPRODUCIBLE
./hako npm run test:contracts                    PASS: 6/6
./hako npm run test:server-sync                  PASS: 9/9
./hako npm run server:typecheck                   PASS
./hako npm run server:test                        PASS: 26/26
./hako npm run server:build                       PASS
./hako npm run web:build                          PASS
./hako npm run package                            PASS: Electron package
./hako npm run measure:full-backup                PASS: 64MiB export/import, bounded=true
./hako npx tsx scripts/measure-full-backup.ts     PASS: 512MiB export/import, bounded=true
                                                   (near-limit run uses --bytes=512MiB)
docker compose -f compose.android.yaml build android-apk
                                                   PASS: Docker JDK21 Gradle assembleDebug + apksigner
docker compose -f compose.android.yaml run --rm android-apk
                                                   PASS: default UID APK export + SHA-256
docker compose -f compose.android.yaml --profile smoke build android-emulator
                                                   PASS: isolated luna-smoke image
docker compose -f compose.android.yaml --profile smoke up -d android-emulator
                                                   PASS: healthy Android 16 AVD / emulator-5554
docker compose -f compose.android.yaml --profile smoke run --rm android-smoke
                                                   PASS: full Android smoke result=passed, including DocumentsUI image picker and restart readback
docker compose -f compose.android.yaml --profile smoke down
                                                   PASS: disposable smoke container cleanup
./hako npm run smoke:server-restore              PASS: exact restore/restart/ETag/usage/idempotency checks
./hako npm run smoke:electron                     BLOCKED: container Chromium sandbox exit 127
xvfb-run -a ... luna --no-sandbox --smoke          PASS: process exit 0 (environment override)
xvfb-run -a env LUNA_ELECTRON_NO_SANDBOX=1 \
  npm run smoke:electron:file-input                PASS: packaged chooser/IPC/image readback
git diff --check                                  PASS
```

最新增量：

```text
./hako npx tsx --test src/sync/ledger-service.test.ts  PASS: 16/16
./hako npm run typecheck                              PASS
./hako npm test                                       PASS: 203/203
```

浏览器使用宿主 `/usr/bin/google-chrome`，因为 Docker 内 Playwright 镜像缺少 `/opt/google/chrome/chrome`。有效场景为：

```text
npm run test:web -- tests/e2e/*.spec.ts --project=chrome --project=chrome-narrow --workers=2 --grep-invert 'real server login'
  66 passed, 6 skipped (开发 Web；生产 Service Worker 场景按配置 skip)
LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/*.spec.ts --project=chrome --project=chrome-narrow --workers=2 --grep-invert 'real server login'
  72 passed
npm run test:web -- tests/e2e/react-state.spec.ts --project=chrome --project=chrome-narrow --workers=2
  12 passed (开发 Web，Escape/焦点修复后)
LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/react-state.spec.ts --project=chrome --project=chrome-narrow --workers=2
  12 passed (生产 Web，Escape/焦点修复后)
LUNA_TEST_BASE_URL=http://127.0.0.1:4174 \
  /home/wkyuu/.vscodium-server/bin/4c0b0c6cc561d2d3636d1ec250935431876ce4dc/node \
  node_modules/@playwright/test/cli.js test tests/e2e/server-account.spec.ts \
  --project=chrome --project=chrome-narrow --workers=2
  2 passed (Node 24.15.0、loopback、合成账号；含 HTTP 图片附件上传/第二浏览器刷新读回)

本次附件同步增量（Node 24.15.0、宿主 Chrome、loopback）：

```text
/home/wkyuu/.vscodium-server/bin/4c0b0c6cc561d2d3636d1ec250935431876ce4dc/node /home/wkyuu/.local/lib/node_modules/npm/bin/npm-cli.js run test:web -- tests/e2e/ledger-sync.spec.ts \
  --project=chrome --project=chrome-narrow --workers=1 \
  --grep 'encrypted image objects'
  2 passed
/home/wkyuu/.vscodium-server/bin/4c0b0c6cc561d2d3636d1ec250935431876ce4dc/node /home/wkyuu/.local/lib/node_modules/npm/bin/npm-cli.js run test:web -- tests/e2e/*.spec.ts \
  --project=chrome --project=chrome-narrow --workers=2 \
  --grep-invert 'real server login'
  68 passed, 6 skipped (开发 Web)
LUNA_TEST_PRODUCTION=1 /home/wkyuu/.vscodium-server/bin/4c0b0c6cc561d2d3636d1ec250935431876ce4dc/node /home/wkyuu/.local/lib/node_modules/npm/bin/npm-cli.js run test:web -- tests/e2e/*.spec.ts \
  --project=chrome --project=chrome-narrow --workers=2 \
  --grep-invert 'real server login'
  74 passed (生产 Web)
```
```

## 阻断或未运行

- `tests/e2e/server-account.spec.ts` 在项目默认宿主 Node `v20.19.2` 下仍会因 `better-sqlite3` 不支持该运行时而退出码 139（SIGSEGV），独立最小探针也复现；兼容 Node `v24.15.0` 的 loopback 产品 E2E 已通过，桌面/窄屏共 `2 passed`，含 HTTP 图片附件上传/第二浏览器刷新读回。真实部署 URL 和真实远端账号仍未验收。
- `./hako npm run android:sync` 已通过并生成 Capacitor 同步产物；宿主 Node/Java 环境仍缺少 `javac`，但 Docker JDK 21 的 `android-apk` build/export 已通过，故未改宿主工程配置规避。Android 16 隔离 `luna-smoke` 的完整 smoke 也已通过，包含真实 DocumentsUI 选图、离线保存和重启读取；真实跨设备图片同步尚未运行。
- 当前 Electron 包已由 `./hako npm run package` 重建并通过。标准 `npm run smoke:electron` 已运行但因当前容器未提供 Chromium setuid sandbox 而退出 127，主机直接运行是 SIGSEGV；`xvfb-run` 配合 `--no-sandbox` 的等价环境检查退出 0，仍未把它当作正式 packaged smoke 通过。新增的 `smoke:electron:file-input` 已证明打包 Renderer 文件入口与本机加密读回，但 Playwright 拦截了 chooser，Electron 原生 GTK/Windows/macOS 文件对话框仍未验收。
- 生产 Web 离线、发布 Service Worker 更新和生产构建深链已在最新重建后的本地 `dist-web` 通过桌面/窄屏 Chrome 各 34/34（排除 real server login）；真实部署 URL 和远端账号浏览器仍未验收。账号本地产品流程已在兼容 Node24 的 loopback E2E 桌面/窄屏 2/2 通过，宿主 Node20 的 better-sqlite3 SIGSEGV 仅保留为运行时兼容性记录。
- Android 隔离 AVD、硬件返回、真实 DocumentsUI 选图、SAF 完整备份和加密同步已在仅供 Luna 使用的 `luna-smoke` 容器中通过；真实跨设备图片同步仍未运行。未把此前仅用于观察鲨鱼的 ADB 授权扩展为 Luna 安装/清空授权。
- 已用合成数据生成并人工查看截图目录 `/tmp/luna-ui-redesign-20260913/`；横屏和 640px CSS 布局等价视口的几何检查已完成，未发现可见裁切/横溢出。真实浏览器 200% 缩放操作、Tab/屏幕阅读器等辅助技术、Electron 原生文件对话框及用户视觉认可仍未完成；截图仍只是本地验收证据，不是用户批准的设计稿或公开资产。

## 继续验收顺序

1. 如需扩大 Android 覆盖，补做真实跨设备图片同步；当前 APK 构建、隔离 AVD smoke 和系统选图已完成，不接触用户设备。
2. 在明确授权和可复现本地部署条件下运行 Electron smoke；生产 Web offline suite 已完成，若更换产物或部署方式再复跑。
3. 在获得平台/人工授权后，补做真实浏览器 200% 缩放、键盘焦点/对比度与辅助技术、Electron 文件对话框、Android 物理键盘及用户视觉反馈；当前合成截图和 640px CSS 等价视口结果只作为先行证据。
