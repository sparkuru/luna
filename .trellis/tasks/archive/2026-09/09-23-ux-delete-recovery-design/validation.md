# E 设计评审与验证

2026-09-23；仅文档，未修改产品代码、API、schema 或现行 spec。主会话已批准 E 设计研究；hook 自动载入的是 B，本评审以主会话明确分派的 E 路径为准。

## 已核对

- Web deleteTransaction/requireTransaction/mutate：在 state update 内做版本校验、保留附件描述符并追加 graph。
- Native store.deleteTransaction/readTransaction：immediate transaction 与 tombstone 投影；普通读取过滤已删条目，无法直接复用 update 恢复。
- domain.reviseTransaction/tombstoneTransaction：编辑拒绝已删、删除 revision +1。
- ledger-sync.appendLedgerRevision/addRevision/projectLedgerDocument/attachmentInventory：完整 heads 比较、不可变历史、冲突显式化及所有历史附件库存。
- server-host dispatch 的 committedLocalWrite 与 scheduleSync 白名单：未来两个新方法必须同时接线，捕获 scope，保留已提交回执。
- package.json：已安装 alert-dialog，但没有据此声称现有可直接复用 wrapper。

## 已修正设计缺口

1. 撤销过期检查先于幂等回执会误报已成功操作；改为身份/scope 验证后先重放已提交回执，仅首次执行受 expiry/head 限制。
2. 只有 undo token 串行不足以保障删除重复请求；补删除 requestId 的 in-flight 串行、写前回执容量预留及独立回执保留期。
3. host 生命周期不等于可跨刷新恢复的登录会话；明确刷新失效和 UI 预告，跨刷新不在默认候选保证内。
4. 补连续删除/晚到回执/页内入口保留、时限可访问性与可执行后续测试命令。

## 验收

E01–E04：文档证据、两方案比较、候选安全契约与未来测试向量齐备。E05：用户已选择当前会话内 30 秒撤销、暂不建历史回收站；本任务是设计交付，不代表撤销已上线或 撤销实现已获批。

- 文档 whitespace 检查：通过。
- Lint：不适用（package.json 无 lint 脚本，仅 Markdown 设计变更）。
- TypeCheck：未运行；本评审无代码变更，交由主会话对 A–D 最终代码统一验证。
- Tests：未运行撤销测试；当前没有撤销实现。表格和命令是后续实施验收计划。
- 已确认：当前 host 会话内 30 秒撤销、不建历史回收站；刷新/host 重建失效。待实施冻结：连续删除入口、回执容量与保留期限。不得在解决前宣称候选协议已冻结。

2026-09-23 产品选择更新：用户明确选择“先做当前会话内 30 秒撤销，暂不建历史回收站”。此回答确认设计范围；本子任务仍只交付设计，撤销代码须另行实施规划与授权。会话定义为 host 实例生命周期，刷新/关闭/重建后撤销凭据失效；已提交回执重放与 30 秒可撤销期限分开处理。
