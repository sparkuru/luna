# 多设备自动同步与远端架构对比

## 结论

“设备直连 S3”和“设备登录服务端”都可以使用每台设备自己的 SQLite；真正不能做的是
让多个设备直接打开/覆盖同一个 SQLite 文件。当前已选择服务端控制面：服务端统一管理
身份、设备授权和 S3 配置，账本仍以客户端加密 revision graph 保存，服务端不需要拿到
账本明文。

## 同步交互

### 直连 S3

设备在本地提交后，将变更放入 outbox；应用打开、回前台、网络恢复或定时器触发时拉取
远端对象并进行条件写。非重叠修订自动合并，金融字段冲突进入待处理状态。

Web 端不能把“应用关闭后的固定周期同步”作为可靠承诺：Periodic Background Sync 目前
仍不是所有浏览器都支持的 Baseline 能力，实际触发时间还由浏览器和用户参与度决定。
Android 的 WorkManager 适合约束网络/电量的持久后台任务，但任务执行仍由系统调度。

### 服务端控制面

设备只登录 API。API 保存 user/device/ledger 绑定和远端版本，服务端使用一次配置的 S3
凭据读取/写入密文对象；客户端继续负责解密、合并和本地 SQLite 投影。API 可以通过轮询、
SSE 或 WebSocket 告知“远端版本变化”，客户端再拉取密文并执行同一套合并协议。

“发现差异后解决，再提示用户点击同步”建议具体化为：

1. 自动检查差异。
2. 无冲突：自动拉取、合并并上传，状态显示“已同步”。
3. 有财务冲突或无法确定：保留本地提交，显示待处理项；用户点击后选择解决方案。
4. 用户确认后再提交冲突修订，并继续条件写。

每笔普通新增不应都等待用户点击，否则本地优先和离线体验会退化为手动导入/导出。

## 离线与同步策略

客户端本地 SQLite 与远端同步是两个独立边界。已经登录并建立本地账本后，即使网络不可用
或服务端会话过期，也可以在本地继续读取、记账、编辑和查询；本地提交写入 outbox，
不因远端失败回滚。

默认自动策略下，应用活跃时在本地提交、启动/回前台、网络恢复时触发同一流程；用户
也可以按账本切换为手动策略。手动策略下，用户未点击同步前不访问 API。当前设备看得到
自己的新数据，其他设备和服务端备份看不到；点击同步后先拉取远端，再按 revision graph
合并。

因此“离线一直用”不等于“所有设备立即看到”，也不等于“服务器文件夹已经包含这些
数据”。服务器文件夹只能备份已经主动同步成功的共享账本；未同步的本地数据仍需设备
本地导出或平台备份。

## 配置与信任边界

直连模式需要每台设备获得受限 S3 配置；服务端模式只需服务端管理员配置一次 S3，
客户端拿到服务端 URL 和登录会话。账本密码/密钥仍应由端侧持有，不能因为引入统一
身份就变成服务端可解密的密码。服务端会话只控制远端同步，不应成为本地离线读写的
前置条件。

服务端模式新增账号恢复、设备撤销、会话保护和元数据数据库等责任；这是换取低配置、
统一登录和更好同步可观测性的成本。

## 参考资料

- MDN, Periodic Background Sync API（浏览器兼容性和调度限制）：
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API
- Chrome, Periodic Background Sync（安装 PWA、用户参与度和触发条件）：
  https://developer.chrome.com/docs/capabilities/periodic-background-sync
- Android, WorkManager（持久、可约束的后台工作）：
  https://developer.android.com/develop/background-work/background-tasks/persistent
- Android, WorkManager constraints（网络/电量等约束由系统调度）：
  https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work
- SQLite, WASM persistence（OPFS/VFS 和浏览器持久化边界）：
  https://www.sqlite.org/wasm/doc/trunk/persistence.md

上述平台能力只能支持“尽力而为”的后台检查；服务端模式改善的是统一授权、版本可见性
和通知入口，不应把网页后台任务描述成绝对可靠。
