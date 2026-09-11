# C integration seams inspected by root

- src/web/web-api.ts createWebLedgerApi(storage,database) constructs one BrowserStateStore; WebLedgerApi owns LedgerSyncSession and ConfigSyncService. Reuse complete API implementations per profile, rather than duplicating financial rules.
- BrowserStateStore currently always opens WEB_DATABASE_NAME='luna-ledger' and automatically reads WEB_LEGACY_STORAGE_KEY when the current record is absent. New profiles must accept a distinct database name and explicitly disable legacy import. Passing null legacyStorage currently throws storage-unavailable, so it is not a valid “empty new profile” mode by itself.
- IDB operation resolves at transaction completion, with cancellation propagated through open and write; preserve this when adding profiles.
- main/ipc.ts registerIpcHandlers captures a LocalStore and ConfigSyncService, and creates a ledger session. A profile switch must route all financial/settings/sync operations to the current profile together; merely changing a database filename after registration leaves old closures active.
- main.ts creates the local SQLite and settings/secret service from the chosen app data directory, has native directory migration behavior and an independent packaged --smoke path. Do not break that baseline while adding internal per-profile directories.
- Existing domain API can remain stable for ordinary ledger consumers. Additional account/profile capabilities need typed/decoded IPC rather than generic arbitrary method invocation. Electron token/network stays main-side.
- Existing S3 and configuration sync settings types are provider-specific. New HTTP session inputs should not fabricate AWS credentials or persist access tokens inside ConfigureConfigSyncInput.

This is source evidence and implementation guidance, not completed C work. A/B interfaces and C tests remain prerequisites for integration acceptance.
