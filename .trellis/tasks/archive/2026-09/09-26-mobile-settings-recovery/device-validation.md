# 第三轮原生设备验收

本报告区分真实设备、隔离模拟器和不同 APK 候选。最新用户要求统计
也有左右周期箭头，已完成同任务窄修及最终手机补验；下列先记录
增补前候选，末节是最新结果，不能把旧截图标成最新。

## 设备与保留基线

- 仅用户 USB 手机 FQEU45PR5P7HWWFM：xaga/22041216UC，Android15，
  CSS457×999。只对 majo.im.luna.lan 同包覆盖，没有卸载/清数据，
  没有改密度/网络/系统设置，也未操作另一个连接设备。
- 升级前 r3-preinstall-data.json 显示五笔：第二轮四笔完整保持，
  另有用户新增705.00支出。本轮以当前五笔为基线，不删除该记录，
  不将其冒认为验收合成记录。
- 原始 ADB 图和只读 snapshot/images JSON：
  /tmp/luna-mobile-redesign-20260926。可浏览图库：
  captures/mobile-redesign-native/index.html。
- 隔离首次恢复及真实图片选择使用项目 luna-smoke AVD、API36、
  host ADB5038；每次核对唯一 emulator-5554、AVD 名和 qemu 属性。
  手机不清空来制造欢迎页。

## 手机：最终居中候选 868ff024…

完整 APK SHA256：
868ff024d5301d2c4f5cf02e61892dd997d1b690222576c71280cc99834b26fd。

账单/统计/预算实际可见月份 glyph 中心与屏中心差不超过2 CSS px，
输入 y68、高48、x72/宽313；统计/预算标题无视觉占位。月/周/年
语义和 date/month 类型保留。实际触摸三页月份中心及预算输入右端
indicator 均打开真实系统选择器；真实 KEYCODE_BACK 取消保持九月，
不是通过 CDP 合成关闭。见 r4-ledger/statistics/budget-centered、
r4-statistics-week/year、r4-*-native-picker。

最早候选 1e439c6f… 的框居中、内文靠左失败照保留；这一问题已用
NativePeriodInput 修正并在 868ff024… 实际验证。不能只量外框或用
Chrome datetime pseudo CSS 推断 Android 月份内文。

设置 r4-* 逐页进入总览和八子路由：四组七卡；本地账本、支出/收入
分类、偏好、账号、同步、高级同步、冲突、备份均可达。分类行菜单/
使用情况真实 BACK 先只关弹窗并恢复 opener，下一次才回总览；
账号真实文字 IME 下底栏隐藏，BACK/退出后密码生命周期清理。
同步状态留设置模块；高级入口保留原路由。备份保存/合并入口分别
展开表单。所测页面均无水平溢出。账号测试只有明确合成未提交值，
没有连接真实账号或写入分类。

r4-after-header、r4-after-settings、r4-phone-relaunch 与当前五笔
升级前基线逐项相同：workspace、categories、category/budget heads、
settings、conflicts、全部五笔及既有图片 bytes/hash。实际重启读回通过。

## 手机：真实 SAF 取消与成功保存

这部分在候选 1e439c6f… 完成，相关备份逻辑在后续居中候选未改。
实际 DocumentsUI 取消后显示“已取消保存，未生成备份”，密码清空，
没有成功提示。重试保存到不存在的唯一 QA 文件，实际显示成功。

下载文件6004 bytes，通过 Node22 解密核对完整 workspace、五笔、
零冲突和124-byte、24×24 PNG。图片 SHA256：
8fba5e9212656f540f903496eb2a68dea0c56319dd510e359a4e6777744a11fa。
加密文件 SHA256：
05ace4a504b7590a7dbd0e8a58a6c4420826b861585ffbb496719bc88c3f2eba。
本地 ignored 验证结果在 captures/mobile-redesign-native-backup；
只在手机删除 hash 匹配的 luna-mobile-redesign-QA26.luna-backup，
没有读取或删除其它文件。r3-backup-native-cancelled/save-success 为实图。

