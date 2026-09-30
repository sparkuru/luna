import type { LunaLedgerApi } from "../shared/api";
import type { ServerBinding, ProfileSummary } from "../shared/server-api";
import type { LocalLedgerSyncState } from "../shared/local-ledger";
import type { LedgerDocument } from "../shared/ledger-sync";
import type { LedgerDataPort } from "./ledger-service";
import type { ConfigSyncService } from "./config-service";

export interface LocalProfile {
  id: string;
  api: LunaLedgerApi;
  ledger: LedgerDataPort;
  config: ConfigSyncService;
  readDurable(): Promise<LedgerDocument | null>;
  binding(): Promise<ServerBinding | null>;
  bind(
    document: LedgerDocument,
    binding: ServerBinding,
    signal: AbortSignal,
  ): Promise<void>;
  close(): Promise<void>;
}
export interface ProfileRepository {
  active?(): Promise<string>;
  activate?(id: string, signal: AbortSignal): Promise<void>;
  createLocal?(): Promise<string>;
  setSyncState?(id: string, syncState: LocalLedgerSyncState): Promise<void>;
  remove?(id: string): Promise<void>;
  closeAll?(): Promise<void>;
  open(id: string, createIfMissing?: boolean): Promise<LocalProfile>;
  list(): Promise<ProfileSummary[]>;
}
