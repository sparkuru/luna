# 图片附件：存储、加密同步与完整备份契约

2026-09-12 修订2。**拟实施协议，不是现有能力或安全审计结论。** 用户已同意图片进入加密备份和跨设备同步。本文件是后续实现唯一选择的方向；不得自行改成账本base64大JSON、仅本地图、双远端账本头或无图备份。实现校准：当前 Native schema 为 5、Web state 为 4、IndexedDB 兼容库为 2；下文原先写作 schema4/Web3 的目标版本已按现有基线迁移为上述连续版本，旧 Native2/profile3、Web2、IDB1 仍是兼容输入。

## 1. 现有证据与方案

证据见 research/attachment-feasibility.md；主会话已复核 shared/api、ledger-crypto、preload、main/ipc、main/store、server/schemas/http、http-object-store 和 Android LedgerBackupPlugin 的关键限制。

选择：**v2账本图保存附件描述符；不可变图片密文单独存储；完整备份打包加密清单与所有引用密文。** 保留唯一CAS账本头、因果合并、历史和冲突语义。图片每份生成独立随机密钥，避免离线设备同时升级生成不同账本根密钥而无法合并。

上限（实现必须以同一共享常量及服务端广告能力校验）：

| 项目 | 限额/默认 |
| --- | --- |
| 图片原始输入 | JPEG/PNG/WebP静态图，≤20MiB，≤40,000,000像素；先有界头部校验再解码 |
| 规范化输出 | JPEG（不透明）或PNG（透明）；最长边2048；≤2MiB；不能达到上限则提示选择更小图片，不无限重试 |
| 每交易 | 最多9个有序附件；重复选同一图也按独立附件计，首版不跨账本去重 |
| 单附件密文 | 输出字节+16字节GCM tag，上限2MiB+16 |
| 每账本附件 | 512MiB密文，含全部历史、已提交未发布及占用中的远端保留空间；唯一ID计数≤10,000 |
| 每账号服务端 | 默认2GiB密文+预留；服务器可配置更低/更高，客户端读取有效限额，不承诺所有部署固定容量 |
| 图文账本 | 继续8MiB明文、12MiB加密JSON，不因图片提高 |
| 备份清单 | 明文≤16MiB，密文≤16MiB+16；完整文件≤544MiB |
| 桥接/文件流块 | 二进制≤1MiB，Android base64承载时解码后仍≤1MiB；一次一块，序号确认后继续 |
| 图片传输 | 并发2，每对象60s，失败有界重试，整个批次不套原graph固定60s超时 |

512MiB仅容量准入上限；设备空间不足可提前失败，事务不丢数据。已提交附件不自动GC，所以历史占用可增长至上限，设置提供用量与说明；到上限仍允许无图记账。远端未发表完整上传也占额，用户重试复用同ID，不自动删除历史释放空间。

## 2. DTO与密钥边界

### 2.1 宿主内部格式

图 `schemaVersion:2`，仍为workspace+revisions。每个内部StoredTransaction value增加有序attachments数组，旧记录迁移为[]。其余financial字段/ID/parents/revision不改变。公共Transaction与内部StoredTransaction必须是不同类型/decoder；后者接受带key/iv描述符，前者只接受安全Attachment DTO。禁止把一个字段可选的大类型同时用于host存储与renderer，从而靠组件约定隐藏密钥。

附件内部描述符字段固定：id（小写UUIDv4）、workspaceId、mime（image/jpeg或image/png）、width、height、byteLength（规范化明文）、cipherByteLength、cipherSha256（64位小写hex）、cryptoVersion=1、key（32字节canonical base64）、iv（12字节canonical base64）。描述符只在host内部、local graph、加密后的远端/备份清单中出现。相同ID在任一历史引用必须描述符完全相同，不同即整体拒绝；不要只比较当前head。

