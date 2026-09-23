# 设置界面整理：技术设计

版本：2026-09-18

## 1. 设计边界

本任务只整理共享 renderer 的 Web 设置信息架构、入口层级和视觉呈现。Web 是主要交付与浏览器验收面；Electron/Android 不进行同范围的外壳重排，也不新增 host 能力。所有设置读写继续经过 `window.lunaLedger`，现有 DTO、Query、脏表单、秘密清理、同步和冲突边界保持不变。

不修改：

- `src/shared/settings.ts` 的 schema、加密和同步协议；
- Electron preload/main、Web storage adapter、SQLite/OPFS/IndexedDB 和服务端 API；
- `/settings/**`、`/budget` 的公开 URL 语义；
- 账单、统计、录入、分类业务逻辑。

## 2. 目标信息架构

```text
Web 一级导航
└── 设置
    ├── /settings                    设置索引页：分组卡片是主要入口
    │   ├── 工作区：本地账本、分类、偏好、预算
    │   ├── 账号与同步：账号、账本同步、高级同步设置
    │   └── 数据与恢复：加密备份、冲突处理
    └── /settings/<area>             设置子页：保留一套分组二级导航 + 当前内容
```

### 2.1 首页和子页的导航责任

- Web `/settings` 不渲染当前的 `SettingsNavigation`。分组卡片、页面标题和状态摘要承担设置首页的主要导航责任，消除“顶部二级导航 + 卡片网格”重复入口。
- Web `/settings/**` 子页继续渲染 `SettingsNavigation`，提供设置首页入口和同组/跨组切换；当前项使用 `aria-current="page"`，返回设置首页后再按现有 shell back contract 返回 `/luna`。
- Native/Android 保持现有设置导航显示方式和视觉层级；共享目录只统一路径、分组和 message key，不把 Web 卡片/响应式 CSS 带入 native 外壳。
- Web 的 `/budget` 仍作为工作区分组的入口显示，但不加入 router 的设置路径集合，也不改变其原路由和脏表单 blocker。

## 3. 单一设置区域目录

新增一个 renderer 内的 presentation-only 元数据模块（建议：`src/renderer/features/settings-navigation.ts`），拥有以下类型和常量：

```ts
type SettingsAreaKey =
  | "settings"
  | "ledgers"
  | "categories"
  | "preferences"
  | "account"
  | "sync"
  | "advanced"
  | "backup"
  | "conflicts"
  | "budget";

type SettingsAreaDefinition = {
  key: SettingsAreaKey;
  path: string;
  titleKey: MessageKey;
  helpKey: MessageKey;
  group: "workspace" | "access" | "data";
  webOnly?: boolean;
};
```

- `SETTINGS_AREA_DEFINITIONS` 是概览卡片和二级导航共同读取的唯一入口目录；`settings` 作为首页入口可以只用于导航，不渲染卡片。
- `SETTINGS_AREA_GROUPS` 只存 group key、label message key 和 area key 顺序；`getSettingsAreaGroups(web)` 过滤 Web-only budget，native 仍使用现有不含预算的平铺导航。
- 动态冲突数量不进入静态目录；`SettingsOverview` 在渲染 `conflicts` help 时继续调用现有 `app.message("ledgerConflictNotice", { count })`，或为该条目提供可选参数函数，避免把 snapshot 放进静态配置。
- 目录只包含路径、文案 key 和展示分组，不保存设置值、同步状态、权限或 host capability，因此不会越过 renderer/host 边界。

这样 `SettingsOverview` 与 `SettingsNavigation` 不再分别维护一套路径/分组数组；router 的 `paths` 仍是路由注册清单，目录不能替代 router 的 deep-link 注册。

## 4. 组件与数据流

```text
App/useRouterState
  ├─ primarySection + path + client surface
  ├─ Web /settings  ───────────────> SettingsOverview
  │                                  └─ area catalog → grouped cards → navigate(path)
  └─ Web /settings/<area> ─────────> SettingsNavigation
                                     └─ area catalog → grouped buttons → navigate(path)

AppContext/settings/snapshot ───────> existing feature panel
                                     ├─ preferences/advanced: Settings
                                     ├─ ledgers/account: account panels
                                     └─ sync/backup/conflicts: LedgerTools/server panels
```

- `SettingsOverview` 继续负责页面标题、用途说明、本地存储状态和服务端同步状态；不增加新的远端读写。
- `SettingsNavigation` 只负责导航语义，不读取 settings DTO，也不触发设置 mutation。
- `Settings`、`AccountPanel`、`LedgerTools`、`Categories` 和 `BudgetEditor` 保持当前状态 owner、提交、刷新和错误恢复逻辑；本任务只允许为一致的页面上下文补充必要的 wrapper/class/id。
- `App` 依据 `isWebSurface && path === "/settings"` 控制首页是否显示二级导航；子页和 native 路径保持现有渲染条件。
- 所有 route callback 继续使用当前 `goto`，保留 search 参数和 dirty route blocker；不通过隐藏旧按钮来维持旧测试。

