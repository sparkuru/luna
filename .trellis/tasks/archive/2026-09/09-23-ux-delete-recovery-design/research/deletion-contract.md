# 删除与恢复契约研究

2026-09-23，只读研究；当前 A 子任务在独立实现。以下锚点以此时工作区为准。本文件不是新 API 的已实现规范。

## 当前调用链

| 层 | 证据 | 当前行为 |
|---|---|---|
| Renderer | `src/renderer/features/ledger.tsx`，`remove` | 原生确认后调用 `deleteTransaction(tx.id, tx.revision)`，经 local mutation 刷新；取消无写入 |
| API | `src/shared/api.ts:116` | 返回 `Promise<Transaction>`；没有公开 transaction restore 方法 |
| Electron bridge | `src/preload.ts:122`、`src/shared/ipc.ts:44`、`src/main/ipc.ts:175` | 窄 IPC 参数，主进程解码 ID 与 expected revision |
| Native port | `src/main/local-api.ts:65`、`src/main/store.ts:1112` | immediate transaction 内检查 migration lease、读取当前交易、校验 revision；更新交易、墓碑、revision、pending operation 和 graph |
| Web/Android port | `src/web/web-api.ts:634` | mutate 中读 graph、有且唯一的交易、校验 revision、生成 tombstone；保留 stored attachments，append revision 后原子写状态 |
| Profile dispatch | `src/sync/server-host.ts:190`、`:218`、`:248`、`:362` | 捕获实际 profile 调用；删除是已提交本地写入，成功回执不因随后 auth generation 变化被丢弃；触发通知与 sync 调度 |
| Domain | `src/shared/domain.ts:661`、`:677` | 普通编辑拒绝 deletedAt 非空；删除递增 numeric revision，保留其他字段并设置 deletedAt |
| Graph | `src/shared/ledger-sync.ts:311`、`:328` | append 自动引用当前 heads；多头拒绝普通修改；expectedHeadIds 可完整比较；transaction numeric revision 必须是前一版本加一 |
| Merge/projection | `src/shared/ledger-sync.ts:124`、`:247` | 合并是不可变 revision 集合并集；多个 heads 显式冲突；一个头派生有效值，财务统计过滤 deletedAt |

Web `getSnapshot` 当前包含有效 tombstone，native `getSnapshot` 会过滤 deletedAt；native `readTransaction` 也只返回未删除记录（`store.ts:1722`）。**不能由 renderer snapshot 统一实现历史恢复，也不能把 delete 回执改一下再 update。**

`ledger-store.test.ts` 的旧 schema seed migration 用例对历史已删除条目有特定过滤行为，因此“所有版本所有删除永远可恢复”也不成立；恢复范围须限定为新能力明确提供的删除凭据。

## 附件边界

Web 删除保留 `readStoredTransactionFromLedger(...).attachments`；native 删除保留 stored descriptors。`attachmentInventory`（`ledger-sync.ts:290`）合并所有历史 revision 的描述符；`storedTransactionToTransaction`（`ledger-record.ts:43`）只返回安全 metadata。

新恢复应在 host 内复制准确的 tombstone 财务值和描述符，renderer 不传任意替代交易、不读取 graph/key/iv。历史引用存在不代表本机字节一定存在，仍需遵守现有缺图下载/可用性状态，不伪称附件已经恢复可读。

## 已有测试证据（本轮只读定位）

- `src/web/web-api.test.ts`：事务内 stale edit/delete 拒绝；返回对象不别名持久化对象；离线删除和编辑冲突、显式选择。
- `src/main/store.test.ts`：stale revision 与墓碑写入。
- `src/main/ledger-store.test.ts`：离线 edit/delete 形成冲突、失效 heads 拒绝、重复合并收敛及落盘失败回滚。
- `src/shared/ledger-sync.test.ts`：合并/墓碑/图校验不变量；正式实现时需追加“合法删除后新 revision 恢复”的 fixture。
- `tests/e2e/ledger-sync.spec.ts`：实际浏览器加密同步和离线 edit/delete 收敛。

上述只能证明当前删除/冲突基础，不证明撤销已经存在或正确。

## 能复用与不能直接复用

能复用：事务写锁、migration lease、完整 heads 比较、graph append、投影持久化、附件 descriptor 投影、host profile dispatch、sync notification 和已有错误草稿框架。

不能直接复用：普通 update（明确拒绝 tombstone）、delete 的 `Transaction` 返回值作为授权凭据（缺 profile/scope/精确 graph head）、仅 numeric revision 的比较（无法表达完整 causal head 身份）、renderer 快照作为完整历史数据、删除墓碑或旧 backup 直接覆盖。
