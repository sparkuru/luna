# 执行计划：按契约分阶段交付

2026-09-12 修订2；用户已明确恢复实施并已执行 `task.py start`。P1–P5 主要实现和本地 Web/共享/服务端验证已完成；平台与人工边界的实际结果以同目录 `validation.md` 为准。本任务保留单一总体计划，以六个有输入/输出/退出条件的工作包控制依赖；未运行或受环境阻断的项目不得标为完成。

2026-09-13 当前执行节奏：本地进度已获准提交；后续主动工作聚焦前端与体验。部署、跨端联动、真实同步和相关平台验收暂缓，仍保留在计划中且不得标为完成。

## 0. 接管与归属门槛

前置：用户认可最新范围并发出实施指令。cwd=/home/wkyuu/cargo/repo/34-luna。

1. 读handoff→implement/check manifests→prd→design→attachment-contract→acceptance。
2. `git status --short`、`git diff --stat`、`git log -3 --oneline`、`python3 .trellis/scripts/task.py current`，对照handoff不相关dirty清单。保护SDK修复和部署/恢复差异。
3. 读frontend/backend索引和相关实际规范；旧菜单/金额优先/仅月统计约束由本任务明确覆盖，其余CSP/crypto/revision/权限不覆盖。
4. 查package scripts、hako、Node、Chrome、Docker、OPFS/Android工具和4173端口；规划期没跑过，不能沿用“已可用”。建立research/baseline.md，区分已有失败。
5. `python3 .trellis/scripts/task.py validate .trellis/tasks/09-12-luna-ui-redesign`通过后，实施授权成立才start。
6. 基线运行typecheck、单元、相关现有浏览器；基线已有API生成问题单独定位，不允许删除原SDK修改使检查变绿。

## 依赖图

P0接管 → P1契约/fixtures → P2本地附件与安全API → P3远端对象/同步 → P4完整备份/迁移 → P5完整UI/统计查询 → P6集成与交付。

P3服务器schema/capability可在P1冻结后与P2独立推进；P5的纯统计/查询/键盘函数也可在P1后独立开发。**图片UI完成依赖P2+P3+P4**，不能在上传按钮可点时就标AT需求完成。shell/styles/i18n单负责人；shared/api/domain/ledger-sync由契约负责人统一编辑，消费者通过已冻结接口接入。

## P1. 契约与可复核fixtures

责任：src/shared/{domain,api,ports,ledger-sync,ledger-crypto,ledger-session,server-api}.ts；规划文档修正须保持一致。

- [ ] 分离内部StoredTransaction附件描述符与安全Transaction DTO；原始graph/merge只留内部LedgerDataPort。列出preload/IPC/server-host/Web代理全部调用点；不能仅改TypeScript类型而运行值仍泄密。
- [ ] v1/v2 graph与envelope、确定性normalize、附件AAD、bounds、error codes、backup header/frame/footer固定。
- [ ] 固定同步status中financial/attachment/overall语义与migration/read-only提示。
- [ ] 冻结查询/统计/计算器纯函数签名，date/amount/category/regex范围按design。
- [ ] 添加独立golden fixtures：真实旧v1数据、无图v2、有图v2、冲突/删除历史、附件密文、完整备份binary。采用合成图片，不用用户截图。
- [ ] crypto测试至少一个fixture由独立实现生成/验证；明确密钥只用于fixture，不用生产秘密。

退出条件：v1既有测试通过；v2解析/上限/密钥投影/规范化碰撞/备份解析失败测试有明确实现入口，API消费者清单完整。不可先全repo替换v1常量后补兼容。

## P2. 本地附件、图片处理、安全API

责任：src/main/{store,local-api,ipc}.ts、src/preload.ts、src/web/{web-api,sqlite-wasm-store,sqlite-wasm.worker,browser-state-store,profile-host}.ts、host安全投影、图片处理模块。

- [ ] Native2/3→4迁移保留profile metadata；Web2→3，IDB1→2；旧应用new schema失败，不覆盖。
- [ ] 同一profile DB里的staging/committed BLOB与graph联合事务；支持chunk/import stage；预算和既有状态仍保留。
- [ ] 规范化管线有界头部检查/去元数据/方向修正/静态格式/缩放和输出限额；不是拿扩展名当验证。
- [ ] 每图随机id/key/iv、加密一次、hash，stage令牌绑定session/scope；schema/类型之外检查bytes。
- [ ] create/update的原revision校验与附件promotion原子；失败保留draftToken，成功receipt后不重放。
- [ ] read预览验证引用/候选、digest/GCM、返回安全字节；对象URL生命周期，没图占位不改金融总额。
- [ ] getSnapshot/回执/冲突/server代理递归安全投影；公开raw graph能力从实际IPC/preload移除。
- [ ] quota、孤儿stage恢复、profile删除/切换/复制兼容；不GC任何已提交历史图片。