每图新随机key/iv/id；WebCrypto AES-256-GCM tagLength128，AAD是UTF8固定键序JSON：format='luna-attachment'、version=1、workspaceId、attachmentId、mime、width、height、byteLength。AAD不含cipherSha256以避免循环；cipherSha256验证完整ciphertext+tag。一次加密后保存原密文字节，重试/同步/备份重复使用，不用同key/iv重新加密变化的内容。原始文件名、EXIF/GPS不进入图或服务器。图片密钥由加密账本保护，不依赖网络或已登录状态；本地数据库与当前账本一样未承诺整库静态加密。

v2账本信封format仍luna-ledger-envelope，version=2、payloadSchemaVersion=2；KDF保持PBKDF2-SHA256/600000/random16 salt，AES-GCM/random12 iv/128 tag，现有固定顺序AAD包含新版本。v1读取路径保持原样，不先改版本再用旧AAD解密；明确decryptV1→验证→normalize，v2独立验证。

### 2.2 Renderer安全投影

现有getLedgerDocument/mergeLedgerDocument原始图能力**移出公开LunaLedgerApi/preload/IPC**，保留host内部LedgerDataPort，测试和sync用内部端口。getLedgerConflicts改安全DTO，resolveLedgerConflict只接收现有head选择并返回安全结果/void。getSnapshot/create/update/delete回执、onChange/server状态都必须递归保证无key/iv/raw graph泄露。

安全附件DTO：id、mime、width、height、byteLength、availability（local/downloading/unavailable/error），不含key/iv/路径/服务器对象地址。冲突DTO保留kind/entityId/headId/parents及金融字段和安全附件列表；预览选中候选时附带headId，host核实该附件确实在本账本该候选中。

公开API新增方向（名字可按工程风格等价，但输入/输出/边界不可遗漏）：

| 操作 | 输入 | 输出/约束 |
| --- | --- | --- |
| stageTransactionImage | draftSessionId、规范化bytes、mime/尺寸 | draftToken+安全元信息；host再次验证内容；与当前profile/generation绑定 |
| readDraftImage | draftToken | 有界预览bytes；不返回密钥或路径 |
| discardDraftImage | draftToken | 仅未提交staging可移除，重复调用幂等 |
| readTransactionImage | transactionId、attachmentId、可选conflictHeadId | 有界解密bytes+mime；授权本地引用，验证GCM/digest |
| create/updateTransaction | 原金融draft+有序attachmentRefs（existing id或draftToken），update带expectedRevision | host解析引用、原子提交，返回安全Transaction |
| getAttachmentUsage | 无 | 当前scope已用/限制/待下载计数；非全系统路径 |
| retryAttachmentDownload | transactionId、attachmentId、可选headId | 显式已连接时重试；未连接给可操作状态 |

保留多分类编辑锁；普通交易编辑必须保留所有原附件，不能默认[]导致悄悄删除。stage失败不向draft添加假附件。预览ObjectURL由呈现端创建并在关闭/换profile/replacement撤销；不将解密bytes放Query长期缓存/localStorage/SW缓存。Web同源程序不是恶意XSS的隔离边界，不宣称仅移API即获得XSS防护。

选图职责明确：Web/Electron使用标准file input（multiple与accept为提示，host仍验证）；Android使用窄ImageInput原生插件或等价现有桥，ACTION_OPEN_DOCUMENT+CATEGORY_OPENABLE、image/jpeg/png/webp、最多9个选择结果，返回临时handle和有界块，不返回content URI/路径，不持久化全相册权限。通过readSelectedImageChunk(handle,sequence)读取≤1MiB块，close释放；规范化worker收到完整但≤20MiB源，检查像素后解码。取消、权限拒绝、Activity recreation必须显式恢复草稿，不自动重新打开选择器。若现有Capacitor file input能通过同样的真实AVD验收，可复用其实现，但对外仍封装为选图适配接口，不能将“Web input可点”当Android已支持。

## 3. 本地数据库、原子写与迁移

Native schema从现有2或profile模式3经当前基线迁移至5；保留profile_metadata并更新构造逻辑，禁止旧constructor再把5写回旧版本。Web状态从2经当前基线迁移至4（settings保持既有格式），SQLite-WASM worker与状态版本共同守护重开；IDB兼容database version1→2，沿原database新增对象仓库而非另建数据库。

