# 2026-09-05 跨平台整改验证（持续更新）

## 当前可用交付（最终验证，覆盖下方历史检查点）

代码与可用制品已完成；提交/归档保留在项目规定的定向人工试用与提交确认门禁。
Web 服务当前为 `http://localhost:8080`（测试使用127.0.0.1，二者本地数据隔离）。
Android APK：`artifacts/android/luna-debug.apk`，4,265,411 bytes，SHA256：
`4be348c7bad5844351dad10f9e6c09b8d0568b74f3c7d531c096f56f71ccc7e5`。

| 最终门禁 | 实际结果 |
| --- | --- |
| 完整单元/集成测试 + typecheck | **143/143**，严格类型检查通过；无独立 lint 配置，diff whitespace检查通过 |
| 正式 Compose Web | 构建健康；镜像 `sha256:5466c5b39cf2156dc969fa38a3a3c5146827e0823151654d6be4cdff6c188486` |
| 正式 Web Playwright | **42/42**，桌面+375px，18.0s |
| Electron build + packaged smoke | 通过；SQLite/IPC重开、设置、CNY/隐私、加密备份导入与会话隔离 |
| 固定 MinIO 真实服务 | 配置GET8/PUT2，账本GET13/PUT6，含2次预期条件拒绝；两个确切对象删除并复查 |
| Android16/API36 安装后运行 | 全部14项检查通过，见下文；非桌面Chrome替代 |
| 新依赖/安全检查 | 精确@noble/hashes2.4.0，完整安装audit0漏洞；无运行时传递依赖 |

Playwright覆盖：离线冷开/新增/reload，坏数据与写失败保护，多标签和过期
交易/预算拒绝，SW升级等待/失败回退，备份UI与显式冲突，实际SDK签名/CORS/
条件请求，Node↔浏览器两种密文格式，设置开关零IO/会话秘密，配置与账本同步
保留财务草稿，键盘skip link/按钮/原生details，reduced-motion及窄屏溢出。
此前同源双标签高频复测40/40也保留有效证据。

Android烟测先验证目标仅为隔离`luna-smoke`模拟器，再安装/清空其合成数据。
实际覆盖：断网首次启动、离线记账、进程重启恢复、汇总隐私、无SW、无横向
溢出、WebView SDK HTTPS协议夹具、Android→Node账本解密、Node→Android合并、
同步后离线重启、原生SAF取消、SAF实际文件读取解密、v1设置Node↔Android互通、
设置离线重启。截图在`artifacts/android/android-*.png`，最终中文页面已人工查看。
此处HTTPS是Playwright控制的协议夹具，不宣称APK直连真实TLS供应商；MinIO
是真实服务但为本地HTTP测试端。没有放松APK明文流量/TLS限制。

### 修复与失败证据

- QEMU不是APK失败：继承nofile1,073,741,816导致逐FD扫描，被35s启动watchdog
  主动触发SIGSEGV。限为65536后49.616s完成真实guest启动。
- 缺少`ACCESS_NETWORK_STATE`让实际WebView网络状态不更新；补权限后原始断网
  断言通过，未mock navigator.onLine。
- 强制重启后按包名可能取得旧WebView缓存；烟测改为等待实际新PID并匹配PID。
  无Luna crash buffer记录，修复的是调试器重新连接边界。
- 首次SAF被启动时遗留SystemUI ANR遮挡。日志时间04:12:48、原因SystemUIService
  waited21109ms，早于导出。只对已确认SystemUI弹窗执行一次Close app恢复，之后
  原始取消/保存/读文件/解密全链通过；未自动忽略任意应用ANR。
- 原生导出不再假定Blob下载等于落盘。SAF输出流关闭后才resolve，取消不会
  报成功；大密文从PluginCall移出以避免Activity Bundle大小上限。
- IDB取消覆盖open/queued/put/commit；预算捕获有效来源heads；配置同步合并
  最新状态并在禁用后阻止晚到提交，均有专门回归。详见bug-analysis文档。

### 动效决定与边界

未引入anime.js：现有180ms焦点/hover反馈足够，不为记账和金额汇总增加
时间线依赖或数字滚动；reduced-motion下过渡降至0.01ms并有真实浏览器检查。

未验证macOS/Windows实体主机、Android实体手机/旧WebView矩阵、真实远程TLS
供应商、辅助技术完整体验或独立安全审计。APK是debug签名，不是商店发行。
设置scrypt约128MiB工作表的低内存设备表现需要实际手机试用。
账本历史上限8MiB/10000修订，尚无压缩与可信反回滚检查点。
MinIO同一Node客户端连续条件失败曾观察到第二次被归类为network；独立竞争
客户端和最终真实服务门禁通过，但未宣称该连接复用观察已修复。失败保留本地
数据且可手动重试。浏览器数据仍需定期加密备份，不能视为不会逐出的存储。

### 定向人工试用（提交前门禁）

在自己的浏览器与Android手机各建立/恢复同一个账本（第二端先恢复，不先建
不同工作区），断网各记一笔，再用自己的HTTPS S3端点同步。检查语言/隐私
同步、SAF备份保存/重导入和实际字体/触控。若失败，返回平台/WebView版本、
操作顺序、去敏错误截图；不要发送访问密钥或密码。macOS/Windows用户另检查
Compose首次启动。这是环境/主观体验的残余门禁，不把自动化结果称为全设备保证。

