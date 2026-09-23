# 技术设计

## 边界

- 改动限于共享 renderer 的记账布局与分类删除确认文案，不改 Android 原生插件、数据模型或账本存储。
- Android Capacitor host 将 surface 标记为 `mobile`；Web host 有独立的 `.client-surface-web` 样式覆盖。分类文案是共享行为，需在中英文下保持一致。
- 仅用 `.lan` 测试包和合成数据实机复验。桌面人工验收、读屏器和备份完整性不属于本任务。

## 记账编辑器布局

证据位于 `src/renderer/styles.css` 与 `src/renderer/features/entry.tsx`：`.quick-core-fields` 声明单列，但 JSX 同时带有 `form-grid` 类，后续同等权重的 `.form-grid` 规则将其改为双列。宽横屏时全局窄屏单列断点不生效；Android 非 Web surface 会在金额字段内始终展开较高的计算器。截图中的左侧计算器和右侧空白符合这一布局结果，且类别字段在双列中可能随模态框滚动位置离开可视区域。

按 `html[data-client-surface="mobile"]` 限定的编辑器选择器显式使用单列，避免改变 Web 的专用布局和 Electron 当前布局。保留计算器位置和行为。实机 WebView 复验发现其不支持 `100dvh`，导致既有 `.luna-dialog` 的 `max-height` 变成 `none`，内容高于视口且对话框本身不可滚动。为通用弹层声明 `calc(100vh - 32px)` 基线，并把 `calc(100dvh - 32px)` 放入独立的 `@supports (height: 100dvh)` 规则；这样旧解析器保留 `vh` 回退，现代浏览器使用动态视口。通过宽横屏 `mobile` surface 自动化检查弹层限高、内部可滚动及类别、日期和保存按钮可到达，再在实体设备复验 IME、滚动和草稿交互。

## 分类删除确认

- 扩展 `deleteCategoryConfirm` 的中英文模板，使用带引号的实际分类名占位符。
- `categories.tsx` 调用 `app.message` 时传入当前 `category.name`；不改变删除 API、引用处理或列表更新逻辑。
- 自动化对话框测试检查传给 `window.confirm` 的实际消息，并分别验证取消和接受；中文、英文都覆盖。实体设备确认原生 AlertDialog 显示分类名且取消/接受对象正确。

## 回滚与风险

- 布局规则限定到 `mobile` surface；若影响窄屏滚动或实体设备触控，可撤回该规则及对应布局测试，不涉及持久化数据迁移。
- 删除测试只使用无交易引用的合成分类。若 `.lan` 更新因签名不匹配失败，不卸载应用或清数据；保留设备数据并停止该次安装。
- APK 构建会更新 `artifacts/android/luna-lan-debug.apk`；按既有流程把它作为本地构建产物记录，不混入产品提交。
