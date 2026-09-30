# 第三轮设计边界

继承父design第三轮与第一轮mobile视觉/导航。shell.tsx和settings-
navigation.ts负责mobile分组及子页返回，settings/categories/account/
tools/setup相关feature负责原有API表单的渐进呈现；styles/i18n串行。
使用共享route registry，变更入口位置不注销advanced/conflicts路径。

分类现有命令与category-in-use保护不改；重命名可用同风格Dialog替换
native prompt但取消及观测head语义保持。管理menu保持键盘/focus，
使用情况不能因藏到菜单而不可达。账号与sync基于真实server state
选择对应action，出现前提直接链接；session-only、secret clearing与
密码显隐语义仍沿host约束，文案根据clientSurface调整。

备份显示choice→目标表单；选择后保留DOM/form草稿，切另一个操作
须考虑dirty状态。共享LedgerTools导出/导入/restore不重实现，保留
原文件选择accept、密码校验和明确确认。conflict query失败不能伪装
成empty；无冲突状态可在总览小标注，实际页仍可访问。

Setup核心名称/币种、restore/connect入口优先，预算/精度进入advanced，
货币变化precision重置保持。没有账本时account/restore优先渲染真实
流程和回欢迎动作，不建dummy账本。真实欢迎APK由隔离空数据fixture
验证，不清目前手机账本；窄Web模拟和APK证据分别标注。

复用现有typed query/mutations，不增加renderer网络调用。账号绑定/
有冲突/使用情况/加密备份完整状态用合成服务或浏览器fixture，手机只
测试授权合成账本无损流程。验收后更新稳定呈现spec并完成全14路由审查。
