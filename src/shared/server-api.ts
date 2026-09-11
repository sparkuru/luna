import type { LedgerSessionStatus } from "./ledger-session";
import type { LedgerSyncMode } from "./settings";

export interface ServerBinding {
  instanceId: string;
  userId: string;
  ledgerId: string;
  baseUrl: string;
}
export interface ProfileSummary {
  id: string;
  displayName: string;
  binding: ServerBinding | null;
}
export interface ServerStatus {
  generation: number;
  profile: ProfileSummary;
  account: {
    baseUrl: string;
    instanceId: string;
    id: string;
    username: string;
  } | null;
  connected: boolean;
  /** Automatic while the app is active by default; manual disables background sync. */
  syncMode: LedgerSyncMode;
  sync: LedgerSessionStatus;
  preferences: { enabled: boolean; code: string };
}
export interface ServerLoginInput {
  baseUrl: string;
  username: string;
  password: string;
  deviceLabel: string;
}
export interface ServerConnectInput {
  passphrase: string;
  sourceProfileId: string | null;
  allowLocalOnlyMigration: boolean;
}
export interface LunaServerApi {
  status(): Promise<ServerStatus>;
  login(input: ServerLoginInput): Promise<ServerStatus>;
  logout(): Promise<ServerStatus>;
  profiles(): Promise<ProfileSummary[]>;
  selectProfile(id: string): Promise<ServerStatus>;
  removeProfile(id: string): Promise<ServerStatus>;
  connect(input: ServerConnectInput): Promise<ServerStatus>;
  unlock(passphrase: string): Promise<ServerStatus>;
  sync(): Promise<ServerStatus>;
  setSyncMode(mode: LedgerSyncMode): Promise<ServerStatus>;
  disconnect(): Promise<ServerStatus>;
  configurePreferences(input: {
    enabled: boolean;
    passphrase: string;
  }): Promise<ServerStatus>;
  syncPreferences(): Promise<ServerStatus>;
  sessions(): Promise<
    Array<{
      id: string;
      deviceLabel: string;
      createdAt: string;
      expiresAt: string;
      current: boolean;
    }>
  >;
  revokeSession(id: string): Promise<ServerStatus>;
}
export function isLoopbackHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}
export function isPrivateIpv4Hostname(hostname: string): boolean {
  const parts = hostname.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(?:0|[1-9]\d{0,2})$/.test(part))
  )
    return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [first = -1, second = -1] = octets;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
export function isAllowedServerOrigin(url: URL): boolean {
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      (isLoopbackHostname(url.hostname) || isPrivateIpv4Hostname(url.hostname)))
  );
}
export function decodeServerId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("LUNA_ERROR:invalid-input");
  return value.toLowerCase();
}
export function serverProfileId(instanceId: string, userId: string): string {
  return `server-${decodeServerId(instanceId)}-${decodeServerId(userId)}`;
}
export function decodeProfileId(value: unknown): string {
  if (value === "legacy-local") return value;
  if (
    typeof value !== "string" ||
    !/^server-[0-9a-f-]{36}-[0-9a-f-]{36}$/.test(value)
  )
    throw new Error("LUNA_ERROR:invalid-input");
  if (serverProfileId(value.slice(7, 43), value.slice(44)) !== value)
    throw new Error("LUNA_ERROR:invalid-input");
  return value;
}
export function decodeBinding(value: unknown): ServerBinding | null {
  if (value === null) return null;
  if (typeof value !== "object" || !value || Array.isArray(value))
    throw new Error("LUNA_ERROR:invalid-input");
  const r = value as Record<string, unknown>;
  if (Object.keys(r).sort().join(",") !== "baseUrl,instanceId,ledgerId,userId")
    throw new Error("LUNA_ERROR:invalid-input");
  return {
    instanceId: decodeServerId(r.instanceId),
    userId: decodeServerId(r.userId),
    ledgerId: decodeServerId(r.ledgerId),
    baseUrl: decodeServerUrl(r.baseUrl),
  };
}
export function decodeServerUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("LUNA_ERROR:invalid-input");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("LUNA_ERROR:invalid-input");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !isAllowedServerOrigin(url)
  )
    throw new Error("LUNA_ERROR:ledger-insecure-connection");
  return url.origin;
}
export function decodeLogin(value: unknown): ServerLoginInput {
  if (typeof value !== "object" || !value || Array.isArray(value))
    throw new Error("LUNA_ERROR:invalid-input");
  const r = value as Record<string, unknown>;
  if (
    Object.keys(r).sort().join(",") !==
      "baseUrl,deviceLabel,password,username" ||
    typeof r.username !== "string" ||
    r.username.length > 128 ||
    typeof r.password !== "string" ||
    r.password.length > 512 ||
    typeof r.deviceLabel !== "string" ||
    r.deviceLabel.length > 80
  )
    throw new Error("LUNA_ERROR:invalid-input");
  return {
    baseUrl: decodeServerUrl(r.baseUrl),
    username: r.username,
    password: r.password,
    deviceLabel: r.deviceLabel,
  };
}
