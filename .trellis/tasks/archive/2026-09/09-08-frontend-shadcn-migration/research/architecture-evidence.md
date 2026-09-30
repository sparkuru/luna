# Architecture evidence — 2026-09-08

## Repository findings

- `src/shared/api.ts` 是 Promise 宿主 API，没有 OpenAPI；不能直接用 Hey API 生成现有 IPC/IDB 调用。
- `src/sync/ledger-service.ts` 已有 transport factory、条件冲突重试、客户端解密/合并/加密、session cancellation 和提交后再确认；新增 HTTP provider 可复用这些语义。
- `src/sync/s3-ledger-store.ts` 有 LedgerObjectStore/get/put/etag、12MiB 有界读取，可作为新适配器一致性基线。
- `src/shared/ledger-sync.ts` 已限制 8MiB、10,000 revisions、100,000 links；服务端存储扩展不等于突破客户端图上限。
- `compose.yaml` 当前只有静态 Web 服务，默认绑定 0.0.0.0；新增 API/DB 不是现有功能。生产新方案建议 loopback + HTTPS 代理，不能把当前规范里旧端口描述当事实。
- `tsconfig.json` 仅 include *.ts，React 必须增加 *.tsx/jsx 并分浏览器/服务器/桌面边界。
- 两套 Vite entry 和 CSP、SW precache 都必须覆盖 React 生成的新 CSS/懒模块。

## Official sources checked

- [Hey API getting started](https://heyapi.dev/docs/openapi/typescript/get-started)：输入 OpenAPI，生成 TS/SDK；建议锁定具体版本。本项目生成账号/同步 SDK，而非自动推导 IPC。
- [Hey API TanStack Query plugin](https://heyapi.dev/docs/openapi/typescript/plugins/tanstack-query)：提供 Query 集成产物；登录秘密和金融密文不因此适合进入 Query cache。
- [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)：路由 schema 驱动请求校验和响应序列化。schema 应为受版本控制的代码，不来自用户输入。
- [@fastify/swagger](https://github.com/fastify/fastify-swagger)：从路由 schema 生成 OpenAPI；须注册顺序正确，覆盖全部公开错误响应。
- [TanStack Query network modes](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode)：always 用于不依赖网络的本地调用。完整页面抓取失败，官方搜索摘要确认 always 忽略网络状态；具体版本的默认/重试行为在 A0 用固定包测试，不据摘要推断更多行为。
- [TanStack Router history](https://tanstack.com/router/latest/docs/guide/history-types)：Web/browser 与打包宿主/hash 的设计依据，实际深链/返回需集成验证。
- [shadcn Vite integration](https://ui.shadcn.com/docs/installation/vite)：React、Tailwind、Vite 接入方案，保留已有工程入口而非重新生成项目。
- [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html)：事务锁语义参考；最终针对锁定 PostgreSQL 版本测试授权撤销与 CAS 竞争。
- [Node crypto](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)：scrypt/随机数/比较能力参考；实施使用 Node 22 对应 API，不借用最新版新增能力。

以上是技术能力依据。后端选 Fastify/PostgreSQL、保留密文、首版账号范围和 token TTL 是本任务的推荐设计，不是官方来源结论，也不是用户已确认事实。

## Technical checks before implementation expands

1. Hey SDK full response/ETag/条件头/幂等键/AbortSignal/有界 body 读；生成结果完整可复现。
2. 固定 Node/Vite/React/shadcn/Hey/Fastify 兼容版本，不能用 latest 笼统锁版本。
3. Radix style 属性与当前 CSP；Tailwind 外链样式；SW 懒路由离线。
4. 真实 PG 上授权撤销竞争、首次 CAS、重复幂等键与响应丢失恢复。
5. profile 数据复制/reopen/abort/回退，旧库和旧 S3 流程保留。

本轮仅阅读和写规划，没有安装依赖、运行产品测试或外部服务。
