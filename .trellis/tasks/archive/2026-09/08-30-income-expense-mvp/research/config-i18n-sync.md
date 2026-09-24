# RMB、i18n、隐私设置与配置同步研究

日期：2026-08-30

## 结论

当前代码可以在不改 SQLite 账本 schema 的前提下增加这四项能力。推荐新增一条独立的 settings 纵向链路：共享 schema/merge/crypto contract → main-process settings store 与 config sync service → 窄化 IPC → renderer 设置与隐私 UI。账本仍保持本地 SQLite；远端对象只保存加密后的 portable settings。

本轮没有必须由用户决定的产品分叉。以下实现边界与现有根 PRD 一致：

- 领域和持久化只保存 ISO 4217 `CNY`；RMB/人民币是本地化展示名。
- 首批 locale 为 `zh-CN`、`en`，默认根据操作系统 locale 选择，无法匹配时回退 `zh-CN`。
- 首次安装默认隐藏所有金额；配置偏好可同步，当前会话的临时 reveal 状态不可同步。
- “同步所有设置”是配置同步总开关：开启时同步全部 portable settings；关闭时不执行远端配置 GET/PUT，保留远端对象与本机设置，不把关闭动作传播到其他设备。
- 新设备仍需一次性输入 endpoint、region、bucket/prefix、对象存储凭据与同步口令。这是访问和解密远端对象的最小 bootstrap，之后不再逐项配置语言、隐私等 portable settings。

## 当前代码触点

- `src/shared/api.ts`、`src/shared/ipc.ts`、`src/preload.ts`、`src/main/ipc.ts` 组成现有窄化 IPC round trip；settings 必须沿同一路径增加用途明确的方法。
- 原实现曾在 `app.getPath('userData')/luna-ledger/` 下创建设置和本机 secret；本轮路径迁移将其收敛为当前活动目录直存，Linux 默认目录为 `~/.config/luna`，并保留旧目录的受限迁移入口。
- `src/renderer/renderer.ts` 含大量英文硬编码和手工 `${currency} ${amount}` 格式化，是 i18n、CNY 与金额遮罩的主要改造点。
- `src/shared/ports.ts` 的 `ObjectStore` 与 `CryptoProvider` 目前仅为延期 seam，接口不足以表达 ETag、not-found、条件写和错误分类，应扩展或为 config sync 建立更具体的端口。

## 建议文件边界

```text
src/shared/settings.ts              schema、默认值、decoder、portable merge
src/shared/settings.test.ts         decode/default/merge/secret exclusion
src/shared/config-crypto.ts         version化 envelope 类型和纯 decode
src/main/settings-store.ts          settings.json 原子读写与损坏回退
src/main/settings-store.test.ts     临时目录、权限、原子替换、重启
src/main/config-crypto.ts           scrypt + AES-256-GCM 实现
src/main/config-crypto.test.ts      round trip、错口令、篡改、版本/AAD
src/main/s3-config-store.ts         AWS SDK v3 GET/PUT/If-Match 适配器
src/main/config-sync.ts             bootstrap、merge、重试、状态机
src/main/config-sync.test.ts        双客户端 + fake adapter 确定性契约
src/renderer/i18n.ts                en/zh-CN catalog、t、Intl formatter
src/renderer/i18n.test.ts           catalog 键一致与 CNY 格式
```

现有 API/IPC/preload/renderer/main、测试和 package 文件同步修改。不要让 renderer import Node、Electron、AWS SDK 或本机文件路径。

## 设置 schema

本地公开配置建议采用下列逻辑结构；具体 TypeScript 类型由严格 decoder 定义：

```text
AppSettingsFileV1
  schemaVersion: 1
  deviceId: UUID                         # local only
  syncAllPortableSettings: boolean       # local policy, default false
  portable:
    locale: Revisioned<'zh-CN' | 'en'>
    hideSensitiveAmountsByDefault: Revisioned<boolean>
  syncConnection?:
    endpoint, region, bucket, prefix, forcePathStyle
  lastSync?: status/etag/timestamp/errorCode
  protectedSecrets?: safeStorage ciphertext
```

`Revisioned<T>` 最终实现为 `{ value, updatedAt }`。合并顺序比较有效 ISO timestamp；完全相同时比较规范化字段值，保证交换律、结合律和幂等性。原候选设计把 deviceId 放入 revision，但这与“设备 ID 永不上传”冲突，质量检查采用更严格的隐私边界并将 deviceId 保留在本机文件根层。远端 payload 只包含 `schemaVersion` 与 `portable`，不包含本机策略、连接、设备 ID、状态或 secret。

`settings.json` 只由 main process 读取。写入步骤：严格 decode 新值 → 写同目录随机临时文件且权限 `0o600` → fsync/close → rename → 尽力 fsync 目录。解析/校验失败时保留原文件并返回可分类错误，不把默认值覆盖到损坏文件上。

## 本机 secret 存储

对象存储 access key、secret key、session token 和可选保存的同步口令使用 Electron `safeStorage` 异步 API 加密后才可落盘。Electron 官方说明异步 API非阻塞、支持 key rotation 与暂时不可用状态；Linux 的安全语义依赖桌面 secret service，旧同步 backend 为 `basic_text` 时不受可靠保护。因此实现必须：

- 优先调用 async safeStorage，并处理 `shouldReEncrypt`；
- 在 Linux 检测到 `basic_text` 或异步安全存储不可用时，不持久化新秘密，只保留本次会话并给出明确提示；
- 测试通过注入 secret protector 完成，不把真实凭据写入 fixture、日志、错误或 snapshot；
- IPC 只允许设置/清除 secret，永远不提供“读取明文 secret”方法。

依据：[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)。

## 远端配置加密

