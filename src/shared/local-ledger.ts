import type { ServerBinding } from "./server-api";
import { decodeBinding, decodeProfileId } from "./server-api";

export const LOCAL_LEDGER_CATALOG_VERSION = 1 as const;

export type LocalLedgerStorageKind =
  | "sqlite-native"
  | "sqlite-wasm-opfs"
  | "indexeddb-compat";

export type LocalLedgerSyncState =
  | "local-only"
  | "unknown"
  | "disabled"
  | "ready"
  | "syncing"
  | "synced"
  | "pending"
  | "failed";

export interface LocalLedgerCatalogEntry {
  id: string;
  displayName: string;
  storageKind: LocalLedgerStorageKind;
  createdAt: string | null;
  lastOpenedAt: string | null;
  syncState: LocalLedgerSyncState;
  binding: ServerBinding | null;
}

export interface LocalLedgerCatalog {
  version: typeof LOCAL_LEDGER_CATALOG_VERSION;
  entries: LocalLedgerCatalogEntry[];
}

const syncStates = new Set<LocalLedgerSyncState>([
  "local-only",
  "unknown",
  "disabled",
  "ready",
  "syncing",
  "synced",
  "pending",
  "failed",
]);

export function defaultLocalLedgerEntry(
  id: string,
  storageKind: LocalLedgerStorageKind,
  now: string | null = new Date().toISOString(),
): LocalLedgerCatalogEntry {
  const validId = decodeProfileId(id);
  return {
    id: validId,
    displayName: defaultDisplayName(validId),
    storageKind,
    createdAt: validTimestamp(now),
    lastOpenedAt: null,
    syncState: "unknown",
    binding: null,
  };
}

export function decodeLocalLedgerCatalog(
  raw: string | null,
  fallbackStorageKind: LocalLedgerStorageKind,
): LocalLedgerCatalog {
  let value: unknown;
  try {
    value = raw === null ? [] : JSON.parse(raw);
  } catch {
    throw new Error("LUNA_ERROR:local-catalog-invalid");
  }

  const candidates: unknown[] = Array.isArray(value)
    ? value.map((id) => defaultLocalLedgerEntry(decodeProfileId(id), fallbackStorageKind, null))
    : isRecord(value) && value.version === LOCAL_LEDGER_CATALOG_VERSION && Array.isArray(value.entries)
      ? value.entries
      : value === null
        ? []
        : (() => {
            throw new Error("LUNA_ERROR:local-catalog-invalid");
          })();

  if (candidates.length > 1000)
    throw new Error("LUNA_ERROR:local-catalog-invalid");
  const entries: LocalLedgerCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const entry = decodeEntry(candidate, fallbackStorageKind);
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return { version: LOCAL_LEDGER_CATALOG_VERSION, entries };
}

export function encodeLocalLedgerCatalog(catalog: LocalLedgerCatalog): string {
  return JSON.stringify({
    version: LOCAL_LEDGER_CATALOG_VERSION,
    entries: catalog.entries.map((entry) => ({
      ...entry,
      binding: entry.binding,
    })),
  });
}

export function replaceLocalLedgerEntry(
  entries: LocalLedgerCatalogEntry[],
  entry: LocalLedgerCatalogEntry,
): LocalLedgerCatalogEntry[] {
  const remaining = entries.filter((candidate) => candidate.id !== entry.id);
  return [entry, ...remaining];
}

export function decodeLocalLedgerStorageKind(
  value: unknown,
  fallback: LocalLedgerStorageKind,
): LocalLedgerStorageKind {
  return value === "sqlite-native" || value === "sqlite-wasm-opfs" || value === "indexeddb-compat"
    ? value
    : fallback;
}

function decodeEntry(
  value: unknown,
  fallbackStorageKind: LocalLedgerStorageKind,
): LocalLedgerCatalogEntry {
  if (!isRecord(value)) throw new Error("LUNA_ERROR:local-catalog-invalid");
  const id = decodeProfileId(value.id);
  const displayName =
    typeof value.displayName === "string" &&
    value.displayName.trim().length > 0 &&
    value.displayName.length <= 80
      ? value.displayName
      : defaultDisplayName(id);
  const syncState = syncStates.has(value.syncState as LocalLedgerSyncState)
    ? (value.syncState as LocalLedgerSyncState)
    : "unknown";
  return {
    id,
    displayName,
    storageKind: decodeLocalLedgerStorageKind(value.storageKind, fallbackStorageKind),
    createdAt: validTimestamp(value.createdAt),
    lastOpenedAt: validTimestamp(value.lastOpenedAt),
    syncState,
    binding: value.binding === undefined ? null : decodeBinding(value.binding),
  };
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function defaultDisplayName(id: string): string {
  if (id === "legacy-local") return "Luna";
  if (id.startsWith("server-")) return "Server-linked ledger";
  return "Local ledger";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
