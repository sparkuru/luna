# 生成 SDK：已提交源码独立复验

日期：2026-09-24；来源提交 `2c40315`。使用 `git archive HEAD` 将全部已跟踪源码
提取到 `/tmp/luna-sdk-clean.oTktqN/source`。本轮工作树另有直观记账 UI 的未提交
任务改动，归档不包含它们，也不复用主工作树的 `node_modules`。

## 已运行

1. 在独立归档中通过项目 `./hako` 执行 `npm ci`，安装锁定的 765 个包。
2. 生成前执行 `npm run api:check`，输出 `LUNA_API_REPRODUCIBLE`；随后执行
   `npm run api:generate` 和第二次 `api:check`，同样通过。
3. `diff -qr` 比对生成前后 `contracts/` 与 `src/api-client/generated/`，两处均无
   字节差异。已提交的 `src/api-client/generated/core/` 包含 16 个文件。
4. 同一独立归档运行 `typecheck`、`server:typecheck`、`web:build`，全部通过；
   `npm test` 为 214/214，`server:test` 为 26/26。

以上只证明当前**已提交** SDK 源码与本地构建门禁可复现。`npm ci` 报告四项高严重度
依赖公告，本轮未改动锁文件，也未进行依赖安全审查。

## 未覆盖

没有连接 VPS、公开 HTTPS 入口或物理 Android。AC4 的真实 HTTPS 账号/同步、AC5
的当前 APK 远端登录/同步，以及 AC6 的远端隔离部署与第二客户端验收仍保持部分
完成。隔离本地 SQLite/MinIO 恢复的当前源码证据另见
[SQLite 任务验证](../09-10-sqlite-self-hosted-sync/validation.md)，不能替代真实部署。

任务继续为 `in_progress`。`.trellis/spec/backend/http-api-guidelines.md` 已要求用
`api:check` 检查生成契约并禁止手改 SDK，本轮没有新增代码规范。

## 2026-09-24—25 当前提交续验（`f69e851`）

- `./hako npm run api:check` 再次输出 `LUNA_API_REPRODUCIBLE`，`./hako npm test`
  为 214/214；Web/API 从当前已提交源码独立构建成功。
- 在 `192.168.9.13` 的 `/tmp/luna-sdk-validation.HGNsyK`，以唯一 Compose project
  `luna-sdk-validation-20260924` 从 `git archive HEAD` 构建并启动 Web/API/MinIO/
  两阶段初始化。Web、API、MinIO 健康，Web 仅映射到主机回环 `127.0.0.1:18082`。
  Web/API/bucket-init 镜像 ID 分别为 `c10227f4d588`、`19c29e4512ca`、
  `92f083dd71df`；隔离 `data/` 与 `.luna/` 权限为 0700，两个密钥文件为 0600。
  这些检查证明当前 Compose 可启动，尚未覆盖 API 重启后数据保留或两客户端收敛。
- 经本机和 VPS 两个仅绑定回环的临时 SSH 转发，按先前授权临时启用独立
  `luna.majo.im` Nginx 站点。正常 CA 校验的公网 `/healthz` 返回 200，Web
  COOP/COEP 和 API 精确 CORS、`no-store, no-transform` 均可见。Chrome 在该真实
  HTTPS origin 上完成本地账本/交易、secure context、OPFS 与 Service Worker 检查。
  完整公开浏览器烟测未通过：一次性账号的 HTTP 登录请求返回 201，但脚本在 UI 账号
  确认处超时；当时账号元素存在，页面另显示工作区不匹配提示。尚不能判断是烟测
  状态/期望、旧数据状态，还是产品流程问题，故不能宣称账号、双客户端、手动同步或
  离线冷启动通过。烟测脚本已按当前记账入口、账号导航、首次绑定确认和账本选择页
  修正，并经独立静态复核与 typecheck；主机离线后尚未对修正版本进行公网复测。
- 当前源码 APK 通过容器构建、签名验证，SHA256 为
  `8b75c5139744f48d09ebc988b8ee194dbb9df53c1ed4ee716c15facdbe5d2731`，包名为
  `majo.im.luna.validation`。AIO-3568J / Android 11 / WebView 96 上，以 WebView
  离线网络模拟通过本地写入、离线刷新、进程重启持久化、无横向溢出与实体 Back 输入
  保留草稿。次日用户提供 PLR110 / Android 16 / WebView 143；同一 APK 在其
  `https://localhost` 安全 origin 上再次通过这些项目，`navigator.storage.getDirectory`
  可用，视口宽度与页面滚动宽度均为 427。PLR110 的独立验收包已卸载。
  这些是设备本地证据，尚无本轮 APK 经公网 HTTPS 的真实账号同步和证书信任结果。
- 2026-09-25，`192.168.9.13` 暂时离线，SSH 返回 `No route to host`；两条隧道
  已断。VPS 上本轮唯一临时站点
  `/etc/nginx/sites-enabled/luna-sdk-validation-20260924.conf` 已删除，`nginx -t`
  通过并 reload；公网 `/healthz` 恢复 HTTP 404，TLS 校验结果为 0。
  **待 9.13 上线后**，核对并清理唯一 project `luna-sdk-validation-20260924` 与
  `/tmp/luna-sdk-validation.HGNsyK` 中的合成数据；当前不能确认远端项目是否仍存在。
  旧 AIO-3568J 同时离线，其 `.validation` 包尚待确认并仅卸载该包；不能把这两项
  清理写成已完成。

AC1—AC3 保持通过，AC4—AC6 保持部分完成，任务不归档。远端恢复后先核对隔离资源
并完成上述精确清理，再按当前提交重测真实 HTTPS 账号、双客户端和 Android 远端同步。
