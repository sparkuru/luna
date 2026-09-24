# Implementation and validation plan

## Status and gates

用户已回复“明确开始实施”，批准最新最终摘要。本轮 A/B/C/D 实现与自动化验收完成：生产 Web 68/68、单元测试 150/150、真实 PostgreSQL 服务端 17/17、同步集成 5/5、SDK 契约 4/4、隔离恢复 7/7、最终 Nginx 浏览器 8/8、Electron 打包及解压后自检、Android 16 模拟器 18 项均通过。最终产物、哈希、实测范围和人工残余审核见 research/delivery.md 及 D 证据。保留未提交状态，不归档；真机、读屏和私有 HTTPS 部署未执行。

上段是 2026-09-08 PostgreSQL 方案的历史记录。2026-09-24 当前 SQLite 基线已
补充实体 Android 本地路径、独立主机隔离恢复及当前 Electron/Web 复验；临时
公网 HTTPS 上的浏览器/Android 双向合成数据同步已通过并回滚。长期 VPS 路由、
生产恢复、读屏和 Electron 原生首启仍未完成，见
[D 子任务当前验证](../09-08-fullstack-release-validation/validation.md)。

一次性设计覆盖全局，实施采用可验证步骤，不能理解为一个不可回滚的大补丁。

## Task tree and dependencies

| Unit | Task | Ownership | Depends on | Completion |
|---|---|---|---|---|
| A | ../09-08-server-api-contract | src/server、contracts、SDK、契约测试 | 最终方案批准 | 真实 DB + 生成 SDK 可完成认证和密文 CAS |
| B | ../09-08-react-ledger-ui | src/renderer、两前端入口、Vite/Tailwind | 依赖安装完成后先做 UI/CSP 原型门；可与 A 后端验证重叠，HTTP 集成等 C | 现有本地记账用新 UI 通过 Web 回归 |
| C | ../09-08-server-sync-migration | src/sync、profile/host adapters、迁移、账号集成 | A 完整通过后可做独立 host/transport 基础；UI 集成等 B 本地通过 | 两客户端 HTTP 同步和原数据迁移通过 |
| D | ../09-08-fullstack-release-validation | Docker/Compose、发布脚本、跨端测试、文档/spec | 镜像/代理基础可独立准备；最终验证等 A+B+C 通过 | Web/桌面/Android/恢复证据及人工审核 |

树不代表依赖自动执行。package.json、lockfile、tsconfig、shared/api.ts 等共享文件由主会话协调单一写入者。执行优化：A 安装好固定版本依赖后，B 的纯本地 UI 可独立完成 UI/CSP 原型并与 A 的后端验证重叠；A 通过后，C 可先做不修改 renderer/package 的独立 host/transport 基础；B 本地 UI 通过后才接账号 UI 和联合验收，D 的镜像/代理/恢复工具可独立准备；最终集成验证仍等 A/B/C 通过。此优化不改变产品或 API 架构。

## A. Server and API contract

- [x] A0：记录未提交基线路径/哈希和现有测试结果；确定兼容版本并固定。只在隔离测试环境使用数据库。
- [x] A0：最小 HTTP schema → OpenAPI → Hey SDK 原型，证明 ETag、CAS/幂等 header、AbortSignal、有界读取、typed error；验证 React/shadcn/CSP 与现有 Vite 双入口兼容。
- [x] A1：无监听 app factory、独立 server tsconfig/build、环境校验、PG pool、版本迁移、健康/关闭。
- [x] A2：users/sessions/profile metadata、管理员工具、KDF 限额、token 摘要、会话撤销/账号隔离。
- [x] A3：ledger/preference object 的 envelope/字节限制、事务 CAS、幂等事务和错误码。
- [x] A4：路由导出 OpenAPI、固定 SDK 产物、api:check；运行真实 PostgreSQL 契约/集成测试。
- [x] A5：审阅并发首次写、提交后断线、同 key 异 body、撤销竞争、越权、损坏与超限证据；未通过不得接业务同步。

## B. React UI

- [x] B1：React root、宿主注入、QueryClient、Router、Tailwind、shadcn、主题；保留页面静态 CSS/CSP 安全加载。
- [x] B2：本地 query keys/options/mutations、提交成功但刷新失败状态、跨 profile/session 清理已随 C 验证。
- [x] B3：首页/汇总/列表/筛选、录入和分类 Dialog，保留 revision/headIds、i18n、隐私。
- [x] B4：预算/统计/设置/备份/冲突/S3 页面，菜单路由、直接深链、返回与草稿 blocker。
- [x] B5：按用户行为更新测试；允许更新 DOM 定位，不删除隐私/冲突/离线断言。验证 375px/宽屏/键盘/焦点/动态文本。
- [x] B6：同一界面完整迁出 DOM innerHTML 后再移除对应旧实现，避免遗留两套事件监听。业务功能通过前不全删旧 CSS。

