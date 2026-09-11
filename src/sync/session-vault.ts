/**
 * A host-local session handoff. Implementations must keep this value scoped to
 * the current runtime/session; it is deliberately not a StateStore and must
 * never be backed by the application's durable ledger/catalog data. Browser
 * hosts may use tab-scoped sessionStorage solely to survive a normal reload.
 */
export interface SessionVaultRecord {
  account: {
    token: string;
    expiresAt: string;
    baseUrl: string;
    instanceId: string;
    id: string;
    username: string;
  };
  ledger: {
    profileId: string;
    ledgerId: string;
    passphrase: string;
    remoteEtag: string | null;
  } | null;
}

export interface SessionVault {
  load(): Promise<SessionVaultRecord | null>;
  save(record: SessionVaultRecord): Promise<void>;
  clear(): Promise<void>;
  close?(): void;
}
