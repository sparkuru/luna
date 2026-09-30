# 主会话集成复核与候选边界

统计箭头增补前 renderer 冻结 SHA256：
`8e8d28fc9fd86d6b02a49b9816d7b8246728b9030d486659a5b97a30a0967114`。
统计箭头增补前 APK SHA256：
`868ff024d5301d2c4f5cf02e61892dd997d1b690222576c71280cc99834b26fd`。
没有 renderer API、财务算法、schema、DB 或同步后台策略新增变更。

## 868候选源码的自动验证

| 检查 | 实际结果 |
| --- | --- |
| Typecheck | 实施与独立窄审均通过 |
| Unit | 214/214，20.763秒 |
| 全量 Web，4 workers | 286 passed / 8 production-only skipped / 0 failed，4.5分钟 |
| 最新 production preview | 14/14，12.2秒；含全部8项跳过用例，其余6项与开发回归重叠 |
| 实施 header/账单/统计/预算 focused | 23/23；最后清理后4/4 |
| 独立 header/预算pending、旧heads、Web picker focused | 10/10，16.0秒 |
| Web build | 最终源码通过 |
| Electron package | 最终源码 Linux x64 打包通过 |
| Diff check | 通过；项目无独立lint脚本，不虚报eslint |

Production command：
`LUNA_TEST_PRODUCTION=1 npm run test:web -- tests/e2e/offline-and-storage.spec.ts tests/e2e/router-offline.spec.ts tests/e2e/offline-update.spec.ts --workers=4`。
覆盖冷离线启动/写入、深链接、注册失败本地化恢复、更新等待表单、
失败发布保留旧版本与跨tab写入。浏览器suite和APK Gradle串行；
仅不同设备的CDP/ADB操作独立执行，没有共用HMR或test-results。

## 原生日期差异与最后修正

首个第三轮候选 `1e439c6f...` 上，input 外框居中但真实月份内文仍
靠左；Chrome datetime pseudo CSS未证明Android值绘制。保留失败
照片，不将原外框断言当成功。共享 `NativePeriodInput`（现有
components/month-picker.tsx）仅用于 mobile，保留真实Input及
id/type/value/label/handler、48px触控与键盘焦点，aria-hidden投影
采用既有UTC/locale formatter并居中；没有合成showPicker。

Native glyph中心、三页y一致、系统center/indicator触摸、实际BACK
取消均在最终APK通过。独立检查确认pending与dirty-month guard、
原预算heads和Web/Electron路径保持。新 mobile-period-header.spec
覆盖双locale、320/375/457、visible Range中心、命中/焦点与周/年。

## 实机与风险界限

全部14路由实际访问、最终8设置路径、IME/BACK、实际SAF取消/保存、
Node解密五笔与图片、隔离首次取消/错密码/正确恢复、最终原生图片
选择/保存/重启的证据见 device-validation.md 与父 validation.md。
手机五笔、分类/heads/预算/settings/既有图片保持；隔离AVD只新增
一笔明确合成0.01验证记录。临时文件/指定forward清理，AVD已停止。

Electron实际启动仍受第一轮产品启动前Chromium SUID sandbox/
SIGTRAP环境限制；没有以打包或浏览器成功替代native smoke。
真实私有账号/服务同步、TalkBack及主观视觉不冒称全部验收通过。
父任务统一处理主观视觉human-review gate；尚无stage/commit/archive，
继承21项dirty的路径与混合hunks边界继续保留。

## 最新统计箭头增补的冻结检查

renderer SHA256：
`3fff5ee3b4ce6d0f67181a34c74bb0fd556d64dae7b98bbb801c14e3e77a9e7c`。
NativePeriodNavigator 统一统计/预算三列及账单相同几何。月走既有
onMonthChange，周/年走 onAnchorChange 与 UTC，闰日夹到2月28日；
两个locale只补previousWeek/nextWeek。没有影子状态或后台协议变更。

最终 full-scope 独立审查无阻断 finding；最新全量 Web 共298项：
290 passed /8 production-only skipped /0 failed，4.0分钟。
独立 typecheck、双项目 focused18/18（20.9秒）、diff check通过；
focused含双locale header/箭头、预算dirty/pending/旧heads及Web picker。
实施者同冻结 unit214/214（17.028秒）、Web build3.16秒通过。
最新 APK SHA256：
`dcb695feb001be78d145d00061989bb1e5856f6e80a04153f86687256a329bd4`。
主会话 production14/14（14.2秒）、最终 Electron package通过；
Docker Android build/export、授权USB install -r/启动通过。
真实 ADB 物理点击月份/周/年箭头及Input/Router语义、三页相同
48px几何与glyph中心、统计/预算原生picker/BACK取消通过；五笔、
设置/heads及图像完全保留。详细值和验收脚本修正见device-validation。
窗口全部结束、本次forward清理；没有新增源码修订或扩大业务范围。
human-required主观视觉/提交gate仍由父记录，未stage/commit/archive。
