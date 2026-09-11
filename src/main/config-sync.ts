import { ConfigSyncService as PortableConfigSyncService, type ConfigSyncServiceOptions } from '../sync/config-service';
import type { SettingsStore } from './settings-store';
import type { SecretStore } from './secret-store';
import type { ConfigObjectStoreFactory } from './s3-config-store';
import * as nativeCrypto from './config-crypto';

export { ConfigSyncServiceError, type ConfigSyncServiceOptions } from '../sync/config-service';

/** Desktop retains native scrypt and safeStorage behind the portable lifecycle. */
export class ConfigSyncService extends PortableConfigSyncService {
  constructor(settings: SettingsStore, secrets: SecretStore, factory: ConfigObjectStoreFactory, options: ConfigSyncServiceOptions) {
    super(settings, secrets, factory, { ...options, crypto: options.crypto ?? nativeCrypto });
  }
}
