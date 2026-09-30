# 第一轮实机验收

## 实施前基线（2026-09-26）

- 唯一授权目标：`192.168.9.11:34971`，Android 15，22041216UC。
  无线地址实施中掉线后，用户明确提供同一xaga手机的USB序列号
  `FQEU45PR5P7HWWFM`，后续验收改用该序列号。
- 包：`majo.im.luna.lan`；账本：移动布局测试；CSS视口457×999。
- 实施前APK SHA256：`c12f47ce7ee9a9478dbe0a5a7826964a0fc121ee206dccd59839d718c58baf26`。
- 3笔既有合成交易（通勤ML26、两笔午餐录入ML26）保持原样。完整snapshot
  与settings在`/tmp/luna-mobile-ux-audit-20260926/implementation-before-data.json`。
- 安装采用同包覆盖保留数据；不卸载、不清数据、不更改设备密度或系统设置。
  如有新增验证记录，将另行明确标记，避免混淆旧记录。

## 待实施后的真机验证

1. 默认账单月上下文、隐藏摘要、至少两条记录与短导航首屏可见；逐项揭示
   摘要，不影响其它项；既有交易名称/金额/分类保持。
2. 筛选面板打开、应用、结果数、清空；关闭后主列表返回位置合理。
3. 记账只有一个金额显示；默认无系统数字键盘；金额/快捷分类/日期/
   计算器/保存可达。更多字段文字键盘打开时，保存可滚动到达。
4. 分类选择不自动启动文字键盘；手动搜索后IME正常。系统BACK依次关闭
   IME、分类、录入，重开保持草稿，不意外退出应用。
5. 详情与可用图片弹窗系统BACK消耗当前模态，再返回账单；编辑、取消与
   草稿验证不修改既有交易。图片和多split不足的状态用独立浏览器fixture
   补充，并标明不是实机证据。
6. 最后复读snapshot/settings，与基线逐项比较；记录新版APK hash和实际
   截图、必要失败与重测结果。

## 实际结果

最终第一轮APK SHA256：`0404e9fed9e09e26c1da184cf2db63f03073472c20b6ab0a96e24e56c8514c2c`。
USB覆盖安装成功；原始ADB截图和DOM/IME记录在
`/tmp/luna-mobile-redesign-20260926`（`r1-*`）。

- `r1-home`：457×999无横溢，三条旧账单完整可见，月/隐藏摘要/五项底栏
  同屏；支出揭示¥76.00独立，收入/结余继续隐藏，收回不改变布局。
- `r1-detail*`：紧凑键值详情，无空备注；真实BACK关闭详情并留在账单。
- `r1-entry-ready`：金额/分类/日期/计算器/保存可达，真实IME=false。
- `r1-category-no-ime`、`r1-category-text-ime`：类别打开不弹键盘，手动
  搜索启动文字IME。BACK先关IME，次关类别，再关录入；重开12.50草稿
  保持。每一步有断言和实际ADB截图。
- `r1-filter-text-ime-confirmed`：真实搜索键盘打开，底栏隐藏；应用显示
  1/3结果、条件保留，清空后3/3。初次仅fill没有打开IME，断言失败；
  随后真实点击搜索框，原生IME=true，布局验证通过。不能把fill视作键盘。
- `r1-more-info-ime-save`：商户文字IME下保存按钮仍在709px视口内。
- 图片文件fixture自动化触发了真实DocumentsUI；取消保留金额/商户，
  没有假报附件成功。随后通过真实录入保存明确合成0.01元记录
  `重设计验收 QA26（合成）`（id `transaction-cb6bc03f-1edf-473c-9ab5-d3b5cee38551`）。
  仅该新记录通过现有typed API加入24×24/124bytes合成PNG，作为图片
  弹窗fixture；此步骤不是原生选择文件成功证据，不读取手机私人文件。
- `r1-image-native-back`及后续断言：真实BACK图片→详情→账单，不退出。
  `r1-home-native-fallback`：没有模态时返回Android前一系统界面，原生
  焦点为com.android.settings；不能永久吃掉home BACK。
- force-stop/relaunch读回`r1-relaunch-data.json`：原3笔完整交易、账本、
  分类/heads、预算heads、settings逐项完全一致；仅上述合成记录新增。
  原图和fixture记录在同包覆盖安装和重启后保留。

## 浏览器与跨端边界

复核最终typecheck、214unit、focused13、full220passed/8production-only
skipped、diff-check通过；两locale/320375457、旧vh回退、继续小数投影/
提交精度、停用分类ID、附件stage、Web三列隔离和旋转判定有浏览器证据。
截图`captures/mobile-redesign-browser`已目检。

Electron当前代码package通过；`./hako npm run smoke:electron`未通过，
packaged process signal=SIGTRAP。补读当前包原始诊断，确认Chromium在
执行产品断言前因SUID sandbox配置不满足而FATAL退出；日志保留于
`captures/electron-smoke-round1.json`。没有禁用sandbox或修改setuid权限。
这说明当前环境阻断此次smoke，不等于验证了Electron运行行为；无原生
视觉/辅助技术通过证据。此项
留父任务最终跨端风险，不阻断已通过的Android/浏览器第二轮布局实现。
重启后`r1-relaunch-image-readable`实际重新打开并读取合成图片，通过；
图库`captures/mobile-redesign-native/index.html`保留本轮17张原始截图。
真实设备旋转、原生图片选择成功/SAF文件写入成功尚未覆盖；本轮保留
取消、typed image fixture及真实图片返回证据，最终集成补适用场景。

主代理目检账单、录入、类别IME、详情新图符合获准布局。所有真实步骤
和数据比较通过后，第一轮功能/检查/实机交接可供第二轮开始；最终
主观用户评审与commit仍由父集成任务管理。
