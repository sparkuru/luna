# Luna 漏洞与可更新版本核查（2026-10-22）

本文保留第一轮升级前调查快照。用户随后授权更新、验证和提交；实际变更见
[npm 实施](npm-implementation.md)、[容器实施](container-implementation.md)，
当前验证与授权边界见 [validation.md](../validation.md)。下文「当前」均以初始调查基线为准。

## 结论

**有更新必要，优先安排安全补丁，不建议把所有依赖一次升到 latest。**
本次检查仓库提交 `73b4384`，未连接部署服务器，以下「当前」均指仓库声明/锁定版本，
不代表线上实际安装版本。近期窗口为 2026-07-24—2026-10-22；MinIO 等仍未修复的旧公告也纳入。

全量 npm audit：36 个受影响依赖项（critical 1 / high 15 / moderate 20），对应
32 个去重 GHSA；这些数量包含传递影响，不能理解成 36 个独立漏洞或 36 个可利用入口。
`--omit=dev` 为 3 项（Capacitor Android、fast-uri、Fastify，各一个等级）。
该生产依赖集合同时包含客户端原生依赖，不等于 API 镜像的实际运行集合。
Electron 虽列在 devDependencies，最终桌面应用会携带它，不能因此降低其维护优先级。

## 优先更新表

| 优先级 | 当前版本 / 所在位置 | 推荐目标 | 原因及项目适用性 |
| --- | --- | --- | --- |
| P1，优先发布 Android 修复 | Capacitor android/core/cli `8.5.0`，package.json / lock | 三者同步 `8.5.3`；该漏洞最低修复 `8.5.1` | [CVE-2026-103922 / GHSA-rvm3-566m-v7fv](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv)，critical 9.3。内部代理导航可将远程内容加载到应用同源；关闭 CapacitorHttp 也不足以规避。需要诱导用户在 WebView 内激活链接；当前 React 普通文本与固定应用链接降低投递面，未证明可在 Luna 中利用。修复须重建并重新分发 APK。 |
| P1 | Node `22.22.0`，三个 Dockerfile、compose.yaml、docker/compose.android.yaml | `22.23.4-bookworm` / `22.23.4-bookworm-slim`，保留现有发行版 | [10 月 21 日官方安全发布](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)修复 22.x 的 DNS NUL、TLS 主机校验、Brotli 越界写等，含 CVE-2026-105482 / 106069 / 111497。未在项目找到直接 Brotli 解码调用，不据此宣称已存在远程代码执行入口。官方镜像清单有两个目标 tag；镜像拉取、digest 与构建未实测。 |
| P1 | fast-uri `3.1.6` 与两处 `4.1.4`，package-lock.json | 同主版本分别至少 `3.1.8` / `4.1.5`；当前可用 `3.1.9` / `4.2.3` | URI 序列化/主机混淆：[GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3)、[58mr-gqgx-xq4g](https://github.com/advisories/GHSA-58mr-gqgx-xq4g)、[hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj)、[jvvf-x445-j334](https://github.com/advisories/GHSA-jvvf-x445-j334)。API 的 AJV / JSON 序列化依赖包含它；未证明用户输入能触发受影响调用。特别注意 GitHub 元数据对 3.x 的 hrr3 还要求 `3.1.8`，不能只按 audit 个别记录升到 `3.1.7`。 |
| P1，桌面安全维护 | Electron `44.0.0` | 同主版本 `44.9.3`，暂不跨到 `45.0.0` | [CVE-2026-113800 / GHSA-fw47-9c62-h3vw](https://github.com/electron/electron/security/advisories/GHSA-fw47-9c62-h3vw)最低修复 `44.3.0`。Luna `src/main.ts:302` 默认拒绝权限，未满足该 HID/USB origin 授权场景；仍应获取 Chromium 修复。[44.9.3 发行说明](https://releases.electronjs.org/release/v44.9.3)内置 Node `24.22.0`，低于 10/21 Node 补丁 `24.22.1`；**不能声称它已经覆盖最新 Node 安全批次**，须跟进 Electron 后续回移。 |
| P1，开发环境 | Vite `6.4.3` | 同主版本 `6.4.5` | [GHSA-9jrq-w75r-8gcw](https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw)、[rq7h-c2jc-7f22](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22)及三个 launch-editor 公告，最低修复 `6.4.4`，npm 已发布 `6.4.5`。Web 配置未使用 custom middleware；Linux 容器对外监听，文件越界还需特定路径碰撞，未证明当前源码满足全部条件。Windows 专属问题不适用于当前 Linux 容器。生产静态 nginx 不运行 Vite dev server。 |
| P1，容器维护 | nginx `1.29.8-alpine3.23` | 推荐稳定线 `1.30.6-alpine3.24`；主线可选 `1.31.8-alpine3.24` | [官方漏洞表](https://nginx.org/en/security_advisories.html)与[1.30 更新记录](https://nginx.org/en/CHANGES-1.30)涵盖 rewrite、map/regex、HTTP/3、TLS 等修复。10/14 批次最低为 `1.30.6` / `1.31.7`。现有配置只监听 HTTP 8080，未启用 HTTP/2、HTTP/3、TLS、alias+rewrite、AIO/SSI；map 有 regex，但未证实满足其精确触发条件。镜像 tag 来自官方清单，未验证拉取与非 root 运行兼容。 |
| P2，可与 API 补丁一起做 | Fastify `5.12.3` | `5.12.7`，最低修复 `5.12.5` | [CVE-2026-92081 / GHSA-4mh8-r7rc-xpvc](https://github.com/fastify/fastify/security/advisories/GHSA-4mh8-r7rc-xpvc)。HTTP/2 response trailer 可导致进程异常；`src/server/app.ts:66` 未启用 HTTP/2，未发现 reply.trailer 调用，当前配置不满足该条件。 |

供应商公告时间与 GitHub 全局数据库入库时间不同：Capacitor 官方页 8/31、数据库
10/05；Electron 官方页 10/15、数据库 10/21；Fastify 官方页 9/16、数据库 9/30。
原始两种日期分别保留，不能把入库时间称为首次披露。

## MinIO 需要独立决策

固定版本为 `RELEASE.2025-09-07T16-13-09Z`，digest
`sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`。
根 compose、docker/compose.minio.yaml 与 docker/Dockerfile.server 共用它，后者还从中复制 mc。

| 公告（官方日期） | 判断 / 修复边界 |
| --- | --- |
| [GHSA-hv4r-mvr4-25vw](https://github.com/minio/minio/security/advisories/GHSA-hv4r-mvr4-25vw)（4/14）、[GHSA-9c4q-hq6p-c237](https://github.com/minio/minio/security/advisories/GHSA-9c4q-hq6p-c237)（4/11） | 当前版本命中：知道有效 access key 的请求者可绕过 unsigned-trailer 签名校验写对象。官方修复是 **AIStor** `RELEASE.2026-04-11T03-20-12Z`，不是同仓库社区镜像的新 tag。 |
| [GHSA-jjjj-jwhf-8rgr](https://github.com/minio/minio/security/advisories/GHSA-jjjj-jwhf-8rgr)（2025-10-16） | 受限 service-account / STS session policy 越权；公告列修复 `RELEASE.2025-10-15T17-29-55Z`，需核实发行渠道。Luna 创建带 policy 的受限 API key，此边界相关；未验证其能否执行 own-account 操作。 |
| [GHSA-h749-fxx7-pwpg](https://github.com/minio/minio/security/advisories/GHSA-h749-fxx7-pwpg)（4/07） | S3 Select CSV 内存耗尽；当前版本命中，需 Put/Get 与 S3 Select 路径。Luna 未调用 S3 Select；官方修复 AIStor `RELEASE.2025-12-20T04-58-37Z`。 |
| [GHSA-3rh2-v3gr-35p9](https://github.com/minio/minio/security/advisories/GHSA-3rh2-v3gr-35p9)（3/27） | 普通 PutObject 请求可注入内部 SSE 元数据令对象不可读；当前版本命中，需要有效写权限。Luna 未设置这些复制头；官方修复 AIStor `RELEASE.2026-03-26T21-24-40Z`。 |
| [GHSA-xh8f-g2qw-gcm7](https://github.com/minio/minio/security/advisories/GHSA-xh8f-g2qw-gcm7)（4/25） | 版本范围包含当前版，但只影响分布式 internode route；当前单节点 `minio server /data/minio` 不满足条件，不能当作 Luna 的未认证任意文件读取。 |

[官方仓库](https://github.com/minio/minio/security/advisories)标为 2026-04-25 归档。
根 Compose 没有发布 9000/9001，API key 与 root 分离；这些是缓解，不是修复。
不据仓库配置推定线上同样隔离。推荐保持 S3 内网边界，并另行选择受维护的 S3 服务
或评估 AIStor 的许可/迁移条件；本轮不替用户决定产品或改真实存储。
若选择 AIStor，至少覆盖 2026-04-14 累积修复并重新核对当天公告，不只取单项最低版本。

## 构建树：补丁、未修复项与 audit 建议的局限

| 锁定版本 | 建议 / 证据 |
| --- | --- |
| js-yaml `4.3.1`，已有 override | 将 override 评估为 `4.3.2`。[GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)，合并空源时 CPU DoS。不能照 audit 的建议把 openapi-ts `0.99.0` 降到 `0.97.0` 来绕开依赖；须保留生成器与 SDK 再现性。 |
| undici `7.29.0`，dev 树 | 至少 `7.29.1`，同线可用 `7.30.1`；10 个 GHSA，含 [BalancedPool TLS 选项丢失](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3)。这是 npm 包；Node/Electron 内置 undici 必须随运行时更新，不能用 npm override 代替。 |
| brace-expansion `1.1.18` / `2.1.4` / `5.0.9` | 保持各主版本，分别 `1.1.21` / `2.1.7` / `5.0.12`，三个递归/复杂度 DoS 公告。不可把所有主版本强制压到 5。详见 github-advisories.json。 |
| source-map-js `1.2.1` | 至少 `1.2.2`；[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。 |
| ip-address `10.7.0` | 至少 `10.7.1`；可用 `10.7.4`。地址族比较与长输入 DoS，两条 GHSA。 |
| http-cache-semantics `4.2.0` | [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)无 first_patched_version；npm 有 `4.3.0`，但本轮没有确认其修复声明，不把存在新版本等同已修复。 |
| braces `3.0.3`；sprintf-js `1.1.3` | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)与[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)在官方数据库未给修复版，npm latest 仍为当前版本。须尝试由父依赖移除路径或记录不可达/未修复风险，不能承诺全部 audit 清零。 |
| Forge 三项 `7.11.2` | 当前稳定新版 `8.0.1`，属于主要版本迁移。audit 推荐它以移除旧依赖路径，不证明每个内部库本身修复。先处理能同线更新的传递依赖，再单独验证 Forge 8 的插件 peer 条件、ZIP override、native ABI、产物和默认 sandbox smoke。 |

`tar=7.5.22`、`tmp=0.2.7`、xcode 的 uuid override 和 packager 的 ZIP alias
本轮未被 audit 命中；这只说明当前数据库未报告匹配项，不是全量安全证明。

## 其他可用更新（未因本轮公告列为紧急安全修复）

清单实测 37 个 npm 直接依赖、864 个锁定依赖路径。
完整声明/锁定对照在 locked-inventory.json；outdated 返回 30 项，详见 npm-outdated.json。
固定声明的 wanted 等于当前版本不表示没有更新；latest 表示注册表当前标签，不代表兼容建议。

| 依赖 | 当前 → 注册表 latest |
| --- | --- |
| AWS S3 SDK | `3.1121.0 → 3.1155.0` |
| @fastify/swagger | `9.8.1 → 9.9.2` |
| React / React DOM | `19.2.4 → 19.3.1`，需要配对 |
| TanStack Query / Router | `5.102.8 → 5.104.5` / `1.170.33 → 1.170.45` |
| SQLite WASM | `3.53.0-build1 → 3.54.1-build1`；账本持久化、旧数据与 Android OPFS/IDB 路径须单验 |
| Radix alert-dialog / dialog / slot | `1.1.23 → 1.2.1` / `1.1.23 → 1.3.1` / `1.3.3 → 1.5.0` |
| Playwright | `1.63.0 → 1.64.1`；Docker dev 镜像浏览器安装和 hako tag 必须联动 |
| Lucide / tailwind-merge | `1.42.0 → 1.61.0` / `3.5.0 → 3.7.0` |
| TypeScript / Vite / React plugin | `5.9.3 → 7.0.2` / `6.4.3 → 8.3.5` / `4.7.0 → 6.1.2`，跨主要版本，不纳入首批补丁 |
| tsx / fake-indexeddb | `4.23.13 → 4.23.15` / `6.2.5 → 6.2.6` |
| @types/node | 锁定 `22.20.1`，当前声明可用 `22.20.5`；latest `26.6.5` 不应直接用于 Node 22 |

未出现在 outdated 的直接依赖（包括 better-sqlite3、Tailwind、noble/hashes）不据此强行改版。

## Android / 基础镜像版本

来源与筛选后的元数据保存在 platform-versions.json；镜像 tag 来自 Docker official-images
清单，未拉镜像或检查远端 manifest/digest，不能宣称这些镜像已在本机可运行。

| 当前 | 同线候选 / 边界 |
| --- | --- |
| Temurin `21.0.10_7-jdk-noble` | 官方清单 `21.0.12.1_1-jdk-noble`；仅构建链，未逐个核查 JDK CVE。 |
| Alpine `3.23.3`（APK export） | 同线 `3.23.7`，最新线 `3.24.3`；export 不属于在线服务。未做 OS 包漏洞扫描。 |
| Gradle wrapper `8.14.3` | 同线 `8.14.6`；latest `9.8.2`，跨主版本须和 AGP/Capacitor 联验。 |
| AGP `8.13.0` | 同线 `8.13.2`；最新稳定元数据有 `9.4.1`，先不跨主版本。 |
| AndroidX WebKit `1.14.0` | 元数据可用 `1.18.0`；它不是实际浏览器引擎，升级不替代设备 Android System WebView/Chrome 安全更新。 |
| SDK API 36、build-tools 35.0.0；CLI tools 15859902；emulator 15507667 | 本轮未查到完整已验证的升级组合，不声称是最新或无漏洞；保留 checksum 约束，后续设备/构建任务再核对。 |

## 建议批次与验收

1. 首批：Capacitor `8.5.3`、Node `22.23.4`、Electron `44.9.3`、Vite `6.4.5`、
   Fastify `5.12.7`，补齐 fast-uri、js-yaml、undici 等同线传递补丁。
   对 Node 内置库和 Electron 回移缺口分别追踪，不用 npm audit 代替。
2. 容器批次：nginx 稳定线 `1.30.6-alpine3.24`，构建用 JDK/Alpine 补丁；重新确认 tags/digests。
3. 独立决策：MinIO 维护路线、Forge 8，以及尚无修复的构建依赖；产品/许可/存储变化不能混入补丁批次。
4. 一般功能依赖及 TypeScript/Vite 主要版本迁移后置。

后续若授权升级，须修改当前 PRD 的只读范围并审阅最终设计后再 start。预期至少运行：
root/server 类型检查、共享与 server/contract/server-sync 测试、SDK api:check、Web build、
桌面/窄屏离线与账户/备份回归、Electron 原生产物与 sandbox smoke、APK 构建及持久化回归。
镜像变更须覆盖 nginx 非 root/read-only、CSP/COOP/COEP、health 与 API 代理；
S3 变更须用隔离合成数据覆盖受限 key、条件写、恢复和现有双 provider 契约。
这些是未来验收要求，本轮没有运行或声称通过。

## 证据与限制

- 执行 `./hako npm audit --package-lock-only --ignore-scripts --json`、同命令加 `--omit=dev`、
  `./hako npm outdated --json`；均完成，退出码 1 分别表示发现漏洞/过时包。
- 最初 sandbox 不能访问 Docker socket，使用已有项目 wrapper 的受控提权重试成功，
  无自动审批拒绝、无依赖安装或修复。一次元数据脚本 CJS/TLA 格式错误，改为 ESM 后成功。
- GitHub Advisory API 32 项中 29 项成功，3 项 403（共享出口限流）；对应的 Vite 两项
  与 launch-editor 第三项均另行读取官方维护者公告网页。失败原样保留在 github-advisories.json。
- npm 与 GitHub 对部分严重性/范围不同，以各自字段保留，并优先采用更完整修复范围。
- 不使用凭证读取私有来源；未读真实账本、未连接 VPS 或 Android、未拉取新镜像。
- 未做供应链恶意包审计、原生/Maven 全图解析、系统包扫描或利用验证；公开数据库也可能滞后。
- 当前结论是版本与条件核查，不是独立生产安全审计。human-not-needed 适用于本次文档交付；
  不代表未来安全升级、许可或迁移已经验收。

原始文件：npm-audit-all.json、npm-audit-prod.json、npm-outdated.json、github-advisories.json、
npm-security-versions.json、platform-versions.json、locked-inventory.json。
