# 删除确认与撤销候选方案

状态：设计交付，未实现，未新增公开 API。用户批准的 E 范围仅为设计。

## 两个可选交付

| 方案 | 收益 | 代价/风险 | 建议 |
|---|---|---|---|
| 明确删除确认，暂不开放撤销 | 展示商户/金额/日期，降低误删，保留现有事务和同步 | 误确认后仍没有便捷恢复 | 可单独先做，不能宣称已经支持恢复 |
| 明确删除确认 + 当前会话短期撤销 | 误删后直接恢复同一交易，历史不丢 | 新 host API/令牌生命周期/各 adapter 原子性/同步和幂等测试 | 推荐后续采用，但先批准产品范围与契约 |

## 删除确认交互

复用已安装的 Radix alert-dialog 依赖和项目现有 Dialog 的 CSP/样式约束，增加薄封装，标题“删除这笔交易？”，正文显示 merchant→notes→category 降级标题、locale 日期和详情金额；摘要隐私不扩展到此详情。取消默认聚焦、危险按钮明确“删除交易”。Escape/取消零写入；成功关闭并聚焦原列表附近的可用控件；失败保留弹窗和恢复操作。

确认瞬间仍携带显示这条记录时捕获的 revision。后台更新后不得刷新成新 revision 再无提示删除。

## 拟定窄接口（不是当前类型）

```ts
type UndoDeleteReceipt = {
  transaction: Transaction;
  undoToken: string; // opaque, host-issued; no graph head or secret payload
  expiresAt: string;
};

deleteTransactionWithUndo(input: {
  id: string;
  expectedRevision: number;
  requestId: string;
}): Promise<UndoDeleteReceipt>;

undoTransactionDeletion(input: {
  undoToken: string;
  requestId: string;
}): Promise<Transaction>;
```

保留既有 deleteTransaction 兼容旧调用；新 renderer 仅在明确 capability 存在时展示撤销。requestId 绑定请求内容，重复 ID 不同内容必须拒绝。这里选择独立方法而非悄悄改变旧 delete 返回类型，使旧客户端/IPC 兼容边界清楚。

token 在 host 会话内映射到 profile ID、workspace ID、transaction ID、精确删除 head ID、预计 numeric revision、expiry 及一次请求结果。只存 opaque token 于 renderer；不持久化财务副本/秘密到 localStorage。必须有确定上限和清理策略，切 profile/logout/host dispose 时失效。是否需要跨重启恢复由产品范围决定，不在本方案默认承诺。

## 删除与撤销的事务顺序

1. 删除请求在 profile dispatch 边界固定 scope；host 在写事务中检验原 revision、migration lease、有且唯一有效 head。原子生成 tombstone graph revision 和投影。
2. 在同一 host operation 中建立 requestId→receipt 和 token→删除 head 的映射再返回；同会话重复请求返回已提交回执，不再次删除。若要跨进程失联重试，则需要 durable receipt/schema，这是扩展范围，不能宣称会话内表已解决。
3. 撤销先验证当前 host/scope 与请求身份；若同一 requestId 已提交且内容一致，先返回其原回执，不再检查撤销期限或当前 head。仅首次执行再验证 token 未消费且未过期，在本地写事务中读取当前 graph，不使用 renderer 提供的原交易内容。过期不得把已成功的请求误报成失败。
4. 当前 head 集合必须恰为凭据中的删除 head；多头、被别的操作替换、旧 scope、迁移锁均拒绝。未知的远端并发修改在后续 merge 中仍会形成显式冲突，不承诺本地检查能预知离线远端状态。
5. 复制该 tombstone 的有效值和附件引用，保持 id/createdAt/业务字段，deletedAt 设 null、updatedAt 用当前时间、numeric revision 加一；append 的 expectedHeadIds 固定为删除 head。原墓碑 revision 永久保留为祖先。
6. 原子提交 graph 与各 adapter 投影。native 的当前墓碑投影可随有效 head 更新移除，但**不删除 graph 中墓碑历史**；这与直接擦除墓碑以假装未删不同。记账金额由新投影派生。
7. 标记 token 已消费并保存同一 requestId 的已提交回执；profile host 将此方法纳入 committedLocalWrite 和 scheduleSync 列表。刷新失败仅提示已恢复/需刷新，不重放撤销。

token 消费与财务提交的一致性需在实现中证明：不能先消费再失败，也不能在提交后允许两个并发请求各追加一次。删除阶段也必须按 scope + requestId 串行登记 in-flight Promise，并在写前预留回执容量；撤销阶段按 token 串行 + 事务头检查。已提交回执的保留期独立于可撤销期限，不能过期即删，否则响应丢失后无法重放。回执容量达到上限时应在写前拒绝新带撤销删除，不能事后把已提交删除报告成失败；具体上限/保留期由实施契约冻结并测试。进程崩溃时会话 token 整体失效，以持久化 graph 为真。超时后同会话查询 receipt，跨重启展示实际账本并要求新明确操作。

## 错误与状态

| 状态/错误（拟定） | 用户反馈 | 写入 |
|---|---|---|
| deleted/undo available | 已删除，撤销入口及可理解的有效期 | tombstone 已提交 |
| undo pending | 正在恢复，按钮禁用 | 尚不可声称成功 |
| undone | 已恢复到原日期，若不在当前月提供查看入口 | 新 revision 已提交 |
| expired/session-lost | 撤销已过期/当前会话已结束，不承诺记录永久丢失 | 无 |
| stale-heads/conflict | 记录已在别处更改，前往冲突/刷新 | 无 |
| scope-mismatch | 已切换账本，不能恢复到当前账本 | 无 |
| migration-locked | 正在迁移，请稍后重试（仍在有效期才可重试） | 无 |
| persistence failure | 恢复失败，保留凭据供有效期内重试 | 回滚 |
| committed-refresh-failed | 已恢复，但显示更新失败；重试读取 | 不重放 |
| duplicate request | 返回原提交回执 | 零重复 revision |

