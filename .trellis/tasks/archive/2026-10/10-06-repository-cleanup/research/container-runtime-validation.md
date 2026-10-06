# 容器阶段实际验证

2026-10-06 使用 Docker Engine 26.1.5、Compose 2.26.1-4 与原已缓存依赖，
针对最终 Docker 路径和 ignore 做以下实测。宿主 Node 20.19.2 仅用于调用 Docker 的
隔离 smoke helper；应用构建和开发/typecheck 使用项目 Node 22.22.0 容器。
没有安装或升级依赖，没有变更用户镜像标签、真实配置、data 或原 APK。

## 构建与入口

本轮创建唯一后缀 `cleanup-fptvby` 的临时镜像；以下所有最终命令 exit 0。
日志和 scratch helper 在 `/tmp/luna-container-runtime.FPTvBy/`。
关键 report 的非秘密字段另存为 [持久结果](container-runtime-results.json)，
保留八项恢复、五项 Compose、provider 次数和 APK checksum，避免只依赖临时日志。

| 文件/target | 临时镜像 | image ID | 证据 |
| --- | --- | --- | --- |
| docker/Dockerfile.server / api | luna-cleanup-api:cleanup-fptvby | 2483ce467999ac00d42521e41458f922acdf5975609efe01fee51629b39dc65b | build-api.log |
| docker/Dockerfile.server / bucket-init | luna-cleanup-bucket-init:cleanup-fptvby | dbbd70825d2b652061ac80176c0228579c577ebe9f63f84ed986f05c2986500e | build-bucket.log |
| docker/Dockerfile.web / runtime | luna-cleanup-web:cleanup-fptvby | 5f0fb9796f9246c270e6489998a672e7a48554b2fc6ef2784bece1f80e5ae73d | build-web-retry.log |
| docker/Dockerfile.web / dev | luna-cleanup-dev:cleanup-fptvby | 183cf7e2dae32c2958cf6b5dbd3baa53e84f18a456acf329062e3dcdbba02822 | build-dev.log |
| docker/Dockerfile.android / export | luna-cleanup-android:cleanup-fptvby | 5d64e1611a741b299a4542e2af65751c997edfcffebd5dd270b6e95eddccfb78 | build-android-final.log |

实际命令为 `docker build --progress=plain --target TARGET --tag TEMP-TAG --file FILE .`。
Web/Android 首次构建因新增 `**/data/` 误排除 `src/renderer/data/local.tsx` 失败；
修复为 `/data/` 后重新构建成功。原失败日志保留为 build-web.log/build-android.log，
不掩盖初次失败。源码和两份 Dockerfile 均未修改。

独立复核又用合成 fixture 复现 Android 签名 deny 只覆盖 android/**，会放行 src
下同类文件；将两条规则改为全局 `**/*.jks`、`**/*.keystore` 后回归 4/4。
最终 Android ignore SHA256 为 `c451f64bc1517e9a6277cfaa312acb94ebf70c90b5273c370d5694059cc446fb`。
据此重新构建 export 和临时导出/sidecar 均成功，image ID 不变；API/bucket-init/dev
也以最终根 ignore 补齐构建，image ID 均与上表相同。

Android Gradle assembleDebug、apksigner verify 在镜像构建内通过。
以 network none、read-only、UID 1000、cap-drop ALL、no-new-privileges 运行 export
入口，输出到专属 `apk-output/`，sidecar 的 `sha256sum -c` 返回 OK。
这证明构建和导出入口；不作为新 APK 的实体设备安装/交互或 emulator/KVM 运行证据。

## 合并 target 的恢复与主 Compose

`LUNA_RESTORE_API_IMAGE=luna-cleanup-api:cleanup-fptvby
LUNA_RESTORE_BUCKET_INIT_IMAGE=luna-cleanup-bucket-init:cleanup-fptvby
node scripts/smoke-server-restore.mjs`：exit 0，八项检查通过。
独立 label/network/data 下验证新安装、停写后的完整 data 复制、身份/会话/账本和
附件恢复、两客户端 CAS/合并、重启持久化、旧 root runtime 的有限密钥升级、
中断凭据发布后的孤儿 key 撤销、初始化实例缺桶时拒绝空桶替换。
helper 按 label 检查归属并清理自己的容器/网络；证据为 restore.log 和对应 report.json。

主 Compose 用显式空白起始 env-file、临时 image override、唯一项目
`luna-cleanup-fptvby`、专属 compose-data 与空闲 loopback 端口启动，`up --no-build -d`。
`compose-runtime.mjs` 五项检查通过：

- instance-init/bucket-init 正常完成，API 健康后 Web 启动。
- Nginx 首页、COOP/COEP/CSP/nosniff、API meta 代理/no-store 与匿名 ledger 401 正常。
- 四服务的 /data bind 仅指向临时树；运行服务保留 read-only；Web 仅发布 loopback。
- API 重启后实例身份不变，Nginx 仍能访问。
- finally 只移除本轮唯一 Compose 项目；复查容器/网络为空。

证据：compose-runtime.log/compose-runtime-report.json。没有部署真实实例或读取根 `.env`。

## 可选 MinIO 与过滤边界

运行前只读确认 `luna-minio-smoke` 无容器/网络且 19000/19001 闲置。
`npm run smoke:config-sync:minio` exit 0：迁移后的 helper 使用显式 project-directory，
tmpfs MinIO/唯一合成桶中 config get=8 put=2、ledger get=13 put=6；两者 cleanup=deleted。
项目容器/网络最终为空。宿主 AWS SDK 提示未来版本需要 Node 22，不是本次失败，
项目依赖与镜像没有因此升级。证据为 minio-smoke.log。

真实 context 回归由实现者运行，独立 checker 复核：
`LUNA_DOCKER_CONTEXT_TEST=1 node --test tests/deploy/container-layout.test.mjs`
4/4，0 skip。根默认 ignore 用 classic builder，Android adjacent ignore 用 BuildKit；
只 COPY 合成 fixture，不在真实仓库放秘密测试文件。源码 data/local 和 Gradle wrapper
保留，根 data/与嵌套秘密/缓存/归档/Android 生成及签名文件排除。
详细 hash、范围及初次失败修复见 [静态与过滤验证](container-static-validation.md)。

## 保留边界与清理

现有 preview `d326904e668a` 保持运行，没有 restart/down。原 APK/sidecar 与 688 个
归整条目的精确哈希/元数据再次通过 artifact verify。业务源码、依赖、Android 源文件和
受保护 Trellis runtime 无 diff，Git index 保持为空。

Compose v1 实际二进制不可用；本轮使用 v2，保留既有 production classic context
边界及兼容写法，没有将 Android BuildKit cache 语法引入生产文件。
未运行新 APK 实体设备、Android emulator/KVM、完整 UI 回归或远端部署。
应用/UI 逻辑未改，相关旧设备结果保留其历史边界，不记为本轮通过。

独立复核已通过，见 [全范围复核](container-quality-check.md)。主会话随后按上表 image ID
精确核对并移除五个本轮临时 tag；只清理专属 /tmp 合成 data 和新导出 APK，保留
日志/helper/report 与任务持久结果。两独立 Compose 项目容器/网络为空，原 preview
仍运行；清理结果写入 container-runtime-results.json。没有执行全局 prune 或删除用户镜像。
