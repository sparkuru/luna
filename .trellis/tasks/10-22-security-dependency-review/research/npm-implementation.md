# npm 安全补丁实施（2026-10-22）

> 下文是分工实施阶段记录；后续完整验证及提交状态以 [validation.md](../validation.md) 为准。

## 变更范围与实际锁定版本

仅修改 `package.json`、`package-lock.json`；未修改业务源码、生成 SDK 或 Android 原生代码。
Capacitor 的 Android 打包与 `cap sync` 由主会话后续容器构建门禁验证，未声称本记录完成设备验收。

| 包 | 原版本 | 本轮锁定版本 |
| --- | --- | --- |
| @capacitor/android / core / cli | 8.5.0 | 8.5.3（配对） |
| Electron | 44.0.0 | 44.9.3 |
| Vite | 6.4.3 | 6.4.5 |
| Fastify | 5.12.3 | 5.12.7 |
| js-yaml override | 4.3.1 | 4.3.2 |
| fast-uri 3 / 4 | 3.1.6 / 4.1.4 | 3.1.9 / 4.2.3 |
| undici | 7.29.0 | 7.30.1 |
| brace-expansion 1 / 2 / 5 | 1.1.18 / 2.1.4 / 5.0.9 | 1.1.21 / 2.1.7 / 5.0.12 |
| source-map-js | 1.2.1 | 1.2.2 |
| ip-address | 10.7.0 | 10.7.4 |

相对 `73b4384`，锁文件恰有 18 个路径的版本变化，没有新增/删除包路径。
直接版本和既有 js-yaml override 外，传递补丁通过原父依赖的 semver 约束自然解析，未增加 override。
Forge 三项保留 7.11.2；Hey API 保留 0.99.0；tar/tmp/uuid/ZIP alias 覆盖全部保留。
未运行无目标 `npm update`、`npm audit fix` 或 `--force`。

## 实际执行与结果

均使用项目 `./hako`，初始开发镜像中 Node 为 22.22.0；升级后镜像和广泛回归由主会话另记。

1. `./hako npm install --package-lock-only --ignore-scripts --no-audit --no-fund`：退出 0，七项声明/override 变更。
2. `./hako npm update fast-uri undici brace-expansion source-map-js ip-address --package-lock-only --ignore-scripts --no-audit --no-fund`：退出 0，11 个传递路径变更。
3. `./hako npm ci --no-audit --no-fund`：退出 0，765 个包，可重现锁文件安装成功。
   npm 报告旧 Forge 树的 deprecated 包及既有固定 git node-gyp 跳过 integrity 警告，未隐藏或改写来源。
4. Node 内存 SQLite 打开、`select sqlite_version()`、关闭：退出 0，Node 22.22.0 / ABI 127 / SQLite 3.53.4。
   安装已得到 Node 适用的原生模块，没有运行 Electron rebuild；共享 node_modules 已交给主会话串行安排最终原生打包。
5. `./hako npm run typecheck`：退出 0。
6. `./hako npm run server:typecheck`：退出 0。
7. 全量 audit：退出 1（确有残留），原始结果保存为 [npm-audit-post-all.json](npm-audit-post-all.json)。
8. `--omit=dev` audit：退出 0，原始结果保存为 [npm-audit-post-prod.json](npm-audit-post-prod.json)。
9. `git diff --check -- package.json package-lock.json`：退出 0；声明依赖与 lock 根元数据一致。

audit 命令是 `./hako npm audit --package-lock-only --ignore-scripts --json`，生产集合另加 `--omit=dev`。
两种结果均于 2026-10-22 实测；该集合不是实际运行镜像完整 SBOM，也不能替代 Electron/Node 内置库或 MinIO 评估。

## audit 前后与残留路径

| 集合 | 升级前 | 升级后 |
| --- | --- | --- |
| 全量 | 36：critical 1 / high 15 / moderate 20 | 23：critical 0 / high 6 / moderate 17 |
| omit-dev | 3：critical 1 / high 1 / moderate 1 | 0 |

全量残留是下列三个直接公告及其 20 个父包的传递标记，不是 23 个独立公告。
使用 `npm explain` 和锁文件实际父依赖确认以下路径：

- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)，high：
  `@electron-forge/cli@7.11.2 → @electron-forge/core@7.11.2 → fast-glob@3.3.3 → micromatch@4.0.8 → braces@3.0.3`。
  公告匹配当前最高已发布版本；不引入未验证 fork。
- [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)，moderate：
  Forge cli/core 或其 `@electron/packager@18.4.4 → @electron/get@3.1.0 → global-agent@3.0.0（optional） → roarr@2.15.4 → sprintf-js@1.1.3`。
  Electron 44.9.3 自身另有 `@electron/get@5.1.0`，不能把根级旧 Forge 下载链与该路径混为一谈。
  公告匹配当前最高已发布 sprintf-js；不强行跨主版本覆盖旧下载链。
- [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)，high：
  Forge core/maker-zip、`@electron/get@3.1.0` 或 `@electron/rebuild@3.7.2 → got@11.8.6 → cacheable-request@7.0.4 → http-cache-semantics@4.2.0`；
  另一路为 `@electron/rebuild@3.7.2 → @electron/node-gyp@10.2.0-electron.1 → make-fetch-happen@10.2.1 → http-cache-semantics@4.2.0`。

所有剩余公告命中包在锁文件标为 dev；sprintf-js 另为 optional。
这仅说明 npm 依赖用途标记，未将构建过程风险判定为不可利用，也未称打包产物安全审计通过。
Forge 8 迁移仍在本批次范围外，能否消除全部路径需另行验证。