配置 payload 不含财务记录，但仍包含隐私偏好，且根 PRD 要求对象存储只见密文。建议第一版 envelope 明确标为 `luna-config-envelope/v1`：

- KDF：Node 异步 `crypto.scrypt`，随机 16-byte salt；候选参数 `N=131072, r=8, p=1, maxmem=256 MiB`，打包运行时基准通过后锁定。
- AEAD：`aes-256-gcm`，随机且每次唯一的 12-byte IV，16-byte auth tag。
- AAD：canonical UTF-8 header，绑定 envelope version、KDF 参数、cipher 与 payload schema version。
- key/password Buffer 在 finally 中尽力 `fill(0)`；不得声称 JavaScript runtime 能保证所有副本立即清除。
- 解密顺序先严格检查 envelope 上限/版本/编码，再 KDF 与 AEAD，最后 decode payload；任何失败均不返回部分设置。

Node 文档确认 scrypt 是内存困难密码 KDF，推荐随机且至少 16-byte salt；GCM 默认 16-byte tag，IV 应不可预测且唯一。候选参数是本项目推断，仍需在目标 Electron/OS 上测量延迟与内存，不能表述为已独立审计。

依据：[Node.js crypto.scrypt / Cipheriv](https://nodejs.org/api/crypto.html)。

## S3-compatible 适配器与并发

实现使用 `@aws-sdk/client-s3` v3，只在 main process 构造 `S3Client`，支持自定义 endpoint、region、credentials 和 path-style。对象 key 固定为 `<normalized-prefix>/config/v1/settings.enc.json`；prefix 必须规范化并禁止 `..`、反斜杠和控制字符。

同步算法：

1. 开关关闭时立即返回 disabled，不发网络请求。
2. GET；404 表示首次同步，其他错误按 auth/permission/network/transient/invalid-response 分类。
3. 解密并 decode 远端 portable payload，与本地逐字段确定性 merge。
4. 如 merge 改变本地，先原子保存本地公开配置。
5. 首次 PUT 使用 `If-None-Match: *`；更新 PUT 使用 GET 返回的 ETag 作为 `If-Match`。
6. 412/409/并发 404 重新 GET、merge 并指数退避重试，最多三轮；仍冲突则报告而不覆盖。
7. 成功后保存 ETag 与同步时间，但不记录 payload、口令或凭据。

AWS 官方说明 `If-None-Match` 可防止首次创建覆盖已有对象，`If-Match` 可按 ETag 防止覆盖已变化对象；条件失败返回 412，并发删除还可能产生 409/404，条件写需 Signature V4。AWS SDK v3 官方示例包含 `S3Client`、`GetObjectCommand`、`PutObjectCommand` 与条件请求。

依据：[S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)、[AWS SDK for JavaScript v3 S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)。

## i18n、CNY 与隐私 UI

- catalog 使用 `as const satisfies Record<MessageKey, string>`；测试比较两个 catalog 的完整键集合。
- 所有 renderer 用户可见字符串（document title、label、button、option、empty/error/live status）经 `t(key, params)`；错误从 main 返回稳定 error code，由 renderer 本地化，不能返回英文句子作为协议。
- `formatMoney` 先将无损 minor-unit string 转为可格式化 decimal。当前 SQLite 范围若保证不超 `Number` 安全边界，可在边界测试后使用 Number；否则应实现 BigInt-aware decimal formatter，不能静默降精度。
- `Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: precision, maximumFractionDigits: precision })` 负责 `CNY` 和 locale 符号顺序。
- 所有金额节点通过单一 `renderSensitiveMoney` 输出。隐藏值使用固定 `••••`，不得把真实值放在 `aria-label`、`title`、dataset、tooltip 或 live region；标签（收入、支出、净额）仍可见。
- 默认隐藏来自持久化设置；会话 reveal 初始化为其反值，但用户点击 reveal 只改 renderer memory。切换默认设置与临时 reveal 必须是两个清楚的动作。

## 验证矩阵

- schema：缺失、未知、类型错误、未来版本、损坏 JSON、原子写失败、重启恢复。
- i18n：键一致、无主要硬编码文案、插值 escaping、zh-CN/en CNY、日期/月格式。
- 隐私：首次默认隐藏、重启保持、会话 reveal 不保持、DOM/ARIA/live region secret scan。
- crypto：固定测试向量、随机 round trip、错误口令、bit flip、tag/IV/salt/version/AAD 错误、payload size 上限。
- sync：两个独立 settings store，首次创建、下载恢复、并发修改、重复同步、开关关闭零网络、412/409/404 重试、auth/network 分类。
- secrets：扫描远端 bytes、settings JSON、日志、renderer DTO 和错误，确认无 access/secret/session token/口令/主密码/路径。
- endpoint：用受控 MinIO 或等价 S3-compatible 服务跑 conformance；只声明实际记录的产品和版本，不用 fake adapter 证明供应商兼容。
- packaged Electron：覆盖 settings file、safeStorage backend 状态、renderer→IPC→settings round trip、CNY/i18n/隐私；视觉和辅助技术仍需人工验收。

## 实施风险

- Electron safeStorage 在部分 Linux 环境可能退化；必须 session-only 降级，不能把 `basic_text` 当安全加密。
- S3-compatible 服务对条件头、ETag、path-style 和错误语义可能不同；支持声明必须由 conformance 结果限定。
- KDF 参数影响低端设备延迟和内存；打包运行时基准是锁定 v1 参数的门槛。
- 当前 renderer 单文件较大，i18n 改造容易遗漏；应以 catalog 键、DOM 文本扫描和 packaged smoke 共同覆盖。
- 本轮同步的是配置而非账本，UI 必须明确显示“账本仍仅保存在本机”。