## 先前检查点日志（历史；以下“待完成”不是当前状态）

## 已验证

- `docker compose up -d --build --wait`：本机 Linux amd64 镜像构建并健康；Node22.22.0-alpine3.23 构建，nginx1.29.8-alpine3.23 非 root、只读文件系统、回环8080，无主机源码卷。
- `LUNA_TEST_BASE_URL=http://127.0.0.1:8080 npm run test:web`：升级 Vite6.4.3 / Playwright1.63.0 后 **22/22**，Chrome桌面及375px窄屏。覆盖离线关闭页面后重新打开、离线新增并reload、默认隐私、保存失败保留表单且重试只保存一次、损坏数据保留、localStorage→IndexedDB迁移只做一次、过期编辑拒绝、双标签新增、SW更新等待旧页关闭及失败更新保留旧资源。
- `LUNA_TEST_BASE_URL=http://127.0.0.1:8080 npm run test:web -- --grep 'two tabs' --repeat-each=20 --workers=2`：最终依赖稳定后 **40/40**，无记录丢失。
- `./hako npm test`：账本传输接入前完整集成状态 **78/78**；后续账本接口/迁移/加密/传输新增测试后待最终全量更新计数。
- `./hako npm run build`：类型检查、Forge Vite targets、原生依赖及Linux Electron打包通过。
- `xvfb-run -a npm run smoke:electron`：`LUNA_PACKAGED_STORAGE_SMOKE_OK`；startup、窄bridge、settings、CNY/i18n/privacy、config crypto、SQLite关闭重开通过。
- 安全依赖整改安装后完整 npm audit：**0 vulnerabilities**（原32：1 critical/24 high/4 moderate/3 low）。更新Vite6.4.3、Playwright1.63.0及有范围的tar/tmp/uuid/官方Electron ZIP提取器覆盖；不升级到Forge预发布。实际打包已通过。
- `./hako env LUNA_NATIVE_FROM_SOURCE=1 npm run build`：开启force/buildFromSource路径的类型检查、Electron原生依赖构建与打包通过。
- 强制源码构建后再次 `xvfb-run -a npm run smoke:electron` 通过。`./hako npm run make` 在ZIP阶段报`zip ENOENT`（Node镜像无zip），应用构建已通过；随后宿主现有zip执行 `npm run make -- --skip-package` 对刚刚的同一产物生成ZIP成功。这个制品步骤不代表宿主Node20成为开发基线。
- 人工查看由Playwright生成的中文桌面/窄屏截图：`/tmp/luna-web-desktop-review.png`、`/tmp/luna-web-mobile-review.png`；正常卡片/表单/隐私/状态可见，无横向溢出。页面仍有过长的桌面专属禁用同步表单，应在实际同步UI集成时整理。

## 失败与纠正证据

- Android模拟器37.1.11在KVM/软件CPU、关闭Vulkan、Docker init与SwiftShader等受限配置，以及官方校验的36.6.11上均在客体内核启动前退出139；未OOM、未安装APK。当前保留停止容器日志，不把APK静态校验宣称为运行通过。
- 账本接入分项：SQLite旧测试+新图迁移/分支冲突/回滚 **11/11**；共享图+新版Web IDB **40/40**；WebCrypto独立互通/篡改/输入限额 **12/12**；实际SDK签名条件HTTP和流式限额 **3/3**；真实加密+模拟CAS账本服务 **11/11**。这些不是浏览器CORS/Android运行完成证明。

- 原localStorage适配器吞写异常、坏数据自动删除且暴露内部引用；整改为明确错误、保留原文、API返回隔离数据。
- 初次localStorage+Web Locks版正式E2E **15/16**：窄屏双标签丢失“Tab one”。据此改为IndexedDB事务，不能用同进程fake Storage结果证明跨页面安全。
- 首轮40次并发复测 **32通过/8 worker异常退出**发生在依赖安装切换期间，不计为完整通过。安装稳定后重新跑40/40；以后运行测试期间不要修改node_modules。
- 首次Electron烟测SIGSEGV，隔离进程日志明确 `Missing X server or $DISPLAY`；已有Xvfb下同一产物通过，不通过禁用sandbox处理。

## 尚未证明

- macOS/Windows物理主机运行未实测；Compose无主机脚本/绝对路径和Linux镜像仅支持可复现路线，不能称已跑三台主机。
- Android当前APK是在线账本接入前构建，路径`artifacts/android/luna-debug.apk`，SHA256 `fcd4c3f1451d9e3b59456c51cceac81511a381238082d843407b23d7b4a0d7f9`。后续需要重建；APK静态检查不代替安装/离线重启证据。
- 账本图、SQLite/IDB接入、加密与条件传输服务已有分项验证；UI和浏览器跨端实测在进行，不能把已有设置同步或图单测当完成。
- 未做独立密码审计、物理Android手机/旧WebView矩阵、浏览器数据逐出恢复等广泛保证。