每profile数据库增加附件BLOB表/IDB store和staging：attachment_id、ciphertext、length、sha256、state(staged/committed)、draft_session_id、created_at。key/iv与内部graph描述符同作用域；staging保存内部描述符供提交解析。另有backup/import staging、job元信息。未下载附件仅有graph引用和availability派生，不创建伪空字节。

- 规范化/加密/哈希在DB事务外；staging持久化不等于账单保存。
- 创建/更新事务同时验证revision、scope、token、额度、graph全部ID一致性，promote所用staging，append graph revision、写projection及pending。SQLite同一事务；IDB对state、metadata、attachments共同readwrite事务。任一失败全部回滚，先前graph不变、draftToken保留可重试。
- Worker RPC增加stage/read/commitAttachments/importPromotion等；expectedRaw/metadata与generation仍在commit边界比较，不能把原CAS更新拆成先graph后blob两个成功点。
- 迁移时旧v1→v2 normalize加[]是确定性变换，保留revision IDs/parents；两版合并必须normalize后比较，不能把同ID仅多[]视为碰撞。未启用图片的账本允许继续v1写出，首次启用才v2，不为UI浏览自动升级。
- 本地v2升级需确认“旧版本无法继续打开”，保留升级前加密备份或完整本地源快照；旧binary打开新schema fail-closed。已升级有新图片后不支持原地降级；回滚到旧版只能从升级前备份导入隔离profile，不覆盖最新数据。
- 崩溃重启清理只处理无owner的draft/import/export staging。活session以host租约保护，超过24h也不可删活草稿；孤儿job识别必须基于session结束/恢复而非仅mtime。已提交图任一历史引用均不可GC。
- import/profile迁移可先写许多stage BLOB，最后短事务发布graph+promote；失败留原账本，清理新孤儿stage；空间不足不删旧图。

## 4. HTTP与S3协议

### 4.1 能力与版本门槛

扩展/api/v1/meta：ledgerEnvelopeVersions=[1,2]、ledgerPayloadVersions=[1,2]、attachmentProtocolVersion=1、maxAttachmentBytes、maxLedgerAttachmentBytes、maxAccountAttachmentBytes、maxAttachmentCount；登录后额度/已用从授权usage接口返回。没有能力字段视为v1-only，显示服务器需升级，本地记账仍正常；不谎称图已同步。

账户服务器为ledger metadata保存minPayloadVersion，首次成功v2账本PUT在同一CAS事务提升到2；以后即使正确ETag也拒绝v1 PUT（409 ledger-upgrade-required）。保留现有唯一`/ledgers/{id}/object`与CAS/Idempotency-Key，服务端仅验证外层，不解密描述符。

兼容S3继续使用原prefix/ledger-v1.enc.json作唯一头，名称历史遗留，内容自报v2。**不新建ledger-v2可写并行头。** 旧客户端读v2严格拒绝；旧ETag的并发v1 PUT因CAS失败。无法对不遵守协议的外部S3手工覆盖做版本保护，不宣称和HTTP同样具有server端downgrade guard。

每个绑定目标持久化highestObservedRemotePayloadVersion（绑定身份含server instance/user/ledger或规范化S3 endpoint/bucket/prefix），不能只以本地图版本判降级。本地已离线升级v2而该目标仍v1时，允许decryptV1→normalize→merge→上传图→首次v2 CAS；收到并验证v2远端或确认v2 PUT成功后提升该目标记录至2。记录为2后再读到v1才视为降级并拒绝，未知信封始终拒绝。丢PUT响应先GET确认，不盲重置此记录；新绑定目标重新核对能力而非沿用其他目标的最高版本。HTTP服务器minPayloadVersion仍为强制门槛；S3未曾观察到的外部回滚无法仅靠客户端历史检测，不作绝对防回滚承诺。

### 4.2 新HTTP接口（API前缀/api/v1）

