# 鲨鱼记账 UI 参考评估

日期：2026-09-12。用户取消 Flutter 考虑，维持 React/Capacitor；本轮仅评估鲨鱼记账截图，不实现、不直接替换既有方案。用户确认自己正在使用鲨鱼记账且习惯其体验。

## 证据

已下载并实际查看官网公开宣传图：
- https://www.shayujizhang.com/img/top-phone.png → /tmp/luna-shark-reference/home.png：主界面月/收入/支出、分日流水、中央记账、图表分类排名。
- https://www.shayujizhang.com/img/fun-feature1.png → /tmp/luna-shark-reference/entry.png：支出/收入、四列类别网格、金额及备注、日期、带加减的键盘。
- https://www.shayujizhang.com/img/fun-feature2.png → /tmp/luna-shark-reference/statistics.png：周/月/年、趋势图、分类金额/百分比/横条排名。
- https://www.shayujizhang.com/img/fun-feature3.png → /tmp/luna-shark-reference/ledger.png：这是收支日历与明细宣传图，并非标准首页。

来源：https://www.shayujizhang.com/ 。截图包含2019/2023样例日期，不能声称是当前Android实际版本。小米商店 https://m.app.mi.com/details?id=com.shark.jizhang 可访问，但图片获取不完整，不作为已查看的Android截图证据。不采用搜索结果中的破解站图片或第三方重设计作为官方界面证据。图片为参考素材，不纳入 Luna 产品资产。

## 评估（建议，未批准）

1. 首页：月份/摘要紧凑、分日流水、金额右对齐值得保留；原 Luna 方案已接近。首页保持账单优先，摘要继续三项独立隐私，不因参考图添加未要求的每日汇总泄露路径。
2. 导航：考虑手机“账单｜统计｜＋记账｜预算｜设置”，四个页面加一个动作。中央动作不是第五个路由，aria-current 只用于页面。比右下FAB更贴近参考图的位置记忆；320px触控和长英文仍需验证。
3. 分类：网格直接展示比先打开完整选择弹窗更接近参考图。建议常用8项+更多和自定义；位置稳定优先于每次重排。原计划的使用频次实时排序可能破坏位置记忆，改固定/用户排序需要另行确定范围。可仅每个会话初始化一次建议顺序，避免每笔后跳动。
4. 录入：截图的类别上方、金额键盘下方与原方案金额优先/系统键盘不同。静态图无法证明自动焦点、点击顺序、返回和草稿行为，须询问用户实际习惯。自定义加减键盘属于新增范围，不在本轮自动采纳。
5. 统计：分类降序横条/百分比/金额值得借鉴；保持已有整数快照口径。不因截图自动增加周/年趋势、日历或同比。
6. 视觉：可借鉴明亮强调色+白色列表、低卡片层级、简洁图标。保持 Luna 月白/靛蓝和 Lucide；黄主题或鲨鱼品牌不是熟悉交互的必要条件，是否换色仍是用户选择。
7. 工程：现有 React/Tailwind/Radix/Lucide 可实现上述结构，不需 Flutter。主要风险来自键盘、排序稳定性、原生返回、草稿与隐私，而非配色。

## 待用户明确

最高价值问题：实际最习惯的是中央记账位置、类别网格、带加减的键盘还是明细布局？答案决定需调整导航位置还是录入主流程。当前 design/implement 仍为旧完整方案，不应被误认为已经采纳本评估建议。