验证：native store+Web OPFS+Android IDB adapter测试覆盖atomic/save failure/stale scope/reopen/quota/migration/图hash；公开API递归搜索key/iv/raw graph。退出：断网本机图文保存与重启可读，旧数据完整、安全边界测试通过。

## P3. HTTP/S3加密对象与同步

责任：src/server/{app,schemas/http,db/migration,db/operations,storage/object-store,config}.ts；src/sync/{ledger-service,http-object-store,s3-ledger-store,server-host,profile-port}.ts及新增attachment ports；contracts/openapi.json、生成SDK。

- [ ] 服务器能力字段、v1/v2外层验证、minPayloadVersion持久化；旧服务端preflight降级提示。
- [ ] PUT/GET/HEAD/usage、鉴权、不可变ID、实际body上限、idempotency、ETag、reserved/used额度与崩溃回收。
- [ ] 按目标持久化远端版本checkpoint；reservation物理代际隔离清理；窄repair只恢复原digest；union额度在本地merge/远端发布前检查，均配独立失败测试。
- [ ] 长上传不持全局SQLite锁；提交时重新验证会话撤销和预留所有权；未发布对象不可GET。
- [ ] SDK用项目generator生成，并保留基线SDK修复；actual binary、headers/status/AbortSignal与bounded read不丢。
- [ ] HTTP/S3共用attachment port，S3保留唯一历史head key；旧client/v2 fail-closed/旧ETag竞态。
- [ ] 先对象后新引用，union全历史inventory；缺图pending可恢复；下载GCM验证才promote；graph+图全齐才overall synced。
- [ ] 并发2、单对象60s/最多3次retry，graph4轮；保留原断开/换profile/撤销取消和automatic/manual规则。
- [ ] profile/连接迁移复制并核验所有历史图后再activate；失败保留源；直接S3能力与额度文案诚实。

验证：本地HTTP listener+生成SDK，两client；本地S3兼容fixture/已有MinIO测试，不连接VPS。故障注入见acceptance。退出：离线各端加图后同步，双方相同graph/图片可解密，冲突/重试/拒绝降级/额度竞态不丢图；两transport都有证据。

## P4. 完整备份与宿主文件交付

责任：新shared/backup codec、host备份会话、renderer tools文件流程、src/web/android-backup.ts、android/.../LedgerBackupPlugin.java；必要Electron文件入口；服务端恢复相关测试和数据目录文档。

- [ ] 56-byte header/manifest/frames/40-byte footer精确codec，逐段上限和digest/GCM；无图v2和旧v1 importer。
- [ ] export冻结graph全历史inventory，缺图不得生成假完整包；chunk sessions取消/密码清理。
- [ ] Web OPFS临时文件→磁盘File下载，不能全部chunks常驻内存；import File.stream。
- [ ] Electron文件stream；Android SAF分块读/写/flush/close/cancel，不放大JSON Bundle；原IDB兼容无OPFS仍能完成。
- [ ] restore全验证后单事务merge/adopt+promote，冲突、异workspace、quota、cancel/late write处理。
- [ ] server基础设施备份/恢复覆盖附件metadata+对象；只扩展相关清单/校验，不重写用户未提交的restore修复。实际服务恢复在本地副本/容器完成。
- [ ] 大型合成包验证内存和空间；不降低512MiB规格偷偷改成现有12MiB限制。允许容量不足的真实错误，但发布支持不能靠恒拒大包通过。

验证：所有历史/删除/冲突图断网恢复，manifest/frame每个失败分支、wrong password、重复/缺失/额外、cancel与quota回滚；Web/Android/Electron文件边界按可用环境分别记录。退出：端到端完整备份恢复证据，旧v1兼容和本地server restore通过；原生未测则该交付保留待验收，不能算全平台完成。

## P5. UI、统计、搜索及全部管理页

