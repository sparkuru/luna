# 2026-10-06 本地产物归整记录

用户已回复“开始”授权目录整理。精确候选归整至仓库根的 ignored
`archive/2026-10-06/`：原规划目标 `artifacts/archive/` 的父目录在本执行环境中
观察为 nobody:nogroup 0755，当前用户无法写入。主会话
因此选择已被现有 `archive` 规则忽略、可直接写入的根目录；未使用 sudo
修改文件、chmod、chown 或递归改权限，`artifacts/` 原权限保持。

完整逐项来源、目标、类型、SHA256、字节数、权限、uid/gid、mtime_ns 和
symlink target 的 before/after 在 [manifest](artifact-manifest.json)。采用
同一文件系统内的精确 rename，迁移前拒绝已存在的目标、未知文件类型和
发生变化的来源，没有合并覆盖。所有材料保留，包括加密备份、原图、诊断
脚本、报告静态资源和桌面包；没有永久删除证据。

| 原路径 | 当前路径（仓库根相对） | 条目 | 普通文件 bytes |
| --- | --- | ---: | ---: |
| `captures/` | `archive/2026-10-06/captures/` | 593 | 87,565,597 |
| `out/` | `archive/2026-10-06/out/` | 85 | 309,518,953 |
| `playwright-report/` | `archive/2026-10-06/playwright-report/` | 2 | 567,795 |
| `test-results/` | `archive/2026-10-06/test-results/` | 2 | 45 |
| `.tmp-tsx/` | `archive/2026-10-06/.tmp-tsx/` | 2 | 0 |
| `artifacts/android/android-entry-date-projection.png` | `archive/2026-10-06/android-captures/android-entry-date-projection.png` | 1 | 143,085 |
| `artifacts/android/android-offline-created.png` | `archive/2026-10-06/android-captures/android-offline-created.png` | 1 | 127,708 |
| `artifacts/android/android-offline-restarted.png` | `archive/2026-10-06/android-captures/android-offline-restarted.png` | 1 | 28,425 |
| `artifacts/android/android-synced-restarted.png` | `archive/2026-10-06/android-captures/android-synced-restarted.png` | 1 | 28,513 |

9 个精确映射，共 688 条目：618 个普通文件、70 个目录、0 个 symlink，
合计 397,980,121 bytes。目录条目包含每个来源根和所有空目录；`.tmp-tsx/`
只含两个空目录。逐条内容及上述元数据 before/after 完全一致，旧路径均不存在。
两个 APK 和两个 `.sha256` sidecar 的内容、权限、uid/gid、mtime_ns 原位相同。
源父目录增加/减少子项导致的目录时间变化不属于被移动条目元数据。

## 闲置判断与保留边界

迁移前对全量候选作两次内容及元数据快照，中间间隔两秒，两次完全一致；
移动操作前再次逐项比对。只读 host probe 核验 507 个进程的 cwd、exe、root、
打开 fd 和内存映射，没有候选路径引用，同时核验所有运行容器的 mount。
Luna 预览容器仍将仓库根挂载到 `/app`；这是包含产物目录的广义可见范围，
其 Vite source 开发入口没有消费这些包/报告，未停止或重启容器。
未输出进程命令参数、环境或凭据。probe helper 和只含元数据的结果为
`/tmp/luna-cleanup-idle.py`、`/tmp/luna-cleanup-idle.json`；元数据结果已保留为
[闲置检查](artifact-idle-check.json)。

该判断是时间点观察，并非 writer lock；退出中的进程及瞬时打开文件可能
躲过 probe。不宣称宿主不存在所有潜在读写者。现有候选的稳定快照、无依赖
引用和开发入口一起支持本次闲置归整；后续工具仍可生成新的默认输出。

保留 `artifacts/android/luna-debug.apk`、`luna-lan-debug.apk` 及 sidecar；
`dist/`、`dist-web/`、`.vite/`、`node_modules/`、`.devhome/`、`data/`、`.env`、
个人助手目录和凭据目录不迁移或清除。没有运行产品测试、构建、设备操作、
部署、stage、commit 或 Trellis task 归档。

## 链接与历史边界

- 更新 UX audit 图集导航及 mobile-ledger-entry 的三条截图导航，共四条。
  后三条旧相对链接只回溯三个目录，原本已经失效；修正到保存的 intended
  root captures 文件，并保留截图可能被后续测试刷新、不能证明旧冻结版本的说明。
- 两份历史证据文档和当前 visual-refinement validation 添加本迁移入口。
  历史普通文本路径、命令、旧 APK/hash、曾被覆盖的报告说明和任务状态不改写。
  任意历史 `captures/<suffix>`、`out/<suffix>`、报告路径可按上述精确前缀查找；
  只有 manifest 收录的材料实际保留，旧报告中的不存在路径不会被重新制造。
- 8 份归档 HTML 的全部静态 href/src 共 262 条本地边通过 before inventory
  与 after 实际文件核验。其中 245 条有文件，17 条为 Chromium 第三方许可
  HTML 原有 `Internal`／`canonical repository` 文字占位链接，迁移前后均不存在。
  两套图集及 Playwright trace viewer 的静态相对资源完整，无新增断链。
  HTML 内嵌 JavaScript 未执行；不把静态链接完整性当成历史测试重验。
- 四条修订 Markdown 导航全部可达，结果见 [链接检查](artifact-link-check.json)。
  visual-refinement 的 `/tmp` 及 `.devhome` 证据不动，既有 overwritten-trace
  限制继续有效；目录归整不改变其 review 状态或验收结论。

## 实际校验与回退

从仓库根可独立重跑只读核验（helper 为本轮 `/tmp` 临时文件）：

```text
python3 /tmp/luna_cleanup_artifacts.py verify --manifest .trellis/tasks/10-06-repository-cleanup/research/artifact-manifest.json
python3 /tmp/luna-cleanup-links.py
```

两项已通过；第一项逐条比较 target 与 before，并验证旧来源缺失及四个固定
Android 文件不变。JSON 完整清单是长期证据，不依赖临时 helper 存续。
`git diff --check` 通过；`git check-ignore --no-index -v -n --stdin` 核验
根 archive、产物/报告、`.env`、`data/`、新增 `/.tmp-tsx/` 仍被忽略，
`.env.example`、generated API core、Trellis task archive 仍有跟踪例外。
`.gitignore` 仅去重后出现的 `.gradle/`、`*.egg` 并添加临时目录边界。
package、Forge、Compose、Dockerfile、Playwright、scripts/tests 无 diff，
APK、桌面包装和测试生成默认路径保持原契约。

若需回退，先确认工具没有在旧位置生成新文件、目标与 manifest 一致，
按每个 `target → source` 反向 rename 并恢复四条导航。只在旧来源不存在时
操作；有新产物时另存保留，不覆盖或合并。归整材料均在 ignored archive，
普通 Git 提交不会携带这些本地文件；需要共享证据时一并携带对应归档树。