## 隔离首次使用、正确恢复与原生图片选择

空工作区实机欢迎页、显式 /setup、核心字段/高级项、首次连接/返回
及直接恢复已验证。真实 SAF 取消和错误密码后仍无 workspace/交易；
正确密码恢复上面五笔和原图，全部财务图及附件与备份相同。便携
备份不承诺迁移客户端偏好，AVD 默认英文设置不作为财务差异。
此部分候选 1e439c6f…，见 r3-emulator-*。

随后 AVD 同包升级到 868ff024… 保持恢复五笔，再真实点击原生图片
选择按钮，经 DocumentsUI 选择唯一隔离 QA PNG，预览后保存明确
“原生图片选择 QA26（隔离）”0.01支出。仅 AVD 新增一笔，原五笔不变。
归一化图片1×1、83 bytes，SHA256：
b01d25703e20e44e9b2937087c40b4f19ada1783f8bc002ac8ce0552e5b45bf2。
真正 force-stop/重启后六笔与两张图片仍相同。见 r4-emulator-*。
第一轮手机图由 API 合成 fixture，不能将其记成手机原生图片选择成功；
这项成功证据来自隔离 AVD。

AVD 的两份临时下载文件及精确匹配 MediaProvider ID19 已清理，
手机 QA 备份文件和本次 tcp9224 forward 已移除，AVD 已停止。
没有清理任何既有设备数据。

## 其它验证边界

两 locale、320/375/457，绑定/解锁/有冲突/分类 in-use 修复、多 split、
pending/stale/retry/秘密生命周期由独立浏览器 fixture 验证。868ff024…
对应 full Web286通过/8 production-only跳过，production14/14，
unit214/214，type/build、Electron package通过。实际 Electron 启动在
产品启动前因 Chromium SUID sandbox/SIGTRAP 环境限制不可用；
打包不代表 native smoke。真实私有账号/服务同步和 TalkBack 未冒称通过。

## 最新统计箭头增补

用户看过手机后提出统一左右箭头。这是具体调整反馈，不记成最终
视觉接受。最新 APK SHA256：
dcb695feb001be78d145d00061989bb1e5856f6e80a04153f86687256a329bd4。
同包覆盖安装与启动成功，r5-before→r5-installed→r5-after 五笔、
workspace/categories/heads/settings/conflicts 完全不变，没有新增交易；
124byte原图逐项及SHA相同。

真实 ADB input tap 统计48px箭头（由本应用外层WebView frame与CSS
位置换算，非合成DOM点击）通过：九月→八月→九月；周参考日
2026-09-26→09-19→09-26；年2026-09-26→2025-09-26→2026-09-26。
对应真实Input及Router month/anchor/period同步。顶部三页几何完全
相同：前按钮 x16/y68/48×48，input x72/y68/313×48，后按钮
x393/y68/48×48。实际可见 glyph 居中、两隐藏标题无视觉占位，
所有 r5 页无水平溢出；实际图库截图已目检。

统计/预算直接触摸月份打开真实系统选择器，真实 BACK取消后保留
九月；周/年 date 语义保留。最后恢复month模式与九月账单。
QA初次因把嵌套辅助WebView节点误当第二窗口而安全停止，检查外层
frame及所有子节点包含关系后继续成功；没有因此改产品。图像比较
脚本首次引用了不存在的旧证据文件名，改为真实文件后完全相同；
这两项均是验收脚本修正，不冒称应用回归缺陷。

最新独立 type/focused18/full290+8skip、production14、unit214、
Web build/Android build/Electron package/diff通过；没有未结束检查。
手机本次tcp9224 forward已移除，隔离AVD仍停止。其它原生证据保留
以上实际候选边界；未为这个仅周期增补重复制造备份/图片写入。