| 方法/路径 | 语义 |
| --- | --- |
| GET /ledgers/{id}/attachments/usage | 该账本/账号有效额度、used/reserved/count，授权后返回 |
| PUT /ledgers/{id}/attachments/{attachmentId} | application/octet-stream密文、If-None-Match:*、Idempotency-Key、X-Luna-Cipher-SHA256；create-only |
| GET /ledgers/{id}/attachments/{attachmentId} | 有界原始密文，ETag和digest/length，Cache-Control:no-store |
| HEAD /ledgers/{id}/attachments/{attachmentId} | 返回相同metadata不含body；用于完整性inventory |
| POST /ledgers/{id}/attachments/{attachmentId}/repair | 仅修复已发表ID的物理损坏/缺失；If-Match为已观察metadata版本ETag，Idempotency-Key，body必须匹配已存原digest/length |

同ID同字节/digest重复成功且不双计费；同ID不同字节409。无条件428、错账户404、不存在404、超单图413、额度耗尽409 attachment-quota-exceeded、无效类型415；保持原error code/requestId/retryable结构。Idempotency hash包含actor/ledger/id/条件/实际digest和length，不能仅信请求头。验证actual streamed bytes，拒绝compression；返回不含图片mime/文件名/尺寸等明文内容。

服务端migration追加attachments表（ledger_id+attachment_id PK、object_key、digest、length、status、reservation_id、lease_until、timestamps）和ledger min版本；与当前版本顺序递增，重复执行幂等。账户/ledger配额计数和reservation在短事务内锁定。上传过程不持SQLite锁等待网络：有界读临时stage→验证hash→准入预留→storage immutable PUT→短事务核对仍有效账号/权限/预留→publish metadata。若撤销/崩溃发生，未发布对象保持隔离，GET不得返回，恢复任务reconcile同ID对象/digest，未完成预留24h后可释放但对应对象须先确认不可发布并清理。**已完成上传但未引用**不自动清除，仍占额，以免与离线发布竞态。

存储层必要新增removeStagedObject，仅用于从未发布/失效预留的内部对象，不提供用户附件DELETE接口。每次预留有随机generation/fencing token；物理key包含ledger/id/token，已发布metadata指向这一不可变key，而非多个重试共享可删的ledger/id key。finalize必须原子比较active reservation/token和会话授权；GC先把该token标记为不可发布，再仅删除该generation且确认无已发布metadata引用。重试创建新token，旧上传迟到也无法finalize；后台reconcile仅回收带失效token的孤儿，绝不删新token的对象。已取消但可能仍在落盘的旧upload须纳入后续reconcile，不能在首次delete后认为永无迟到对象。API ID仍是稳定attachmentId，客户端无需知道token/physical key。每账号最多4、每ledger最多2个活跃上传（含有界body暂存），另有全局并发限流，避免入额前暂存绕过配额；超限429。

数据目录/S3服务器备份须连metadata+所有对象一起覆盖，恢复后核对inventory与配额。新增body≤2MiB+16，不需提高原nginx12MiB graph限制；完整备份不经过这个HTTP对象入口。

损坏修复不改变逻辑图片内容：服务端published inventory保存的digest/length是不可更换的约束。repair只有body重新校验为原digest/length且调用者仍有该ledger权限才可执行；使用新reservation generation物理key，经If-Match条件交换metadata指针/版本。原对象健康则no-op并验证字节，不能只信metadata假称修复。metadata本身与客户端graph期望不一致则409，不允许客户端重定义ID；需从完整备份/管理员恢复一致metadata。旧损坏物理代际保留至受控维护，不作为可用数据返回；正常create的不同字节409规则不放宽。已存在ID的repair不增加逻辑used额度，但计入有界临时空间/并发；同一ID一次活跃repair，防反复制造物理副本。丢响应复用Idempotency-Key，完成后必须实际GET+hash/GCM验证，不能HEAD成功就宣布修复。

客户端HTTP附件必须通过生成SDK/现有bounded raw runtime，不能在renderer自行fetch。schema→OpenAPI→SDK统一生成，勿手改generated。此前SDK修复是独立dirty工作，实施者应先建立归属基线再增量生成，绝不回滚其修复。

### 4.3 S3适配