## http-cache-semantics 4.3.0 的评估

2026-10-22 再读[官方仓库 releases](https://github.com/kornelski/http-cache-semantics/releases)未找到发布说明；
上述 GitHub 公告仍写 `Patched versions: None`，范围为 `<=4.2.0`。
执行 `./hako npm diff --diff=http-cache-semantics@4.2.0 --diff=http-cache-semantics@4.3.0` 退出 0，
对比 npm 发布的完整包差异：新增 cached-response status 返回与 `status()`，调整 Vary 字段匹配（逐项 `*` 与 own-property 检查），
以及 package author/dev dependency 元数据。差异中没有 max-stale 或 security-zeroed cache-entry 处理变更。
因此无法确认 4.3.0 修复该公告；经主会话同意保留 4.2.0，并保留 audit 命中，避免把脱离数据库范围冒充修复证据。

## 后续边界

主会话继续升级开发镜像与执行单元/API/契约/同步、生产 Web 浏览器、Electron package/make/sandbox smoke、APK 和容器回归。
本记录没有声明以上后续检查已通过；未提交、推送、部署、归档或接触真实数据。
原报告中的 Electron 内置 Node 尚缺最新回移、MinIO 维护路线与实体设备/线上验证限制继续有效。

## Electron 文件输入烟测退出时序修正

主会话最终打包后，原烟测在 `LUNA_PACKAGED_FILE_INPUT_SMOKE_OK` 后退出 1：
`finally` 用 `evaluate(app.exit(0))` 请求退出，调试连接断开被 catch 吞掉，随即同步递归删除临时 HOME。
子进程仍可写入 `.config/Luna`，导致清理报 ENOTEMPTY。首次日志为
`/tmp/luna-security-electron-file-input.log`，该 marker 没有构成最终通过证据。

仅调整 `scripts/smoke-electron-file-input.ts` 的启动/退出边界：
用 `await electronApp?.close()` 代替直接 app.exit 与吞错，再删除临时 HOME。
检查已安装 Playwright 1.63.0 的 `playwright-core/lib/coreBundle.js`：ElectronApplication.close
经 BrowserContext 的 custom close handler 调用 app.quit，等待 app-close promise；该事件由
launchProcess 的 onExit 发出。因此清理明确依赖进程结束，无任意 sleep/删除重试或被吞掉的清理错误。
Luna 的 before-quit 仍能完成 profileHost.dispose 和本地存储关闭。

同一份 Playwright 源码表明 Linux launch 未设置 chromiumSandbox 时会自动追加 --no-sandbox；
原助手的空 args 并不能证明 sandbox 已启用。经主会话同意，显式设置 `chromiumSandbox: !noSandbox`。
既有显式环境 opt-out 语义保留，本轮重跑没有设置该 opt-out。
实际 chooser/文件 normalization/本地保存/解密 readback 断言全部保留。

重跑命令：
`xvfb-run -a /tmp/luna-security-node22 node_modules/tsx/dist/cli.mjs scripts/smoke-electron-file-input.ts`
（stdout/stderr 保存至 `/tmp/luna-security-electron-file-input-retry.log`）。
本轮真实结果：退出 **0**，输出 `LUNA_PACKAGED_FILE_INPUT_SMOKE_OK`，无 ENOTEMPTY 或关闭异常。
该运行使用主会话提供的已打包 Electron 44.9.3（内置 Node 24.22.0），
测试驱动为临时 Node 22.23.4，另用 Xvfb、默认 sandbox 与临时 profile；
未安装依赖、切换 ABI、重建产物或修改真实用户数据。`git diff --check` 通过。
宿主 GTK/Windows/macOS 原生对话框视觉仍为单独验收边界，本修正不声称覆盖。

## Android 原生日期烟测的月份夹具修正

首次完整新 APK 烟测已通过隔离 AVD/安装/安全离线 UI 和真实 Android 日期选择，随后在
`scripts/smoke-android.ts:352` 的保存后列表断言失败：期望 12.50，实际为
`No transactions in October 2026`。失败日志为 `/tmp/luna-security-android-smoke-retry.log`。
日期助手固定填入 2026-09-28、选择 2026-09-29，当前列表却按真实 2026-10 月筛选。
这是跨月后暴露的夹具错误；产品保留月份筛选是正确行为，不是依赖升级的业务回归证据。

仅修改 `scripts/smoke-android.ts`：从实际 `#transaction-date` 初始 ISO 值提取 YYYY-MM，
以同月 15 日打开原生对话框，选择同月 16 日（每个月均存在）。Native Intl 日标签和
可见 YYYY/MM/DD 投影期望均由目标 ISO 动态派生。真实系统对话框点击、选中状态、保存后
列表、ISO 读回及 force-stop/restart 持久化断言全部保留；未切换全月份列表、改全局设备时间、
增加超时或跳过断言。

只读检查发现 helpers 中 `scripts/android-backup-smoke.ts:65` 另有 `getSnapshot('2026-09')`。
追踪 `src/web/web-api.ts:503-520` 确认 snapshot 的 transactions 是完整投影（月份仅影响
summary/budget），该备份比较没有相同的列表月份过滤问题，未扩展修改。
浏览器 Android 日期显示测试使用固定 September 并显式查询该月，也不依赖当前月份列表。

`./hako npm run typecheck` 和限定路径的 `git diff --check` 均退出 0。
本 worker 未连接设备、启动容器服务、安装依赖或重建 ABI；完整原生烟测由主会话重跑并记录结果，
本节不把上述首次失败计为通过。
