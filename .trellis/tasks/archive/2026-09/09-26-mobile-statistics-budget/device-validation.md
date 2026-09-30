# 第二轮实机验收

本轮最终APK已覆盖安装并通过以下真机步骤；浏览器特殊状态另列。

目标：用户USB手机`FQEU45PR5P7HWWFM`，同一`majo.im.luna.lan`，
457×999。第二轮前4笔均为合成数据：原3笔不变，第一轮增加明确0.01元
图片fixture；当前支出76.01，预算未设，设置保持初始值。

计划：

1. 从底栏进入统计，真实周/月/年与收入/支出、条形/环形切换；分类首项
   首屏可见，趋势完整明细默认收起，所有日期仍可从select和前后选择。
2. 分类/单日钻取和排序，关闭明细回主统计；收入空态简洁且不误绘支出。
3. 预算默认显示真实支出和设置动作，未设不伪造进度；页内前后月/月份
   输入可直接切月，切月加载后不混用上月交易金额。
4. 打开预算输入、真实IME和主动作可达；只写未保存草稿。取消脏草稿
   切月（原生Cancel/BACK）保留原月份与值；接受本App的“未保存”确认
   后进入新月，再返回原月。测试不会保存预算或改变原budget heads。
5. 对照第一轮最终snapshot/settings，原记录（含图片fixture）及预算/
   类别不变；新APKhash和实际截屏保留到父图库。

已设/超额、pending禁切、stale heads、后台刷新、多split和大排名以
独立浏览器fixture覆盖，分别标明证据；不在手机上造远端冲突或修改预算。

## 实际结果

APK SHA256：`f4bf6eb2829b79602571521cd310756abba479549255f09b6842c677af700f09`。
USB安装`-r`成功；原始ADB截图/DOM/IME记录在
`/tmp/luna-mobile-redesign-20260926/r2-*`。

- 统计首屏真实76.01，分类首项和48px日期选择器完全在视口内；主代理
  已目检`r2-statistics-first-screen`。完整趋势可展开/收起，9/26明细、
  9/27未来、前后日期、条形/环形、分类钻取/排序、周/月/年、收入空态
  和返回支出均实际点按通过，无横溢。
- `r2-budget-home`显示真实支出/未设/设置动作，无progress；前后月
  切到8月再回9月，输入与路由月份一致，不显示旧月支出。
- 打开编辑自动启动真实IME，709px下输入42.00、保存可达且底栏隐藏。
  BACK只关闭IME；随后前月和month input切换的本App原生“放弃尚未
  保存”确认均用实际BACK取消，9月/42.00保留。已截图确认后，接受
  同一已知确认的真实OK按钮，进入8月独立未设状态，再返回9月。
- 实际点开系统“设置月份”弹窗，ADB截图`r2-native-month-picker`；真实
  BACK取消后仍为9月且预算未设。此picker打开/取消与上述DOM month
  输入变化分别记录，不把fill冒称原生滚轮选择。
- `r2-before/after-data.json`与第一轮最终snapshot逐项比较：四笔交易
  （含图片）、workspace、categories/heads、budget heads及settings
  完全一致，无新增记录、无预算写入。主代理目检预算IME截图符合方案。

冻结后的typecheck、214unit、38focused、web build、diff-check通过。
较早full242pass/8productionSkip发生于最后CSS/焦点窄修前；最终变更
由38focused覆盖，父任务第三轮最终再full。真实预算已设/超额/写入
pending/stale与多split用独立浏览器fixture通过，不能冒称手机写入通过。
Electron原生smoke仍有第一轮已记录的sandbox环境限制，留父集成残余。

第二轮功能/检查/实机交接可供第三轮开始；最终用户视觉和commit gate
由父任务统一处理，不提前声明三轮改版完成。
