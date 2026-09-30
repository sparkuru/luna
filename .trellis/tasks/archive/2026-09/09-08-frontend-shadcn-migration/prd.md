# Luna 前后端整体迁移

## Current baseline and task status (2026-09-25)

用户于 2026-09-08 已明确批准实施；A 后端契约、B React 前端、C 同步迁移三个子任务已归档，D [三端发布验证](../09-08-fullstack-release-validation/validation.md)仍在进行。本父任务因此处于 `in_progress`，不能以三个子任务归档推断整体交付完成。

下文是 2026-09-08 批准时的需求和设计基线。其 R10/AC8 中的 PostgreSQL 部署与恢复方案，已由用户随后确认的 [单实例 SQLite 与内置 S3 方案](../09-10-sqlite-self-hosted-sync/prd.md)替代；当前发布验收须使用现行 SQLite 产物及其恢复证据。R8 中针对当时开发用 IndexedDB 数据的迁移要求，按 09-10 的决定改为干净初始化；其他明确迁移与数据保护边界仍依各自任务验证。原先“附件不在本次交付范围”只限定 09-08 初始迁移；后续 [09-12 图片附件任务](../09-12-luna-ui-redesign/prd.md)独立实施，不能据此将附件计为本父任务已验收。历史 PostgreSQL 结果仍按原版本保留。

## Goal

迁移为 React + TypeScript + Hey API + TanStack Query + TanStack Router + Tailwind CSS + shadcn/ui，并引入可部署后端。一次完成界面、接口、数据归属、账号、三端、迁移、部署及验收设计，再按明确依赖实施。

## Confirmed user decisions

- 2026-09-08：允许创建任务并进入规划。
- 指定 Hey API、React Query、TanStack Router、Tailwind CSS、shadcn/ui。
- 明确“引入后端；一次性设计完全”。随后对整体推荐方案答复“认可”，确认以下产品基线。
- 产品统一叫 Luna，技术标识使用 luna。LunaLedgerApi 中 Ledger 是内部账本领域术语，不是产品名。

## Existing behavior and evidence

- `package.json`：原生 TypeScript + Vite，没有 React 或业务 HTTP 服务依赖。
- `src/renderer/renderer.ts:35`：DOM 页面与模块会话状态；841 行。`ledger-tools.ts` 375 行，`styles.css` 1,335 行。
- `src/shared/api.ts`、`src/web/main.ts:13`：共享异步 LunaLedgerApi；Electron preload、Web IndexedDB、Android 打包 Web 资源。
- `src/shared/ports.ts`、`src/main/store.ts`、`src/web/browser-state-store.ts`：本地事务持久化。
- `src/shared/ledger-sync.ts`、`src/sync/ledger-service.ts`：已有因果修订、冲突、墓碑、本地优先、客户端加密和条件上传。
- `.trellis/tasks/09-06-intuitive-ledger-ui/prd.md`：最近账单 + 记一笔弹窗 + 二级菜单是现有信息层级。
- `tests/e2e/`：已有记账、隐私、无障碍、同步、备份、离线和更新回归。本轮未运行产品测试。
- 大量源码/配置尚未提交；以当前工作区为基线，不得用 HEAD 覆盖。

## Product baseline

- 保留本地离线记账；后端负责账号、设备会话、账本归属、加密账本与配置同步。服务器不持有账单明文，不做服务端金融 CRUD/统计。
- 不登录也能本地记账。登录不会自动上传；连接服务器需要用户显式绑定。
- 自托管个人账号、多设备、每账号一个活动账本；账号由管理员工具创建/重置。首版不增加家庭邀请、共享角色、公开注册、邮件服务或多账本切换。
- S3 作为兼容目标保留，一个账本同时只启用一个同步目标，切换不双写。
- 登录密码与解密口令分离；远程凭证与解密口令仅驻留内存，重启需重新登录/解锁，本地账本仍可使用。
- 保留 Luna 浅色蓝色主题与首页层级，统一 shadcn/ui 控件；不做像素复刻或独立视觉改版。

## Requirements

