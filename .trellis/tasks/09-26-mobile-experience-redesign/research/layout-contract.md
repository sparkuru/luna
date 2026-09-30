# 设计选择与研究边界

权威设计：父任务design.md；界面草案mobile-proposal.html只是用于评审
信息顺序和视觉密度，不含生产逻辑、不读写账本，不能替代实施或验收。

采用月白/白色面/靛蓝、系统字体、Lucide、16px正文、48px命中区域、
少量分组和细分隔线。UUPM raw的Dark OLED、营销漏斗和远程字体不
采用；不得将其生成建议覆盖项目现有light/离线产品约束。

首页：月上下文→一个三项摘要分组→按天交易行；底栏账单/统计/预算/
设置，中央记账；设置底栏项继承稳定settingsControlId，不再重复顶部
设置菜单。录入单金额与表达式、分类网格、核心日期、更多信息、单
计算器和可达保存；类别搜索手动聚焦。详情/图片消费系统BACK，首页
fallback仍可退出。草稿、观察heads、隐私DOM与host提交规则保持。

统计紧凑趋势/分类主内容，完整bucket明细按需。预算mobile input月
控件走Router dirty blocker。设置总览分组列表、子页返回单标题；
高级显示配置连接收进同步模块但route不删，所有原功能仍能到达。
欢迎/备份/账号按有无workspace及真实host状态渐进呈现。

实际审查依据原task findings A01–A15与page-audit。未登录、无冲突、
无附件状态不能被实施/check误当全功能覆盖。特殊状态在独立fixture
补验，不动真实账号、不清当前手机应用数据。当前默认同步为应用活跃
期间自动检查，不能声称已有持续Android后台同步。

执行依赖：第一轮mobile-ledger-entry通过验收后才开始第二轮
mobile-statistics-budget；第二轮验收后才开始第三轮mobile-settings-
recovery。共享shell/styles/i18n串行编辑。父任务最终集成对照全部15
问题与14路径；保留mobile/Web/Electron presentation边界。