## 5. Web 视觉方案

- 设置首页使用现有月白背景、白色 surface、靛蓝主色和语义状态色；卡片保持真实 `<a>`、明确标题/说明/动作，focus/hover 不改变布局尺寸。
- 桌面 `>=1024px`：工作区/账号与同步/数据与恢复按组展示，卡片网格最多三列；中等宽度两列；窄屏单列，长中文自然换行，无横向滚动。
- 子页二级导航继续使用已有分组视觉，但收紧上下间距并保留 44px 级按钮、当前项和可见 focus；其 Web CSS 使用 `.client-surface-web` 或 `html[data-client-surface="web"]` 限定，避免重排 native。
- 首页状态摘要继续区分本地存储与远端同步；不可用、未登录、未解锁、未配置等文本沿用现有 server/i18n 状态，不用颜色单独表达。
- 不新增远程字体、emoji、图片、暗色 OLED 主题或装饰性长动画；遵循 150–300ms 微交互和 `prefers-reduced-motion` 规则。

## 6. 可访问性与状态契约

- `/settings` 使用一个 `h1`，每个设置分组使用 `h2`；卡片链接的可读名称由标题、说明和“打开区域”组成，不能只依赖图标。
- 二级导航保持 `nav[aria-label="设置"]`、按钮/链接真实语义和 `aria-current="page"`；首页不出现重复的同名设置 nav。
- 设置表单既有 field/legend/label、alert、status、disabled 和 confirm 行为不变；对象存储连接继续在 `<details>` 中渐进披露并清除敏感输入。
- 验收状态至少覆盖：页面可用、设置读取中、无工作区/空目录、Web 不可用的桌面专属说明、保存中、成功反馈、权限/密码/冲突错误和危险操作确认。
- 键盘顺序按页面视觉顺序；所有关键入口、展开 disclosure、返回、表单提交和错误恢复都不依赖 hover；窄屏和减少动效不改变可达性。

## 7. 兼容性与回滚

### 兼容性

- 原有 `/settings`、`/settings/preferences`、`/settings/sync/advanced` 等 direct deep link 继续命中相同 feature；只改变首页 Web 的入口呈现。
- 现有设置/备份/同步 E2E 中对子页 `.settings-navigation` 的定位继续有效；首页入口相关测试改为定位概览卡片，因为首页不再渲染二级 nav。
- Native/Android 只共享静态 area catalog；如果编译或渲染出现差异，优先确认 `web` 分支条件与 CSS selector，不改变 host contract。

### 回滚

- 最小回滚点一：恢复 `App` 在 Web `/settings` 上渲染 `SettingsNavigation`，不触及 catalog 或 feature panel。
- 最小回滚点二：恢复 Web scoped CSS，保留 catalog 纯重构；路径和业务行为仍可用。
- 完整回滚需同步恢复 `settings-navigation.ts` 的引用、首页/子页 E2E locator 和新增 i18n，避免只回退部分入口造成测试/文案漂移。

## 8. 验证设计

- 静态：`npm run typecheck`、`git diff --check`；确认没有重复的设置路径目录或未使用 message key。
- 单元：现有 `src/renderer/i18n.test.ts`、`src/renderer/app/search.test.ts` 和共享设置测试不应受影响；如目录纯函数足够复杂，为分组/过滤加单测。
- Web focused：新增或更新 Playwright 场景，验证 `/settings` 只有卡片入口、卡片进入偏好/备份、子页有当前项和可返回首页的导航、深链正常、375px/1440px 无横向溢出。
- 回归：`tests/e2e/react-state.spec.ts` 的 back/dirty 路径、`tests/e2e/accessibility.spec.ts` 的 reduced-motion/keyboard、`tests/e2e/config-sync.spec.ts` 的高级设置错误与草稿保留、`tests/e2e/ledger-tools.spec.ts` 的备份/冲突流程。
- 按 frontend/web-host contract 先运行 Web build/Playwright；Electron package 不是本次 Web UI 迭代的前置条件，若共享 DOM 影响 native，再运行与改动相关的额外检查。

## 9. 主页标题区追加反馈

- `LedgerHome` 和 `LedgerMonthLoading` 保留右侧 `MonthControls` 作为月份的唯一可见入口；标题区的 `month-label` 不再渲染，加载状态仍通过 `MonthControls` 和已有 `month-loading-status` 呈现。
- 新增 renderer-only 的提示语词库模块，只存 `MessageKey`，不存用户可见硬编码文本；账本路由在主页进入时选取一条 key，并将同一条传给加载态和 `LedgerHome`，路由离开再进入时重新选择，月份切换和普通刷新不随机跳变。
- en/zh-CN catalog 为同一组 key 提供完整翻译；第一条提示语使用“先看发生了什么，再记下一笔。”语义，其余条目保持简短、鼓励记录且不承诺任何同步/财务结果。
- 随机选择是展示层 view state，不进入 route、settings、snapshot、持久化或 API；使用可注入随机源的纯函数方便单测边界。
