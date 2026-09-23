# 实施计划

状态：实施、自动化和实体设备复验完成；详细结果见 `validation.md`。第 7 步构建后发现设备现有 `.lan` APK 与新产物 SHA-256 完全相同，因此无需重复安装，也未清除数据。

1. 在 Playwright 中建立宽横屏 `mobile` surface 记账场景，断言金额、类别、日期、保存控件可到达，并检查 Web surface 的原有行为。
2. 添加限定到 `data-client-surface="mobile"` 的单列表单布局规则，保持计算器现有展开方式。
3. 为分类删除确认增加中英文分类名占位符；从删除处理器传入实际分类名。
4. 增加中英文确认消息回归检查，分别验证取消不改变分类、接受后只删除合成目标分类。
5. 运行 renderer 类型检查、单元测试、Web build 和 Playwright。
6. 检查 Android runtime smoke 的覆盖范围。当前 `smoke:android` 一体化执行备份完整性验证，超出本任务仅处理两个交互问题的范围，因此不运行整套 smoke。
7. 单独构建 `.lan` APK，先检查实体设备上的标准包与 `.lan` 包状态，再在保留现有 `.lan` 合成数据的前提下安装更新版本。若签名不匹配，不卸载、不清数据。
8. 在 AIO-3568J 横屏设备上复验 IME 收起、编辑器滚动、类别选择与草稿保留、类型切换取消/接受，以及中英文分类删除确认。操作均标注为 ADB 注入；分类操作只针对无交易引用的合成分类。
9. 保存证据并更新 `validation.md`，区分自动化、实体设备观察和未执行项；不把备份完整性或实体键盘标为通过。

## 计划检查

- `./hako npm run typecheck`
- `./hako npm test`
- `./hako npm run web:build`
- `./hako npm run test:web -- tests/e2e/<新增或更新的目标用例>`，之后执行完整 `./hako npm run test:web`
- `LUNA_ANDROID_APPLICATION_SUFFIX=.lan docker compose -f compose.android.yaml build android-apk`
- `git diff --check`

`smoke:android` 暂不运行：当前一体化脚本会额外执行加密备份完整性验收，违反本任务范围。实体板检查只验证本任务涉及的两项交互。

实体设备人工复验不由以上模拟器或 Playwright 命令替代。