| ID | Requirement |
|---|---|
| R1 | 指定工具均实际使用；Hey API 生成并调用 HTTP SDK 与适用的 Query options。 |
| R2 | 保留首页、流水增删改/筛选、分类、预算、统计、设置、备份、同步与冲突处理。 |
| R3 | 三端离线能打开已有账本和提交本地操作；重连后有限重试，不用最后写入静默覆盖并发财务修改。 |
| R4 | 保留金额整数最小单位字符串、当地日历日期、拆分类目保护、原编辑版本/预算 heads、墓碑与历史。 |
| R5 | 保留三项汇总隐私边界、中英文、键盘、焦点恢复、失败草稿及至少 44px 触控目标。 |
| R6 | 后端按账号鉴权隔离，会话可撤销；服务器不接收账本口令或金融明文。 |
| R7 | 重复/并发上传、响应丢失、口令错误、存储失败与超限均有可恢复状态，不能假确认同步。 |
| R8 | SQLite/IndexedDB/S3/加密备份可以显式迁移；原件保留，可重试、可回退，不串账号。 |
| R9 | 路由前进/后退、深链、刷新、Android 返回行为一致；敏感表单内容不进 URL。 |
| R10 | Docker 部署 Web/API/PostgreSQL；提供版本化接口、迁移、恢复与发布验证。 |
| R11 | 产品名称、应用标题、安装包展示名与新增文案统一为 Luna；技术包标识为 luna。不因品牌命名批量替换内部 ledger 领域术语或已有持久化键。 |

## Out of scope for this delivery

- 明文金融 HTTP CRUD/服务端月报、SSR、Next.js、微服务、Redis、消息队列。
- 家庭协作、公开注册、邮件找回、第三方登录、多活动账本。
- 新加密协议、托管解密密钥、通过登录密码恢复账本口令、附件/银行接入。
- 增量图协议、自动压缩金融历史、WebSocket；现有图上限保持且显式报错。
- 强制登录才能本地记账、自动删除旧数据、强制迁移 S3、暗色主题新功能和品牌重设计。
- 修改或归档既有任务，覆盖未提交实现。

## Acceptance criteria

| ID | Mapping | Evidence |
|---|---|---|
| AC1 | R1 | OpenAPI 来自路由 schema，重复生成 SDK 无差异，真实 API 测试使用生成 SDK；全部指定 UI 工具在运行路径上。 |
| AC2 | R2/R4/R5 | 原有核心记账、预算、隐私、i18n、键盘、窄屏回归通过；失败保留草稿及原版本令牌。 |
| AC3 | R3/R7 | 两个独立客户端断网修改、重连、重试、并发编辑/删除后图收敛，财务冲突显式选择；重启不丢本地写入。 |
| AC4 | R6 | A 账号不能读写 B 对象；撤销后请求失败；日志/响应/数据库无口令或账单明文。 |
| AC5 | R7 | 首次创建竞争、ETag 竞争、幂等键重放/冲突、提交后断线、损坏/超限、数据库失败无覆盖或假成功。 |
| AC6 | R8 | 迁移前后 workspace/revisions/parents/tombstones 等价；重复迁移不重复入账；原件仍可恢复。 |
| AC7 | R9 | 深链刷新可达、返回不意外离开应用、弹窗焦点正确；URL/历史无密码/金额/备注/搜索文本。 |
| AC8 | R10 | Compose 健康启动、DB 迁移/恢复演练通过；先完成 Web 生产离线验证，再验证 Electron/Android。 |
| AC9 | R5 | 按设计 token 和 UI 状态矩阵人工审阅视觉/键盘，明确自动化、模拟器、真机和读屏证据边界。 |
| AC10 | R11 | Web/Electron/Android 用户可见品牌均为 Luna，无 LunaLedger/lunaledge 新品牌；现有存储兼容性不因命名变动受损。 |

## Delivery map

本任务作为父任务持有整体需求与集成验收。交付单元 A 后端及契约、B React 前端、C 服务器同步与迁移、D 三端发布验证。顺序与依赖见 implement.md；子任务不是自动实施授权。

## Review status

产品决定已收敛，无阻塞产品问题；需求已按最终结构复核，保留要求/验收映射及证据。设计、实施计划、四个子任务与 JSONL 均已建立。用户已于 2026-09-08 明确回复“明确开始实施”，批准最新最终摘要与 A → B → C → D 执行顺序。实施与验证证据随后写入任务记录，不能用规划代替实测结果。