新增共享AttachmentObjectStore get/head/putImmutable/repairExpectedCiphertext/close契约；S3键prefix/attachments/v1/<attachmentId>，不带商户或原文件名。正常创建IfNoneMatch:*，存在则GET/HEAD核对digest和长度，不同逻辑descriptor冲突不覆写。不能把ETag等同SHA256（尤其multipart）；用密文字节校验。沿用凭据、endpoint/prefix及取消规则，不另存一套密钥。

S3窄修复：host先确认本地待修bytes与已认证graph descriptor的digest/length/GCM完全一致，再GET远端证实已有bytes损坏并取得ETag，用IfMatch该ETag条件PUT正确的**原密文字节**。若不存在则走IfNoneMatch创建；412重新读取并核验，不无条件覆盖。健康对象不重写，同ID不同descriptor先拒绝，repair仅恢复同一个逻辑密文。HTTP服务器有已存digest门槛，直接S3只有客户端和bucket权限约束，文档不得夸大为服务端内容鉴权。

直接S3没有可信账户服务端统一配额，客户端基于graph+本次待上传字节检查512MiB；底层bucket配额/孤儿对象为provider边界，不能宣称跨客户端硬配额。文案区分本地有效限额与HTTP服务器额度；两种transport都必须交付图片同步，不能只做HTTP。

## 5. 同步顺序、故障与保留

单次协调：读取远端唯一头→验证/解密并在内存计算与最新本地图的union→枚举**所有revision**描述符并校验同ID一致、总量/数量限额→通过后原子合并本地图→核对远端对象→上传本机有而远端无的密文（物理损坏按窄repair流程）→所有待发表引用已确认remote存在后CAS PUT新图→下载本机缺少的对象并校验解密→重查最新graph及inventory→完整才synced。

合并容量冲突必须在发布前拒绝：如两台离线各有300MiB不同图片，union600MiB超过512MiB，返回attachment-merge-quota-exceeded（含需要字节/数量与有效限额），不修改本地graph或远端head，不剪历史、不剥图、不提交超额graph然后永远缺图。两边原记录和图片仍可分别导出完整备份，普通本地无图记账仍可用；提示分别备份/保留独立账本，超当前格式容量的合并需未来统一容量协议升级。当前删除可见图片不会释放历史额度，不能建议“删图后重试”作为伪恢复方案。同规则用于profile迁移/restore及每次CAS重算union；最终本地事务必须对最新graph再算union并检查，不能只在异步前预检查。实际磁盘空间不足与协议inventory超额使用不同错误。直接S3并发可形成各分支有效但union超额，本版本对此诚实阻止合并，不承诺无限容量最终收敛。

- 金融图可先合并本地，即使图暂缺；金额仍按有效financial projection，图片缺失不变成财务冲突。UI显示“账单已保存，图片待下载/不可用”。
- 上传新引用前若任一图本机/远端都找不到，阻止发布包含缺失新增引用的候选并报attachment-incomplete，不静默去掉图。已存在远端损坏引用同样不宣称成功；有原字节设备可修复。
- 每密文上传保存exact bytes/id/digest，丢响应后相同IdempotencyKey/请求重试；图CAS失败重新merge+inventory，原图密文不重新加密。最多4个graph冲突轮次；超限为pending而非synced。
- 每图最多3次明确可重试失败，进度“完成N/M张”；批次可取消和下次续传，单图60s，不能让512MiB继承旧全流程60s而必败。自动sync仅原有允许模式/连接状态触发，禁止未登录/未连接偷传。
- profile generation、disconnect/revoke信号检查到BLOB/graph事务提交前；迟到结果不能写新profile。公开status包含financialState、attachmentPendingCount、attachmentFailedCount及overall，旧比较仅graph JSON相等不能决定overall=synced。
- 图片删除/替换随transaction新revision；两个端并发修改形成原交易冲突，候选均保留图；冲突解决只选择候选，不悄悄合并图片或financial金额。丢弃head、tombstone、旧revision图都保留。
- ledger/profile迁移复制全部ciphertext+内部描述符，核对hash/GCM，目标先存bytes再activate；源在整个流程保留，失败不切换绑定。迁移job先排空已接受写入、在源metadata持久化迁移租约/快照版本，全部新host写入在事务内检查此租约；读仍可用。复制完成再比较源版本，变化则重新核验/重试，不能激活过期目标。原子切换catalog指针后释放源租约；崩溃恢复按job状态恢复原profile或已完成目标，不能仅见目标DB存在就当迁移成功。跨窗口行为纳入测试。备份恢复同理。退出账号不等于删除本地图片。

