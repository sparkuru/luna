# 验收矩阵与失败注入

修订2；本文件是需求与故障注入矩阵，实际执行结果见同目录 `validation.md`。所有图片/财务fixture合成，禁止把ADB个人截图作为测试数据或公开产物。ID对应prd.md。

## A. UI与金融行为

| ID | 场景 | 必须断言 | 主要测试位置 |
| --- | --- | --- | --- |
| UX01/RT01 | 四页、中央动作、settings子页、新旧deep link | active link正确；动作开录入不push第五页；所有旧路径replace且返回不循环 | router-offline/intuitive-ledger |
| UX02 | 375×812已有3笔，正常字号 | 视口内月份、三摘要、至少2完整交易、中央动作；末行滚动可操作 | ui-redesign浏览器bounding box+截图 |
| UX03 | 320×740、375×812、768×1024、1440×900、812×375 | 无横向溢出/固定遮挡；224px侧栏断点；48px目标；大字重排 | accessibility/ui-redesign |
| UX04 | 三摘要全隐藏/部分/重载/负结余/大额 | 原值不在各摘要DOM/ARIA/title/dataset/live；各自开关；图表详情维持设计范围 | privacy-and-web |
| UX05 | 全新OPFS、离线、无账号、旧backup导入 | 默认我的账本/CNY；无预算要求；adopt正确workspace | offline-and-storage/ledger-tools |
| EN01 | 新增/恢复/type切换/长分类/自定义 | 首先网格，点类别展开键盘；稳定排序；保留字段；不猜自定义图标 | intuitive-ledger/react-state |
| EN02 | 0.1+0.2、12-2+0.5、0–4精度、退格/多点/尾运算符/连续符号 | 精确BigInt结果；非法精度不舍入；先求值再保存；0/负拒绝 | amount-expression单测+E2E |
| EN02 | ≤256字符、≤32操作数、超过领域金额限额、键盘Enter | 上限错误可恢复，Enter表达式阶段不保存 | amount-expression/E2E |
| EN03/04 | 本月/历史月、新草稿/旧草稿、关闭/Escape/Back | 正确日期且旧草稿不重置，逐层返回和焦点恢复 | react-state/accessibility |
| EN04 | dirty换profile/编辑另一笔/恢复/预算跨月 | 取消不写不导航，确认后按scope清理；不能自动带到新本 | react-state/server-account |
| EN04 | 旧revision/多分类/同步更新 | 错误保留原token/草稿，多分类不可单类覆盖 | react-state/domain |
| EN05 | 快速双击、write失败、write成功refresh失败 | create仅一次；失败保留；已commit不重放；播报诚实 | react-state/scoped-read |
| MG01 | 每个旧设置能力迁移 | account/设备撤销/所有sync/偏好/backup/conflicts/desktop-disabled均可达且handler等价 | server-account/config-sync/ledger-sync/ledger-tools |
| RT01 | 生产offline冷启动、新worker/图表/图片预览资产 | 完整预缓存，断网可开页/保存；不缓存财务API/解密图片 | offline-update/router-offline |

## B. 查询和统计

| ID | 场景 | 必须断言 |
| --- | --- | --- |
| QU01 | 上下界20/100，交易19.99/20/100/100.01，收入/支出 | abs金额包含20与100；方向单独控制；空单边合法 |
| QU01 | 下界>上界/负输入/非法小数 | 显示错误，保留输入，不假称无匹配 |
| QU01 | 餐饮+交通，多split同笔/单笔重复类别 | 分类OR，交易只出现一次，整笔合计；与日期/金额/文本AND |
| QU02 | literal点号与regex点号、早餐|午餐、^地铁、咖啡.*外卖、转义 | text默认字面匹配，regex显式切换，逐字段非跨字段命中 |
| QU02 | 不闭合括号、重复量词、256+字符、病态嵌套表达式+长备注 | 错误/超时可恢复、主线程按钮仍能用、worker实际terminate；不以删除测试代替 |
| QU02 | 旧job晚回、scope切换、连续输入、Worker故障、生产离线 | 不显示旧结果；普通查询仍可用；正则支持环境必须正常通过 |
| QU03 | 默认全账本、跨月记录、指定日期、chips清除 | 全时段查到旧记录，日期包含边界、清除结果正确、URL无表达式 |
| ST01 | 周跨年/月、闰年二月、年12月、本地时区/DST | 字符串日历分桶无UTC偏移；未来桶明确、零值补齐 |
| ST01 | 当期/历史/未来平均值、不同精度、超大金额 | 分母规则正确，整数四舍五入；零分母无NaN |
| ST02 | split category之和、收入/支出、零/大额 | 与领域总计一致；BigInt排序/比例不溢出；无浮点反算 |
| ST02 | 6+类别/环形图/其他/文本列表/键盘 | 前5+其他但明细全部；非颜色唯一；键盘同等信息 |
| ST03 | 同额/同日/跨split/冲突/删除记录 | Top5顺序确定；最大单笔≠日峰值；冲突/删除不计；分类钻取金额标注 |

