# 第一轮设计边界

遵循父任务design的视觉规格和第一轮结构。mobile分支使用新列表/摘要/
录入面板呈现，公共数据与动作仍沿原component/useLocalWrite逻辑。
优先复用Button/Dialog/Input与现有分类catalog和计算 evaluator，不新增
provider、依赖或第二套财务state。

预计责任：shell.tsx导航标签/active route、entry.tsx录入及类别focus、
ledger.tsx摘要/过滤/详情及image back，styles.css mobile tokens/布局，
i18n.ts新短标签/文案；必要提取renderer/components内移动原语。只由
一个实施agent写这些共享文件；checker独立验证。

返回优先级依据实际visible state而非DOM节点存在。模态在open期间
注册固定cancelable事件消费者，最上层处理一次并preventDefault；
entry类别层先关，图片→详情不误关父层。不要为了修复home fallback
而永远消费事件，也不要依赖JS任意字符串桥接或Timeout。

录入仍稳定portal保留draft，金额/表达式合用现有calculator评估逻辑。
分类网格选择已启用固定ID，更多模态复用catalog选项；日期在core可见。
保存region位于面板底部，内容预留footer空间且vh回退；文字输入时使用
实际缩小的viewport，主导航让位。图片/附件成功行为不变。

样式只影响mobile，Web/Electron保持原布局，公共focus/ARIA/bridge行为
若变更须额外验证。验收后更新旧spec中mobile分类picker限定、核心
排列与返回优先级；不修改底层domain契约。回滚只退本轮产品差异。