## 6. 完整备份二进制v2（规范选择）

扩展名`.luna-backup`，MIME application/octet-stream。保留旧v1 encrypted.json读取；新完整备份始终新格式，无图也合法。不再调用file.text()处理新格式，不把大包整体base64跨IPC或Capacitor。

### 6.1 线格式

整数均无符号big-endian；所有长度在读取分配前检查上限。

1. 固定56字节header：ASCII magic `LUNABK02`(8)、u16 version=2、u16 flags=0、u32 encryptedManifestLength、salt16、iv12、u32 attachmentCount、u64 totalContainerLength。
2. encryptedManifest：AES-256-GCM ciphertext+16tag；PBKDF2-SHA256 600000、同现有password规则；AAD为UTF8 `luna-full-backup-v2` 后接完整56字节header。manifest JSON固定schema包含format='luna-full-backup-manifest'、version=2、graph（规范化v2，含keys）、attachments[]（唯一id、cipherByteLength、cipherSha256，按id字典序）、totalCipherBytes。清单必须与graph全部历史引用集合完全相等。
3. 按清单排序逐个frame：ASCII lowercase UUIDv4固定36字节、u32 cipherByteLength、对应密文字节。ID无任意路径/文件名，无压缩。
4. 固定40字节footer：ASCII `LUNAEND2`(8)+32字节SHA256(header+encryptedManifest+全部frames)。精确EOF，不允许尾随数据。

header长度、frame顺序/ID/length、count/total与解密清单一致。Footer hash只用于结构/传输校验，不是独立认证；真正认证来自manifest GCM及每张图的GCM/digest。不得把无密钥hash当防篡改凭证。空附件文件也有manifest/footer。manifest和images均通过host内部验证，不把key返回UI。整文件SHA256必须使用项目已有@noble/hashes的增量接口或host等价增量hash，不用SubtleCrypto.digest拼接544MiB数组；WebCrypto AES-GCM仅处理有界manifest或单图。

### 6.2 文件会话API和跨平台实现

新宿主会话契约：beginBackupExport(password)→opaque jobId/totalBytes；readBackupChunk(jobId, sequence)→bounded bytes/eof；finish/cancelBackupJob；beginBackupImport(totalBytes或null,password)→jobId；appendBackupChunk(jobId,sequence,bytes)；finishBackupImport(jobId)→安全receipt；cancel。job绑定profile/generation、只允许一项活跃导出或导入；密码仅job内存，完成/失败/取消清理。sequence严格单调，重复相同块幂等或返回已接收offset，不容许乱序拼接。Android provider未知size可为null，仍在读取时计数544MiB硬限额，解密header声明与实际EOF必须一致；已知provider size也仅作预检查，不能替代实际字节验证。

- Host冻结graph+inventory快照；缺图先取回并验证，离线缺图则导出失败并保留账本，不创建看似完整的包。后续新交易属于下一次备份。
- Web使用OPFS临时文件（与账本逻辑事务分开、只密文）、分块写入，再getFile()获得磁盘支持的Blob用于下载；导入File.stream分块。必须实测大文件内存不随512MiB线性增长，不能以new Blob(allChunks)全内存堆积冒充流。普通Web不支持OPFS仍沿现有拒绝启动，不新降级。
- Electron宿主打开系统对话框并以文件stream写入/读取，不把本地路径返回renderer；可在host内部直连会话，不必让UI搬全部chunk。
- Android扩展现有LedgerBackup插件：beginSave/display SAF→handle，writeChunk(base64,sequence)→ack，finishSave→flush/close，cancelSave；beginOpen→handle/size、readChunk→base64、closeOpen。插件只传密文和受控handle，不传password/raw graph/path，不允许任意content URI。Activity recreation/process death显式失败需重试，不能恢复伪成功；会话数据不放Bundle，最多一块与handle在内存。优先用户系统文档选择，不请求广泛存储权限。
- Android无OPFS兼容仍使用SAF流传输+原IDB附件store，不能要求先造一个512MiB字符串。
- 浏览器只能确认文件已生成并触发下载，文案“备份已生成，请确认下载完成”；Electron/SAF仅flush/close后说已写入。取消或失败的目标文件如系统provider允许则删除临时文件，否则清楚标为未完成，footer缺失保证不能恢复。

