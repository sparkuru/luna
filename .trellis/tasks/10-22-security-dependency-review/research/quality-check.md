# 安全补丁独立复核（2026-10-22）

## 范围与当前结论

对照基线 `73b4384`、当前 PRD/design/implement、14 项 check context 和完整工作差异复核。
完整读取注入被截断/省略的原始规范；不复用历史任务验收，不运行并发安装、原生重建或服务操作。
关闭复核已覆盖最终脚本与规范差异，未发现产品回归或断言弱化；`src/`、SDK、协议和持久化格式均未修改。
新 dev 镜像（包括 zip 工具）、make ZIP、该 ZIP 解包烟测及新镜像 focused browser 均已实际成功，最终任务记录与结果一致。
**提交就绪，human-not-needed。** 主会话可按现有授权将任务设为 review、显式暂存本任务范围并作本地工作提交；本结论不表示已提交或授权归档。

## 复核证据

- `package.json` 六项直接包声明与 js-yaml override 共七项值变更；Capacitor 三包同为 `8.5.3`。
- 独立解析基线/当前 lock：恰好 18 个包路径的版本变化，没有增加/删除路径，各包主版本保持。
  当前 dependencies/devDependencies/engines 与 lock 根元数据完全一致。
- tar/tmp/uuid/ZIP alias 原有 override 保留；Forge `7.11.2`、Hey API `0.99.0`、SQLite-WASM、业务源码和生成 SDK 未改。
- 容器、Compose、恢复入口和真实 build-context 测试共 11 处版本引用同步。
  现行代码/配置/规范中没有遗漏的 Node `22.22.0` 或其他被替换镜像固定值；历史调查与归档证据保持原值。
- Dockerfile/Compose 除版本替换外，仅 dev stage 增加已复现 ZIP maker `spawn zip ENOENT` 所需的 zip 安装层。
  非 root、read-only、网络、权限、挂载、初始化及生命周期配置保留。
  MinIO 固定 tag/digest 保留；维护渠道、许可和数据迁移不属于本批次，原风险未声称消除。
- 独立解析升级后 audit JSON：全量 23（critical 0 / high 6 / moderate 17），omit-dev 0。
  直接公告仅为 braces、http-cache-semantics、sprintf-js；其余为父包传递标记。
  用途标记不代表构建风险不可利用，omit-dev 也不是 API 镜像完整 SBOM。
- http-cache-semantics `4.3.0` 的版本存在不足以证明修复；保留 `4.2.0` 与命中记录符合已记录的调查取舍。
- Node 容器与 Electron 内置 Node 分开记载。共享 node_modules 的 SQLite Node/Electron ABI 由主会话串行安排，静态版本检查不替代原生产物运行。
- R8 的两份烟测修正符合已观察根因：Electron 明确传入 `chromiumSandbox: !noSandbox`，保留显式诊断 opt-out，等待应用 close 后再删临时 profile。
  独立查看已安装 Playwright 的 Electron launch/close 实现，确认默认 Linux 会补 `--no-sandbox`，而 custom close 等待 app-close promise。
  产品 BrowserWindow 自身 `sandbox: true` 保留；未增加关闭异常吞错或任意等待。原图片选择、normalization、保存和解密读回断言未改。
- Android 从实际 ISO 日期派生同月 15→16，仍点击真实原生日标签、验证 checked 状态、投影/ISO、保存列表和 force-stop 后读回。
  未改过滤器、设备日期、超时或跳过断言；19 组完整烟测结果与保存的 JSON 一致。
- backend quality/index 与 Android runtime 规范已同步 audit 用途范围、ABI 顺序、sandbox/退出证据和原生日期夹具约束。
- 独立读取 `final-artifacts.json` 并对实际 ZIP/APK 重算大小与 SHA256，二者均完全匹配；全部 research JSON 解析成功。
  新镜像 ID 与 final build export 一致，最终 Electron 的 Node `24.22.0` / ABI149 与恢复后的开发 Node `22.23.4` / ABI127 分开记录。

## 已修正

