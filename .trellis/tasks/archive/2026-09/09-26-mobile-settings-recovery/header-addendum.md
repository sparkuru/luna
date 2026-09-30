# 用户追加：三页周期入口统一

2026-09-26，第二轮实机后用户明确要求：顶部月份居中；账单、统计、
预算三个心智模型统一，日期/月控件都放中间；移除统计、预算的可见
页面标题，像账单一样由底栏提供当前页面识别。这是当前第三轮集成
已批准的局部增补，继续现有范围，不重复请求方案确认。

- mobile 三页周期区域在顶部居中，采用同一间距与中心对齐；统计
  周/年保留各自日期语义，不另造局部月份状态或扩大财务范围。
- 统计/预算 h1 可 visually-hidden 保留可访问页名及 aria-labelledby，
  但不能占视觉高度。Web/Electron标题和布局不改变。
- native month/date内部显示值需要实际居中，不能仅让input的外框
  居中：第二轮实际WebView在text-align:center下值仍左对齐。
- 320/375/457两locale、长日期、触控/label、Router取消和pending
  不回归；最终新版APK再检查实际原生日期/月字段视觉。
- 实施者追加budget.tsx、必要共享期控件CSS/风险测试所有权；main
  更新稳定spec及实机证据。前两轮结果保留，本增补最终检查另记录。

## 用户实机反馈：统计也需左右周期箭头

用户看过已安装的 `868ff024...` 后明确指出，账单/预算有左右月份
箭头而统计没有，要求统一。该反馈是需要调整，不记为最终视觉接受。
继续当前任务，不重问方案授权。

- mobile 三页均为48px前一周期动作、居中真实原生日期/月输入、
  48px后一周期动作；相同位置、间距、图标与触控面积。
- 统计月模式使用原 onMonthChange/Router；周/年模式按对应周期
  移动日期，使用原 onAnchorChange/UTC语义，禁止造独立月份状态。
- 保留原周期radio、收入/支出、完整趋势、分类钻取/排序、dirty
  取消与heads保护、当前底栏；Web/Electron不得添加移动专属箭头。
- 两locale320/375/457、跨月/年、周与年日期、实际APK触控切月及
  原生picker仍可达。最后窄修后重新type/build/相关focused并窄审。
- 实施者必要新增本地化周期label可改i18n，但不扩展其它文案或UI。

## 追加修正的实际交付

已完成并安装 APKdcb695fe…；renderer冻结3fff5ee3…。
双locale320/375/457与跨年/闰日、原Router和预算保护由独立18focused
及最终full290pass8productionSkip验证；production14/unit214/type/
Web build/Android build/Electron package/diff通过。
真实手机ADB触摸月/周/年箭头、三页48px几何/字中心、原生月选择和
BACK取消通过，五笔与图片/偏好/heads保持。详细候选边界见
device-validation.md，最新照片在父图库首组；不把实施授权或此次
技术通过自动记录成用户最终主观视觉接受，尚无提交/归档。
