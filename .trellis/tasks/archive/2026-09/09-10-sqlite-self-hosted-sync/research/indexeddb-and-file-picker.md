# IndexedDB 与本地文件选择的研究结论

## 结论

IndexedDB 本身适合作为事务型浏览器存储，但本任务不再把它作为账本主存储，也不做
当前开发数据迁移。最终账本统一使用 SQLite：Electron 使用原生 SQLite，Web/Android
使用 SQLite-WASM + OPFS Worker。OPFS 仍属于浏览器 origin 私有存储，不应被描述成
用户可见、唯一、绝对可靠的备份介质；它可能受用户清理、隐私模式、配额/存储压力或
浏览器策略影响。应用仍需短事务、版本迁移、错误/配额处理、导出和远端密文恢复。

## 对本项目的影响

- Web/Android 使用每个本地账本一个 SQLite-WASM/OPFS database。
- 服务端代管的 S3 密文对象是跨设备同步和恢复来源；本地未同步修改仍需要设备本地
  导出或平台备份。
- 启动账本历史保存为本地 catalog，不保存密码/secret，也不同步到 S3。
- Web/Android 不把“选择任意 SQLite 文件”作为核心能力。
- 当前 IndexedDB 仅作为旧实现背景，不进入新运行路径，也不实现旧数据迁移。

## 文件选择边界

`showOpenFilePicker()`/File System Access API 要求安全上下文和用户手势，且兼容性不是
所有主流浏览器都具备的 Baseline 能力。因此它只作为 Electron 原生文件/目录选择的
可选实现；跨平台主流程使用本地 ledger profile。

## 参考

- MDN, IndexedDB key characteristics and durability:
  https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology
- MDN, IndexedDB API:
  https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- MDN, storage quotas and eviction:
  https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN, `IDBTransaction.durability`:
  https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability
- MDN, `showOpenFilePicker()`:
  https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
- MDN, File System API:
  https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- SQLite, persistent storage options for the WASM build:
  https://www.sqlite.org/wasm/doc/trunk/persistence.md
- SQLite, WASM/JavaScript project:
  https://sqlite.org/wasm/doc/tip/about.md