- `check.jsonl`：删除初始化模板 `_example` 记录，保留 14 项真实 spec/research 条目；已告知主会话并获同意。
- 先前指出的调查阶段旧措辞已由主会话在 mainline、implement、validation 与 task metadata 中区分为历史调查和当前实施；当前记录不再声称尚未升级。

## 验证状态

| 检查 | 当前结果与证据 |
| --- | --- |
| Lint/格式 | 无单独 lint script；`git diff --check` 通过 |
| Context | `task.py validate` 通过，implement/check 均为 14 个有效条目 |
| Lock/版本 | 独立静态解析通过，18 路径且无跨主版本 |
| Root/server TypeCheck | 已读新 Node 22.23.4 hako 日志；复核者另用该 Node 的临时二进制运行两项 `tsc --noEmit`，均 exit 0，覆盖最终脚本改动 |
| 单元/API/契约/同步 | 已读取本轮 `/tmp/luna-security-{unit,server-test,contracts,server-sync}.log`：226/26/6/9，全无失败或跳过 |
| API 生成 | 本轮 `api-check.log` 含 `LUNA_API_REPRODUCIBLE` |
| Web/server 构建 | 本轮本地 Web 与 server 构建日志完成；API/Web/bucket-init 镜像 export 完成 |
| 生产 Browser | `/tmp/luna-security-browser.log`：344 passed（desktop/narrow 各 172），无跳过；在原有浏览器工具镜像运行，不冒充新 dev 镜像验证 |
| Electron package/默认 sandbox | make 日志的 package 阶段完成；`electron-smoke.log` 为 storage/IPC/reopen 成功；文件输入 `electron-file-input-retry.log` marker 成功且主会话确认 exit 0，旧 ENOTEMPTY 失败保留 |
| APK/Android runtime | APK 构建、签名与哈希核验完成；`android-smoke-final.log` 完整 19 组通过且主会话确认 exit 0，`android-runtime-result.json` 保存 Android 16/WebView/同一 APK SHA256；包含真实原生日期、BACK、图片及 SAF/解密读回 |
| 部署/preview/restore/nginx | 已读本轮日志：17/13/8 通过（deploy 含真实 Docker context）；新 nginx runtime marker 通过，覆盖非 root/read-only、隔离头/路由/API 代理 |
| 新 dev 镜像 | `dev-build-final.log` 成功 export `sha256:b4936ec7a835b5c2fbbe188658691332ea77771f7000f317395c21d5fd88a8ee`，含 zip；运行时 Node22.23.4/Chrome156，主会话确认 exit 0 |
| 最终 made ZIP | `electron-make-final.log` 成功完成 ZIP；完整性校验通过。解包后的 `made-storage.log` 与 `made-file-input.log` 均有成功 marker、主会话确认 exit 0，默认 sandbox；首次 ENOENT/ENOTEMPTY 失败记录保留 |
| 新镜像 Browser 专项 | `browser-final.log`：桌面/窄屏 18 passed，53.6s，无跳过；final-artifacts 记录同一新镜像和 exit 0，不冒充再跑完整 344 项 |
| 开发 Node ABI 恢复 | `node-addon-restore.log` rebuild 成功；`node-addon-runtime.json` 实际查询 SQLite3.53.4，Node22.23.4/ABI127，避免后续开发误用 Electron ABI |

## 人工复核分类与边界

当前是依赖/镜像安全补丁，未新增或改变用户流程、存储格式、生产部署、许可或数据迁移。
用户已明确委托更新、可观测验证和本地提交；无需再次征求规划或同一范围验收许可。
人工分类为 `human-not-needed`：适用门禁与最终任务记录已完成且残留风险如实披露，可按既有授权本地提交，无待修复的产品或验证问题。
Android 16 隔离 AVD 的安装后持久化/原生 SAF 已实测；实体设备、不同旧 WebView、桌面对话框视觉及线上 TLS/长期运行等未在本轮重验，保留未覆盖，不能推定通过。
这些现存平台/生产边界不因无相关源码或部署变更而新增本地提交阻断条件。
剩余构建树公告、MinIO 维护路线与 Electron 内置 Node 回移缺口继续披露；本复核不是独立生产安全审计。