新增纯函数测试建议src/shared/ledger-query.test.ts、ledger-statistics.test.ts、amount-expression.test.ts；浏览器优先加入现有语义suite，只有职责不合适时新增search-statistics.spec.ts。

## C. 附件本地与安全边界

| ID | 场景 | 必须断言 |
| --- | --- | --- |
| AT01 | JPEG/PNG/WebP、旋转EXIF、透明、非支持/动画/伪MIME/超像素 | 方向正确、元数据移除、格式/尺寸/字节限制；拒绝可恢复 |
| AT01 | 9/10张、取消选图、删草稿图、保存后离线重启 | 上限9，取消不改草稿，字节真实恢复，不仅缩略占位 |
| AT02 | 加图+update stale revision/磁盘满/SQLite失败/IDB abort | 金融graph及promote一起回滚；原数据和可重试草稿存在 |
| AT02 | 读图换scope/断开/删除profile、错candidate/id | 迟到结果不显示/写入新scope，无跨账本访问，URL撤销 |
| AT02 | create/update/delete/getSnapshot/conflicts/status公开返回 | 递归不含key/iv/raw graph/路径；preload/IPC不能调用raw graph |
| AT02 | 同ID不同descriptor/hash、篡改cipher/AAD/tag | 拒绝，既有图不覆写；独立golden crypto验证 |
| AT05 | native schema2、profile3、Web2、IDB1迁移并重开 | 旧数据/metadata保留；新version正确；失败回滚；旧binary拒绝新schema |
| AT05 | 两端v1分别normalize、revision碰撞 | 相同历史加[]确定性相等；ID/parents不变，不制造财务冲突 |

主测试：src/main/store.test.ts、ledger-store.test.ts、src/web/web-api.test.ts、profile-host.test.ts、新attachments/codec tests；OPFS需浏览器真实DB验证，fake IDB不能代替。

## D. 两种同步传输与服务端

| ID | 场景 | 必须断言 |
| --- | --- | --- |
| AT03 | HTTP与S3两客户端，离线各加图片后重连 | graph一致，图片均能GCM解密，双方重启仍可看 |
| AT03 | 对象PUT成功graph PUT失败/丢响应/412 | 不重复计额或换密文，按旧key重试/重新merge，新引用无悬空发布 |
| AT03 | 本地缺图、远端404、wrong hash、midstream截断 | 金融保留、图片pending/error，不overall synced，有字节设备可修复 |
| AT03 | 并发修改图片、删交易、冲突后选择 | 全候选/旧历史图片保留，明确选择，不靠时间赢 |
| AT03 | upload中disconnect/revoke/换profile | 提交边界取消，未授权对象不发布，迟到不落新本 |
| AT03 | 欺骗Content-Length、超body、重复id不同bytes、跨账号 | 实际bytes上限，413/409/404正确，零明文/文件名泄露 |
| AT03 | 两ledger争账号quota、并发同id、reserve后崩溃、取消 | 配额不超、不双计、元信息/物理对象可恢复，无长DB锁阻断普通auth |
| AT03 | 暂停旧reservation清理→新token重试发布→恢复旧清理/迟到上传 | 新published对象可GET且hash正确，旧token不可finalize/误扣新额度 |
| AT03 | 同ID物理对象损坏但metadata正常，repair时412/撤销 | 只恢复原digest密文，健康对象no-op，错descriptor拒绝；GET验证后才成功 |
| AT03/05 | 两个各300MiB离线分支union超512MiB或合并超10000图 | 合并前明确报quota，双方graph/head/图保留且可分别备份，不自动剥图 |
| AT05 | v1 client旧ETag→v2升级、freshETag降级PUT、旧服务器 | CAS/HTTPminVersion拒绝，客户端preflight不剥图；S3严格旧reader拒绝 |
| AT05 | 本机离线v2首次连远端v1；观察v2后重放v1；换新目标 | 首次normalize并CAS升级合法；目标已见v2再v1才拒绝，不跨目标混用checkpoint |
| AT03 | 大批图+本地继续记账/graph4轮冲突 | 图传输不套全批60s；UI可操作；耗尽pending非假synced |
| AT05 | profile迁移过程中源变化/复制失败 | 完整inventory核验后才activate，失败保留源 |