## C. HTTP synchronization and migration

- [x] C1：拆中立 sync session input，加入 HTTP LedgerObjectStore、配置 transport，保留原 S3 语义及测试。
- [x] C2：auth session service 与生成 SDK 接入，明确登录不上传；账号/设备信息使用安全 Query 投影。
- [x] C3：legacy-local 与 server profile 隔离，事务化复制，绑定 workflow，验证 reopen 和图等价。
- [x] C4：登录、解锁、连接、状态、手动/自动有限同步、退出/切账号取消。
- [x] C5：两独立客户端断网新建/编辑/删除/预算竞争，重连、冲突选择、响应丢失重放。
- [x] C6：S3→server、备份→server、SQLite/IDB 原库迁移与回退；错误 workspace/口令/损坏不修改原数据。
- [x] C7：验证 session cancellation 到 IDB commit、跨窗口刷新、原草稿 token 不变、API 请求与 Query cache 无口令泄露。

## D. Deployment and integration

- [x] D1：Web/API 分离镜像、Compose 内网 DB、健康检查、secret file 示例、迁移启动次序。
- [x] D2：Nginx 同源 API、路由 fallback、CORS/HTTPS/CSP、SW 全量静态依赖缓存；不缓存 API。实际私有 HTTPS 部署未运行。
- [x] D3：完整 Web 生产模式 Playwright，离线冷启动/懒路由/版本更新/断网写入。
- [x] D4：Electron 构建/打包/隔离数据 smoke，Android sync/build/emulator、返回键和原生备份。
- [x] D5：pg_dump 与独立恢复环境演练，验证账号/instance ID/ETag/客户端解密；记录 rollback 时新数据导出要求。
- [ ] D6：审阅实际 diff 与范围，更新 specs，人工审阅视觉/设备/读屏残余风险。源码/spec 审阅、静态视觉与自动化部分已完成；真机、读屏及私有 HTTPS 部署明确未运行，不声称人工验收完成。

## Validation commands

以下为验证入口；实际执行环境、命令和结果以各子任务 research 证据为准：

```text
./hako npm run typecheck
./hako npm test
./hako npm run web:build
./hako npm run test:web
LUNA_TEST_PRODUCTION=1 ./hako npm run test:web
./hako npm run build
./hako npm run make
./hako npm run smoke:electron
./hako npm run android:sync
./hako npm run smoke:android
```

实施前核对 hako 的环境传递与 Docker/Chrome 能力；若 wrapper 不透传 LUNA_TEST_PRODUCTION，用已验证的 wrapper 参数或直接在其容器内部设置，不能跑 dev cases 后声称生产离线通过。Android smoke 必须遵循现有 emulator wrapper，不假设普通 Node 容器具备 emulator。

A/D 已新增以下 package scripts：

```text
npm run server:typecheck
npm run server:build
npm run server:test
npm run db:migrate
npm run api:generate
npm run api:check
npm run test:contracts
npm run test:server-sync
npm run smoke:server-restore
```

测试 PG 用隔离 Compose project/临时 volume；不接真实用户 DB。必要的容器开发/脚本改动按 dev-it-in-docker、code-shellscript 技能执行，不扩展既有权限规则。

## Acceptance mapping

A → AC1/AC4/AC5；B → AC2/AC7/AC9/AC10；C → AC3/AC4/AC5/AC6；D → AC8 + 全部集成回归（包括三端 Luna 命名）。测试必须证明边界结果，不能只断言安装了依赖或函数被调用。

## Spec changes after implementation

- frontend index/components/hooks/state/type/directory：React、Query、Router、主题、generated boundary。
- backend index/directory/database/error/logging：Electron 本地与 HTTP server 分层；新增 server auth/API/CAS 规范。
- ledger/config sync：增加 HTTP transport，保留加密与取消边界。
- web-host/android/cross-platform：新路由、账号与 profile、生产离线和原生边界。
- 旧规范里 no framework/no React Query 的事实描述在实现后更新，不在规划阶段把推荐写成事实。

## Rollback and finish

高风险共同文件为 shared/api.ts、sync session、两持久化 adapter、两入口、构建配置、lockfile、SW。每阶段保留可运行检查点；只能回退本任务自己的补丁，不能 reset 当前未提交工作。

生成文档/源码/构建文件清楚区分；禁止暂存真实 token、密码、DB、备份。完成提交前按项目 human review 规则展示实际验证与剩余风险；本轮既不提交也不归档任务。下一次若产品基线变更，先同步父/子规划再实现。