## 兼容、迁移与回滚

现有 graph schema 接受 active/tombstone transaction 值与合法的新 revision，因此**预计**不需要 graph/envelope 版本升级；必须用旧解码器 fixture 验证，不能凭类型推断。API、IPC 和 profile proxy 需要显式新能力。会话内短期方案预计不需要 durable token 表；若用户选择重启后历史恢复，则需另立存储与历史索引设计。

降级到旧 UI 可隐藏新入口，但不能回滚已生成 graph 历史。旧客户端收到恢复 revision 应按现有合并投影显示；旧客户端离线编辑旧版本仍形成冲突，不允许 timestamps/LWW 静默胜出。

## 竞态与测试矩阵

| 场景 | 应证明的结果 | 测试层 |
|---|---|---|
| 本地删除后撤销 | ID/字段/拆分/原日期/附件保留，revision +1，墓碑祖先保留 | domain + graph + Web/native |
| 双击/同 requestId 重发 | 一个新 head，一个回执 | host + adapter |
| 同 requestId 不同 token | 拒绝，无新写入 | API contract |
| 已知远端编辑/再删除先到达 | heads 不匹配，拒绝撤销或显式冲突 | graph + 两客户端 |
| 未知离线远端编辑后合并 | 两头冲突，财务统计不重复计入 | browser sync |
| 第二撤销/其他 mutation 抢先 | 不重复恢复，不升级旧期望值 | 并发 adapter |
| 切换 profile 后旧回调 | 不改新 profile，不污染其提示 | ServerHost |
| logout/expiry/重启 | token 不可重用，账本 committed state 正确 | session + reload |
| 缺本地图像 | 不泄露 descriptor，明确缺图状态，不错误标完整 | attachment + UI |
| 事务中途失败 | graph/projection/token 可重试状态一致 | SQLite/OPFS/IDB 故障注入 |
| 提交成功但回执/刷新丢失 | 同会话幂等回执，不产生第二个恢复 revision | host + React E2E |
| 旧客户端/旧备份并集合并 | 不丢历史、不复活更早祖先、不破坏 envelope | golden fixtures |

## 后续实施工作包

1. 按已确认的 host 会话内 30 秒范围冻结可发现入口；不要求跨重启历史恢复。
2. 写 shared DTO/capability/错误及 graph 独立 fixture；审查受控 head 比较。
3. 实现 native/Web/兼容 IDB host 事务和会话 receipt，补迁移锁和失败原子性。
4. 扩展 IPC/preload/profile committed-write/sync 调度，测试 scope 和晚到回调。
5. 实现确认弹窗、结果反馈、撤销及焦点；不改变详情金额的已有隐私范围。
6. 跑 typecheck、shared/native/Web、contracts、server-sync、生产浏览器双客户端及图片完整备份回归；再做实际原生边界验收。

## 已确认产品选择

建议第一版提供“当前会话最近一次删除、短时间可撤销”，先不建历史回收站；用户已确认 30 秒，入口在持久到过期的结果区域，不能仅用 3 秒消失的 toast。替代方案是长期历史恢复，用户更从容，但需历史检索、权限/存储和跨重启恢复契约。此选择不阻塞已经批准的 A–D 实施。

## 评审补充：生命周期与入口约束

“当前会话”在此候选方案指 host 实例生命周期，不等同于登录会话。现有 Web 账户 session vault 可跨普通刷新恢复登录，但候选撤销 token 不进入该 vault；刷新、关闭页面或 host 重建均失效，UI 必须预先说明“刷新或离开后不可撤销”。跨刷新撤销若被产品要求，需另行设计会话保存与恢复，不能隐含承诺。

“最近一次”建议仅限制主界面展示；新删除替换结果区域时，不使之前尚未过期的 host token 与已提交回执静默失效。明确被撤销的商户/日期，避免迟到响应覆盖新删除的入口。结果区域需跨同一 host 的页内导航保留，离开记录月份后仍可到达；不要把撤销仅藏在已经删除的行内。30 秒已获产品选择确认，实施仍需评估键盘/辅助技术操作所需时间及是否允许延长，避免倒计时每秒打断读屏。多个连续删除的入口策略、超期后历史说明也是待决项。

### 后续可执行验证命令（尚未运行撤销用例）

新增各层用例后执行：

```sh
./hako npm run typecheck
./hako npm test
./hako npm run test:contracts
./hako npm run test:server-sync
./hako npm run web:build
./hako env LUNA_TEST_PRODUCTION=1 npm run test:web -- --workers=4
```

单测必须增加“成功回执丢失→超出30秒→相同 requestId 重试仍返回成功”“两个并行相同删除 requestId 仅一个墓碑”“回执容量不足在写前失败”“刷新保留登录但令牌失效”“第二次删除与第一次迟到回执”的确定性时钟/屏障向量。真实 Electron、Android 和读屏焦点/时限仍需独立验收，不能由上述浏览器命令代替。

2026-09-23 产品选择更新：用户明确选择“先做当前会话内 30 秒撤销，暂不建历史回收站”。此回答确认设计范围；本子任务仍只交付设计，撤销代码须另行实施规划与授权。会话定义为 host 实例生命周期，刷新/关闭/重建后撤销凭据失效；已提交回执重放与 30 秒可撤销期限分开处理。
