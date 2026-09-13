import type { AppLocale } from "../../shared/settings";
export const serverEn = {
  title: "Luna account",
  help: "Sign in to your Luna account so this device can connect to a shared ledger. A trusted private-LAN HTTP address is supported for development; use HTTPS elsewhere. Signing in does not upload or move this local copy.",
  server: "Luna address",
  username: "Username",
  password: "Account password",
  device: "Device name",
  login: "Sign in",
  logout: "Sign out",
  signedOut: "Signed out. Local ledgers remain available offline.",
  localNotice:
    "Local copies stay on this device and remain usable offline. A normal refresh keeps this tab's signed-in and unlocked session; closing the tab or browser requires signing in and unlocking again. Your account password is not your ledger password, so keep the ledger password safe.",
  profiles: "Local ledger copies",
  local: "Original local ledger",
  serverCopy: "Server-linked local copy",
  chooseProfile: "Open local copy",
  active: "Currently open",
  removeLocalCopy: "Delete local copy",
  removeLocalCopyWarning:
    "Deletes this copy and its local settings from this device only. It does not delete the shared ledger or copies on other devices.",
  removeLocalCopyConfirm:
    "Delete this local copy? Unsynced changes on this device will be lost. The shared ledger and other devices will not be changed.",
  removeLocalCopyDone: "Local copy deleted from this device.",
  activeCopyWarning: "This copy is open. Open another copy before deleting it.",
  originalCopyWarning:
    "The original local copy is kept as a safety copy and cannot be deleted here.",
  syncTitle: "Sync this ledger",
  syncStatusLabel: "Sync status",
  openSync: "Set up sync and view status",
  signedIn: "Account signed in",
  connected: "Ledger connected",
  remoteChangeAvailable:
    "Remote changes are available. Manual mode will not pull them until you choose Sync ledger now.",
  syncHelp:
    "Follow four steps: sign in to your Luna account, connect or unlock this ledger, choose automatic or manual sync, then sync or check the status.",
  syncSteps: "Sync setup",
  stepLogin: "Sign in to your Luna account",
  stepLoginHelp: "Use the same account on each device you want to keep in sync.",
  stepConnect: "Connect or unlock this ledger",
  stepConnectHelp:
    "Choose a local copy or restore one from your account, then enter its ledger password.",
  stepMode: "Choose automatic or manual sync",
  stepModeHelp:
    "Automatic checks while Luna is active. Manual waits until you start a sync.",
  stepAction: "Sync now or view status",
  stepActionHelp:
    "Use Sync now to send and receive changes. The status above shows what needs attention.",
  goToAccount: "Go to sign-in",
  source: "Initial ledger source",
  remote: "Restore from your account",
  copy: "Copy a local ledger",
  passphrase: "Ledger encryption password",
  connect: "Connect this copy",
  localOnly: "Use only this device's local history",
  localOnlyHelp:
    "Use this only when you are sure the shared copy cannot be checked. Changes that exist only in the shared copy may be omitted; the original local copy stays intact.",
  unlock: "Unlock this copy",
  sync: "Sync now",
  disconnect: "Disconnect this copy",
  syncMode: "Sync mode",
  automatic: "Automatic while the app is active",
  manual: "Manual only",
  auto: "Automatic mode checks for changes while Luna is active. Manual mode keeps changes local until you choose Sync now.",
  needsLogin: "Sign in before connecting or unlocking sync.",
  needsUnlock:
    "This local copy is ready. Enter its ledger password to reconnect sync.",
  prefs: "Encrypted display-settings sync",
  prefsHelp:
    "Separate from ledger sync. Enable it explicitly and use the same settings password on each device.",
  prefsPassword: "Settings encryption password",
  enablePrefs: "Enable settings sync",
  disablePrefs: "Disable settings sync",
  syncPrefs: "Sync settings now",
  sessions: "Signed-in devices",
  current: "This session",
  revoke: "Revoke session",
  reloadSessions: "Refresh devices",
  noSessions: "No active devices to show.",
  working: "Working…",
  completed: "Operation completed.",
  authentication:
    "Sign-in failed or the session expired. Check your credentials and sign in again.",
  permission: "The server denied access to this ledger.",
  unavailable: "The server is unavailable. Your local ledger is still usable.",
  busy: "Another account operation is running. Wait and try again.",
  cancelled: "The previous operation was cancelled.",
  locked: "Sign in and unlock this ledger before syncing.",
  notFound: "The requested server ledger or local copy is unavailable.",
  empty:
    "There is no remote ledger to restore. Choose an existing local copy to create one.",
  mismatch:
    "The account, server or workspace does not match this local copy. Choose the matching account and copy.",
  pending:
    "The original sync target could not be confirmed. Retry, or explicitly choose to copy local history only.",
  sourceChanged:
    "The source changed during copying. Your originals are intact; retry the copy.",
  verification:
    "The copied ledger could not be verified. Your original is intact; retry.",
  upgradeRequired:
    "This server only supports the legacy ledger format. Upgrade the server before syncing v2 ledgers or images; local data remains available.",
  invalid: "Check the server address and required fields.",
  s3Notice:
    "S3 is an alternative sync target. Connecting S3 disconnects server ledger sync; Luna never writes both targets at once.",
  confirmPreferencesS3:
    "Switch display-settings sync to S3? Server settings sync will be disabled.",
  confirmS3:
    "Switch from server sync to S3? This disconnects server sync for this session.",
  offline:
    "Offline: local copies remain usable. Server actions need a connection.",
} as const;
export const serverZh: Record<keyof typeof serverEn, string> = {
  title: "Luna 统一账号",
  help: "登录 Luna 统一账号，让此设备连接共享账本。开发环境可使用可信局域网 HTTP 地址，其他场景请使用 HTTPS。登录不会上传或移动此设备上的本地副本。",
  server: "Luna 地址",
  username: "用户名",
  password: "账号密码",
  device: "设备名称",
  login: "登录",
  logout: "退出登录",
  signedOut: "尚未登录，本地账本仍可离线使用。",
  localNotice: "本地副本保存在此设备上，离线时仍可使用。普通刷新会保留当前标签页的登录和解锁状态；关闭标签页或浏览器后需要重新登录并解锁。账号密码不是账本口令，请妥善保存账本口令。",
  profiles: "本地账本副本",
  local: "原始本地副本",
  serverCopy: "已连接的本地副本",
  chooseProfile: "打开副本",
  active: "当前打开",
  removeLocalCopy: "删除本地副本",
  removeLocalCopyWarning:
    "只会从此设备删除该副本及其本地设置，不会删除共享账本或其他设备上的副本。",
  removeLocalCopyConfirm:
    "删除这个本地副本？此设备上尚未同步的修改会丢失；共享账本和其他设备不会改变。",
  removeLocalCopyDone: "本地副本已从此设备删除。",
  activeCopyWarning: "此副本当前正在打开，请先打开其他副本后再删除。",
  originalCopyWarning: "原始本地副本作为安全副本保留，不能在此删除。",
  syncTitle: "同步此账本",
  syncStatusLabel: "同步状态",
  openSync: "设置同步并查看状态",
  signedIn: "账号已登录",
  connected: "账本已连接",
  remoteChangeAvailable:
    "远端有新的修改。手动模式不会自动拉取，请点击“立即同步账本”。",
  syncHelp: "按四步操作：登录 Luna 统一账号，连接或解锁此账本，选择自动或手动同步，然后立即同步或查看状态。",
  syncSteps: "同步设置步骤",
  stepLogin: "登录 Luna 统一账号",
  stepLoginHelp: "每台需要保持同步的设备都使用同一个账号。",
  stepConnect: "连接或解锁此账本",
  stepConnectHelp: "选择一个本地副本或从账号恢复副本，然后输入账本口令。",
  stepMode: "选择自动或手动同步",
  stepModeHelp: "自动模式会在 Luna 活跃时检查；手动模式要等你主动开始同步。",
  stepAction: "立即同步或查看状态",
  stepActionHelp: "点击“立即同步”收发修改；上方状态会说明是否需要处理。",
  goToAccount: "前往登录",
  source: "初始账本来源",
  remote: "从账号恢复",
  copy: "复制本地账本",
  passphrase: "账本加密口令",
  connect: "连接此副本",
  localOnly: "仅使用此设备的本地历史",
  localOnlyHelp:
    "只有在确定无法检查共享副本时才使用。共享副本中独有的修改可能被遗漏；原始本地副本仍会保留。",
  unlock: "解锁此副本",
  sync: "立即同步",
  disconnect: "断开此副本",
  syncMode: "同步模式",
  automatic: "应用活跃时自动同步",
  manual: "仅手动同步",
  auto: "自动模式会在 Luna 活跃时检查变化；手动模式会一直保留本地修改，直到你点击“立即同步”。",
  needsLogin: "连接或解锁同步前请先登录。",
  needsUnlock: "此本地副本已准备好，输入账本口令即可重新连接同步。",
  prefs: "加密显示设置同步",
  prefsHelp: "与账本同步独立。请明确启用，并在各设备使用同一设置口令。",
  prefsPassword: "设置加密口令",
  enablePrefs: "启用设置同步",
  disablePrefs: "停用设置同步",
  syncPrefs: "立即同步设置",
  sessions: "已登录设备",
  current: "当前会话",
  revoke: "撤销会话",
  reloadSessions: "刷新设备",
  noSessions: "暂无可显示的活动设备。",
  working: "处理中…",
  completed: "操作已完成。",
  authentication: "登录失败或会话已过期，请检查凭据并重新登录。",
  permission: "服务器拒绝访问此账本。",
  unavailable: "暂时无法连接服务器，本地账本仍可使用。",
  busy: "另一个账号操作正在进行，请稍后重试。",
  cancelled: "前一个操作已取消。",
  locked: "请先登录并解锁此账本。",
  notFound: "服务器账本或本地副本不可用。",
  empty: "服务器尚无可恢复的账本，请选择现有本地副本创建。",
  mismatch: "账号、服务器或工作区与此副本不匹配，请选择对应的账号和副本。",
  pending: "无法确认原同步目标，请重试或明确选择仅复制本地历史。",
  sourceChanged: "复制期间来源发生变化，原件仍完整，请重试。",
  verification: "无法验证复制结果，原件仍完整，请重试。",
  upgradeRequired:
    "此服务器仅支持旧版账本格式。同步 v2 账本或图片前请先升级服务器；本地数据仍可使用。",
  invalid: "请检查服务器地址和必填字段。",
  s3Notice:
    "S3 是另一种同步目标。连接 S3 会断开服务器账本同步，不会同时写入两个目标。",
  confirmPreferencesS3: "将显示设置同步切换到 S3？这会停用服务器设置同步。",
  confirmS3: "切换到 S3？这将断开本次服务器同步。",
  offline: "当前离线，本地副本仍可使用，服务器操作需要网络连接。",
};
export type ServerMessageKey = keyof typeof serverEn;
export function serverMessage(
  locale: AppLocale,
  key: ServerMessageKey,
): string {
  return (locale === "zh-CN" ? serverZh : serverEn)[key];
}
export function serverErrorMessage(
  locale: AppLocale,
  error: unknown,
): string | undefined {
  const code = /LUNA_ERROR:server-([a-z-]+)/.exec(
    error instanceof Error ? error.message : "",
  )?.[1];
  if (!code) return undefined;
  const keys: Record<string, ServerMessageKey> = {
    authentication: "authentication",
    permission: "permission",
    unavailable: "unavailable",
    busy: "busy",
    cancelled: "cancelled",
    locked: "locked",
    "not-found": "notFound",
    empty: "empty",
    "binding-mismatch": "mismatch",
    pending: "pending",
    "source-changed": "sourceChanged",
    "verification-failed": "verification",
    "unsupported-version": "upgradeRequired",
    "invalid-input": "invalid",
    "invalid-response": "unavailable",
    "active-profile": "activeCopyWarning",
    "profile-protected": "originalCopyWarning",
  };
  return serverMessage(locale, keys[code] ?? "unavailable");
}