### 6.3 恢复提交

1. 有界读header，拒绝未知/过大/不完整，再KDF解manifest，验证graph/完整inventory和workspace。
2. 流式暂存frames，digest和GCM逐图验证，不把不可信bytes直接挂当前交易。验证footer与EOF；计入恢复后唯一union总量，包括原有历史，超额报错。
3. 最后短事务重新读当前graph并merge、核对generation/取消、promote所有必要staging、写graph/projection/version；如期间本地编辑变化，按最新union重新检查容量与碰撞，不覆盖。
4. 空profile adopt原workspace；同workspace merge全部历史；不同workspace拒绝并引导新空profile。恢复不自动连接远端或同步。
5. 旧v1备份走原解密→normalize为无图历史→同样merge/adopt；v2原图已存在则校验复用，不能清除原图。任一错密码/缺图/重复/额外frame/篡改/磁盘不足/取消都不发表新graph。

## 7. 错误与迁移矩阵

| 条件 | 结果 |
| --- | --- |
| 不支持/动画/超像素/超文件/规范化超限 | stage失败，原草稿字段不变，无金融写入 |
| 同ID不同描述符或密文 | 拒绝候选，保留原图/本图，不last-write-wins |
| stale revision、scope变化、quota、store失败 | 原子回滚financial提交，保留可重试stage |
| 图可读但图片404/损坏 | 金融信息保留，图片报错可重试，不宣布完整synced/backup |
| 旧HTTP服务器 | capability错误，不发v2、不静默剥图，本地仍可记账 |
| 旧客户端读v2、旧schema | 明确拒绝，不覆写；本轮必须旧binary/fixture实测 |
| v1升级与并发旧PUT | 同head CAS保证顺序；HTTP minVersion防降级 |
| v2备份缺frame/额外frame/尾随/错误footer/GCM | restore失败，目标原账本不变 |
| 取消、断开、设备会话撤销 | 不提交迟到响应；保留已成功本地记录，进度诚实 |

## 8. 执行门槛与兼容发布

开发顺序以implement.md P1–P6为准：先冻结codec独立golden fixtures，本地存储与服务器能力可按文件所有权分别开发，随后完成两transport、完整备份/迁移，最后启用图片UI。发布/集成顺序另外约束：服务器双版本读取/能力与对象接口必须先可用，再允许新客户端发表v2。服务器部署属后续明确操作，不在本轮连VPS。测试时本地服务器先升级，再新客户端；无图v1账本不强制升级远端格式。本地数据库为支持新应用可迁移至新storage schema，即使其中graph仍v1；本地旧binary回滚限制与远端v1兼容要分别说明。

首次给旧账本加图片需显示一次具体兼容说明并取得操作确认，执行本地/远端准备；失败留在可用原态。已升级远端不自动降级/回写v1。不同客户端各自离线升级时，无根密钥分叉；统一normalize能合并无图v1历史。

加密实现需独立fixture/交叉实现验证，不只encrypt→decrypt同一代码自洽测试。附件字段作为密钥数据改变了公开graph边界，这一项为禁止遗漏的质量门槛。最终检查包含安全DTO递归无key/iv、实际bytes限额、跨账号鉴权/配额竞态/崩溃恢复。具体测试见acceptance.md；未运行之前不得声称安全审计或跨平台交付完成。