主测试：tests/server、tests/contracts、tests/server-sync、src/sync；生成SDK跑实际本地HTTP；S3使用现有fixture及MinIO集成。不可用真实云账户代替可复现fixture，不能只mock成功回执证明文件完整。

## E. 完整备份、容量与宿主文件

| ID | 场景 | 必须断言 |
| --- | --- | --- |
| AT04 | v2含当前/删除/冲突/历史图导出，断网导入空profile | 单文件全部图恢复、workspace adopt、hash一致、无远端请求 |
| AT04 | 同workspace merge、不同workspace、导入中本地新增 | merge保留双方，异本拒绝，最终事务按最新union核对 |
| AT04 | v1旧备份导入v2账本 | 原v2图片不清除，无图旧历史兼容 |
| AT04 | header/version/length/manifest wrong password或GCM | 分配/KDF前拒绝不合法上限，原账本不变 |
| AT04 | 缺/重复/额外/乱序frame，bad footer/尾随bytes | 全部拒绝，staging不算恢复成功 |
| AT04 | 最后块/最后事务取消、配额不足/进程死/文件provider错误 | graph未半恢复，不播报成功；未完成文件不可当有效backup |
| AT04/05 | Web大文件、Android SAF、Electron stream | ≤1MiB块/序号，真实flush/close；无整包IPC/Bundle/全内存chunks |
| AT04/05 | SAF provider未知size或谎报size | 按实际计数/header/EOF验证，未知长度可合法恢复，超限仍拒绝 |
| AT04/05 | 64MiB代表性包+接近512MiB容量包 | 完整导入导出，内存曲线无整包倍增；独立记录host/设备/峰值，容量不足清楚失败 |
| AT05 | server数据目录备份恢复到本地隔离副本 | graph对象+附件metadata+密文字节全齐，used/reserved正确 |

大型fixture使用可重复合成图片/密文，不提交512MiB文件。内存门槛：工作集增量以manifest+并发图+chunk为主，目标不超过128MiB（不计浏览器基线/SQLite底层缓存）；若不达需修复实现或呈交实测限额调整，不能隐藏峰值或把压力测试“跳过”称通过。

## F. 视觉与人工边界

- 375×812：账单、类别网格、计算键盘（含图片）、详情、周/月/年统计、环形图、搜索筛选、预算、设置截图。
- 320×740、768×1024、1440×900、812×375：关键页布局；200%缩放、中文/英文、长账本/类别/备注、负结余、大金额、密集列表。
- 键盘Tab顺序/可见焦点/skip link/模态trap/逐层Escape/错误播报/减少动态效果；文本对比度4.5:1、大字3:1，点击48px。
- 用户视觉认可单列“待反馈”；真实辅助技术、Android系统选图/键盘、Electron文件对话框必须按实际运行证据记录。浏览器验证不覆盖这些；鲨鱼ADB截图只支撑参考研究。
- 不连接VPS，不安装/清空用户手机。若后续需要真机Luna验收，由用户另行授权；可先用项目隔离AVD完成Android工程检查。

## G. 完成规则

完整运行命令见implement.md P6。每条需求映射至少一项有效证据，故障测试断言失败前后持久状态而非只有toast。测试改用新路由/角色可接受，删掉财务断言或隐藏旧DOM骗过测试不可接受。发现独立SDK/恢复基线失败单列，不混入“本轮已修好”。

最终 validation.md 按“通过/失败/未运行/人工待验”记录，不以计划勾选替代结果；各已发布附件数据契约必须独立审阅。矩阵中的已执行范围以 validation.md 为准，未运行和人工边界仍不得视为通过。