责任：src/renderer/**、shared的query/statistics/expression模块、测试。

推荐小步顺序：

1. 变量、导航、路由、setup、首页（空态/375/1440先验）。
2. 类别优先/完整网格/计算键盘/常驻日期/详情；保留draft/revision/committed-refresh-failure。
3. 接入P2–4完整附件能力和升级说明，图片进度/错误/preview/remove/backup入口。
4. 独立统计周/月/年、line/donut、类别/大额交易drilldown；预算保持月与heads。
5. 搜索+筛选、chips、多分类+金额+日期AND、正则Worker及可终止预算。
6. 所有设置子页和同步/backup/conflicts安全DTO，能力逐项核对。
7. 清理旧菜单结构/冗余CSS/无用文案，不保留隐藏旧控件骗测试；完整双语和ARIA。

聚焦验证：每一步修改相应existing E2E与新增行为测试，不整体删旧测试。截图检验正常375首屏、320长文/大额、桌面、横屏；指标不可仅凭估计。退出：UX/EN/ST/QU/MG/RT需求均有行为证据，附件入口不是假数据演示。

## P6. 全量检查、视觉审阅、交付

- [ ] 按acceptance.md全ID追踪实际测试和手工证据，无“运行成功”但场景跳过。
- [ ] 独立检查代理做范围/协议/DTO/CSP/旧功能/依赖方向复核，发现问题验证再修复，不忽略高风险意见。
- [ ] 下列命令按改动层次运行并记录实际结果：

```text
./hako npm run typecheck
./hako npm test
npm run server:typecheck
npm run server:test
npm run test:contracts
npm run test:server-sync
npm run api:check
npm run server:build
npm run web:build
npm run test:web
LUNA_TEST_PRODUCTION=1 npm run test:web
```

使用hako或已验证本地环境，不假装当前环境已安装全部依赖。node版本/native ABI不符按项目wrapper解决；不无故升级依赖。对本轮跨host附件改动，在Web功能通过后再执行项目声明的Electron build/smoke和Android隔离模拟器文件验收（具体命令以spec/脚本help复核）：

```text
./hako npm run build
npm run smoke:electron
```

Android使用frontend/android-runtime.md声明的compose.android.yaml隔离AVD流程；**不将此前用户授权查看鲨鱼理解为授权安装/清空用户手机**。真实设备测试留待用户另行授权。VPS和真实云对象不在自动执行范围。

- [ ] `git diff --check`、逐文件检查归属、确认未加截图/秘密/无关SDK恢复工作；code与生成模板同步。
- [ ] 关键截图 `/tmp/luna-ui-redesign/`，任务validation.md记录viewport/locale/data/版本和路径，实际打开审阅；用合成数据，不导入用户鲨鱼账单。
- [ ] 本地loopback预览例4174，避免Playwright4173冲突。确认server运行后才能报告可用地址。
- [ ] 更新frontend component/state/web-host与backend graph/HTTP/DB、Android规范为真实实现版本；本轮规划不提前把spec写成已实现。
- [ ] 记录用户视觉反馈、assistive technology/Android物理键盘/原生选择器/远端边界。人类审阅按项目policy决定提交门槛；明确未测项，不能以图截图代替。
- [ ] 获准提交时只stage本任务明确路径，附scope/validation与项目co-author规范；再按Trellis完成流程归档。**当前只规划，不运行此步骤。**

## 回滚与失败分支

- P1不兼容fixture失败：先修codec，不进入存储发布；禁止通过删旧fixture解决。
- P2迁移失败：事务回滚保留旧字节/版本；新stage可清理；不reset用户工作树。
- P3旧服务器或网络失败：本机可用，不剥图，不回写v1，不改变绑定。
- P4损坏/不完整包：不发表graph、不自动sync，给出重新选择/下载缺图路径。
- 已升级v2的live graph：不能回退旧binary继续写；只能从预升级备份进入隔离profile。禁止原地清除附件/恢复旧head作为“回滚”。
- P5 UI回滚不倒退已发布数据schema；回滚UI组件仍须保留新reader和安全API。
- 任一新产品能力必须改变本文默认值才能落地：先更新对应契约和验收，再实施，不在代码里悄悄缩减。

## 完成记录模板

后续 validation.md 每条包含：需求ID、代码/测试路径、运行命令、实际结果/日期、失败工件、未运行原因。所有勾选只由实际验证填写。规划完成和产品完成分别记录；当前已通过范围、失败和平台/人工未运行边界以 validation.md 为准，不能用未勾选计划项覆盖实际证据。
