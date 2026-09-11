import { DeleteObjectCommand, PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConfigSyncService, ConfigSyncServiceError } from '../src/main/config-sync';
import type { SecretProtector } from '../src/main/secret-store';
import { SecretStore } from '../src/main/secret-store';
import { SettingsStore } from '../src/main/settings-store';
import { createTransaction, reviseTransaction, tombstoneTransaction } from '../src/shared/domain';
import { decryptLedgerDocument, LedgerCryptoError } from '../src/shared/ledger-crypto';
import { resolveLedgerChoice } from '../src/shared/ledger-data';
import { LedgerSessionError } from '../src/shared/ledger-session';
import {
  appendLedgerRevision, decodeLedgerDocument, LedgerSyncError, mergeLedgerDocuments,
  projectLedgerDocument, seedLedgerDocument, type LedgerDocument,
} from '../src/shared/ledger-sync';
import { LedgerSyncSession, type LedgerDataPort } from '../src/sync/ledger-service';
import { LedgerObjectError, S3LedgerObjectStore, type LedgerObjectStore } from '../src/sync/s3-ledger-store';
import {
  type ConditionalPut,
  type ConfigObject,
  type ConfigObjectStore,
  type ConfigObjectStoreFactory,
  ObjectStoreError,
  createS3ConfigObjectStore,
} from '../src/main/s3-config-store';
import {
  type AppSettingsFileV1,
  type ConfigSyncConnection,
  type ConfigSyncCredentialsInput,
  SettingsDecodeError,
  configObjectKey,
  decodeConfigSyncConnection,
  decodeConfigSyncCredentials,
  mergePortableSettings,
} from '../src/shared/settings';

const REQUIRED_ENVIRONMENT = [
  'LUNA_S3_CONFORMANCE_PROVIDER',
  'LUNA_S3_CONFORMANCE_PROVIDER_VERSION',
  'LUNA_S3_CONFORMANCE_ENDPOINT',
  'LUNA_S3_CONFORMANCE_REGION',
  'LUNA_S3_CONFORMANCE_BUCKET',
  'LUNA_S3_CONFORMANCE_ACCESS_KEY_ID',
  'LUNA_S3_CONFORMANCE_SECRET_ACCESS_KEY',
  'LUNA_S3_CONFORMANCE_TEST_PASSPHRASE',
  'LUNA_S3_CONFORMANCE_FORCE_PATH_STYLE',
  'LUNA_S3_CONFORMANCE_ALLOW_EXACT_OBJECT_WRITE',
] as const;

interface ConformanceEnvironment {
  provider: string;
  providerVersion: string;
  connection: ConfigSyncConnection;
  credentials: ConfigSyncCredentialsInput;
}

interface OperationCounts {
  get: number;
  put: number;
}

const MIN_SCAN_VALUE_LENGTH = 8;

class SafeConformanceError extends Error {
  constructor(message: string, readonly code = 'assertion-failed') {
    super(message);
    this.name = 'SafeConformanceError';
  }
}

class SessionOnlyProtector implements SecretProtector {
  async persistence() { return 'unavailable' as const; }
  async protect(): Promise<Buffer> { throw new SafeConformanceError('The smoke must not persist credentials.'); }
  async unprotect(): Promise<{ plaintext: string; shouldReEncrypt: boolean }> {
    throw new SafeConformanceError('The smoke must not load persisted credentials.');
  }
}

class CountingConfigObjectStore implements ConfigObjectStore {
  constructor(
    private readonly inner: ConfigObjectStore,
    private readonly counts: OperationCounts,
  ) {}

  async get(key: string): Promise<ConfigObject> {
    this.counts.get += 1;
    return this.inner.get(key);
  }

  async put(
    key: string,
    body: Uint8Array,
    condition: ConditionalPut,
  ): Promise<{ etag: string }> {
    this.counts.put += 1;
    return this.inner.put(key, body, condition);
  }
}

class ProviderLedgerPort implements LedgerDataPort {
  constructor(public document: LedgerDocument | null) {}
  getLedgerDocument(): LedgerDocument | null {
    return this.document === null ? null : decodeLedgerDocument(this.document);
  }
  mergeLedgerDocument(input: LedgerDocument): LedgerDocument {
    this.document = this.document === null ? decodeLedgerDocument(input) : mergeLedgerDocuments(this.document, input);
    return decodeLedgerDocument(this.document);
  }
}

class CountingLedgerObjectStore implements LedgerObjectStore {
  constructor(private readonly inner: LedgerObjectStore, private readonly counts: OperationCounts, private readonly exactKey: string) {}
  async get(key: string, signal: AbortSignal) {
    expect(key === this.exactKey, 'Ledger request escaped its exact test object.', 'unsafe-object-key');
    this.counts.get++;
    return this.inner.get(key, signal);
  }
  async put(key: string, body: string, etag: string | null, signal: AbortSignal): Promise<void> {
    expect(key === this.exactKey, 'Ledger write escaped its exact test object.', 'unsafe-object-key');
    this.counts.put++;
    return this.inner.put(key, body, etag, signal);
  }
  close(): void { this.inner.close(); }
}

let stage = 'environment';

async function run(): Promise<void> {
  const environment = readEnvironment();
  const runId = randomUUID();
  const basePrefix = optionalEnvironment('LUNA_S3_CONFORMANCE_BASE_PREFIX');
  const uniquePrefix = [basePrefix, 'luna-config-conformance', runId]
    .filter((value) => value.length > 0)
    .join('/');
  const connection = decodeConfigSyncConnection({
    ...environment.connection,
    prefix: uniquePrefix,
  });
  const key = configObjectKey(connection.prefix);
  assertExactTestKey(key, runId);
  const ledgerKey = `${connection.prefix}/ledger-v1.enc.json`;
  assertExactLedgerTestKey(ledgerKey, runId);

  const counts: OperationCounts = { get: 0, put: 0 };
  const factory: ConfigObjectStoreFactory = (requestedConnection, requestedCredentials) =>
    new CountingConfigObjectStore(
      createS3ConfigObjectStore(requestedConnection, requestedCredentials),
      counts,
    );
  const cleanupClient = createCleanupClient(connection, environment.credentials);
  const root = await mkdtemp(path.join(tmpdir(), 'luna-config-provider-smoke-'));
  const clientADirectory = path.join(root, 'client-a');
  const clientBDirectory = path.join(root, 'client-b');
  const deviceA = `conformance-a-${randomUUID()}`;
  const deviceB = `conformance-b-${randomUUID()}`;
  let cleanupRequired = false;
  let failure: unknown = null;
  let failureStage = stage;
  let cleanup = 'not-required';
  const ledgerCounts: OperationCounts = { get: 0, put: 0 };
  let ledgerCleanupRequired = false;
  let ledgerCleanup = 'not-required';

  try {
    const clockA = { value: '2026-08-31T01:00:00.000Z' };
    const clockB = { value: '2026-08-31T02:00:00.000Z' };
    const clientA = await createClient(clientADirectory, deviceA, 'en-US', factory, clockA);
    const clientB = await createClient(clientBDirectory, deviceB, 'en-US', factory, clockB);
    expect(
      clientA.store.settingsPath !== clientB.store.settingsPath,
      'Conformance clients must use separate settings files.',
    );

    stage = 'client-a-bootstrap';
    await bootstrap(clientA.service, connection, environment.credentials);
    clockA.value = '2026-08-31T01:01:00.000Z';
    await clientA.service.updateSettings({
      locale: 'zh-CN',
      hideSensitiveAmountsByDefault: false,
    });
    const createdPortable = (await clientA.store.get()).portable;
    cleanupRequired = true;
    expect((await clientA.service.syncNow()).code === 'synced', 'Client A did not create remote settings.');

    stage = 'client-b-restore';
    await bootstrap(clientB.service, connection, environment.credentials);
    const restored = await clientB.service.syncNow();
    expect(restored.code === 'synced', 'Client B did not restore remote settings.');
    expectEqual(
      (await clientB.store.get()).portable,
      createdPortable,
      'Client B did not restore every portable field and revision.',
    );

    stage = 'client-b-update';
    clockB.value = '2026-08-31T02:01:00.000Z';
    await clientB.service.updateSettings({ hideSensitiveAmountsByDefault: true });
    expect((await clientB.service.syncNow()).code === 'synced', 'Client B did not upload its portable change.');
    const changedPortable = (await clientB.store.get()).portable;
    expect(
      changedPortable.locale.value === createdPortable.locale.value,
      'Client B changed more than the selected portable field.',
    );
    expect(
      changedPortable.hideSensitiveAmountsByDefault.value === true,
      'Client B portable change was not applied locally.',
    );

    stage = 'client-a-merge';
    clockA.value = '2026-08-31T03:00:00.000Z';
    const clientABeforeMerge = (await clientA.store.get()).portable;
    const expectedMerged = mergePortableSettings(clientABeforeMerge, changedPortable);
    expectEqual(
      expectedMerged,
      mergePortableSettings(changedPortable, clientABeforeMerge),
      'Portable merge was not deterministic across client order.',
    );
    const merged = await clientA.service.syncNow();
    expect(merged.code === 'synced', 'Client A did not merge Client B settings.');
    expectEqual(
      (await clientA.store.get()).portable,
      expectedMerged,
      'Client A did not converge on the deterministic portable merge.',
    );

    stage = 'idempotency';
    const inspectStore = factory(connection, environment.credentials);
    const remoteBeforeRepeat = await inspectStore.get(key);
    const putsBeforeRepeat = counts.put;
    await clientA.service.syncNow();
    await clientB.service.syncNow();
    const remoteAfterRepeat = await inspectStore.get(key);
    expect(counts.put === putsBeforeRepeat, 'Repeated sync rewrote unchanged randomized ciphertext.');
    expect(remoteAfterRepeat.etag === remoteBeforeRepeat.etag, 'Repeated sync changed the remote ETag.');
    expectBytesEqual(remoteAfterRepeat.body, remoteBeforeRepeat.body, 'Repeated sync changed remote bytes.');
    expectEqual(
      (await clientA.store.get()).portable,
      (await clientB.store.get()).portable,
      'Repeated sync did not leave clients converged.',
    );

    stage = 'remote-secret-scan';
    assertRemoteCiphertext(
      remoteAfterRepeat.body,
      environment.credentials,
      connection,
      [clientADirectory, clientBDirectory, root],
      [deviceA, deviceB],
      createdPortable,
      changedPortable,
    );

    stage = 'master-switch-off';
    await clientB.service.updateSettings({ syncAllPortableSettings: false });
    const callsBeforeDisabled = { ...counts };
    expect((await clientB.service.syncNow()).code === 'disabled', 'Disabled sync did not report disabled.');
    expect((await clientB.service.testConnection()).code === 'disabled', 'Disabled connection test did not report disabled.');
    expectEqual(counts, callsBeforeDisabled, 'Master switch off performed a remote object operation.');
    stage = 'operation-counts';
    expectEqual(counts, { get: 8, put: 2 }, 'Conformance operation counts changed unexpectedly.');
    ledgerCleanupRequired = true;
    await verifyLedgerProvider(connection, environment.credentials, ledgerKey, runId, ledgerCounts);
    stage = 'ledger-config-isolation';
    const unchangedConfig = await createS3ConfigObjectStore(connection, environment.credentials).get(key);
    expect(unchangedConfig.etag === remoteAfterRepeat.etag, 'Ledger sync changed the isolated config object.');
    expectBytesEqual(unchangedConfig.body, remoteAfterRepeat.body, 'Ledger sync changed config ciphertext.');
  } catch (error) {
    failure = error;
    failureStage = stage;
  } finally {
    if (ledgerCleanupRequired) {
      try {
        await cleanupExactLedgerObject(cleanupClient, connection, environment.credentials, ledgerKey, runId);
        ledgerCleanup = 'deleted';
      } catch (error) {
        ledgerCleanup = 'failed';
        if (failure === null) { failure = error; failureStage = 'ledger-cleanup'; }
      }
    }
    if (cleanupRequired) {
      try {
        await cleanupExactObject(cleanupClient, connection, environment.credentials, key, runId);
        cleanup = 'deleted';
      } catch (error) {
        cleanup = 'failed';
        if (failure === null) {
          failure = error;
          failureStage = 'cleanup';
        }
      }
    }
    cleanupClient.destroy();
    await rm(root, { recursive: true, force: true });
  }

  if (failure !== null) {
    stage = failureStage;
    throw failure;
  }
  console.log(`LUNA_CONFIG_SYNC_PROVIDER_CONFORMANCE_OK ${JSON.stringify({
    provider: environment.provider,
    version: environment.providerVersion,
    pathStyle: connection.forcePathStyle,
    cleanup,
    operations: counts,
  })}`);
  console.log(`LUNA_LEDGER_SYNC_PROVIDER_CONFORMANCE_OK ${JSON.stringify({
    provider: environment.provider, version: environment.providerVersion,
    pathStyle: connection.forcePathStyle, cleanup: ledgerCleanup, operations: ledgerCounts, conditionalConflicts: 2,
  })}`);
}

async function verifyLedgerProvider(
  connection: ConfigSyncConnection, credentials: ConfigSyncCredentialsInput,
  key: string, runId: string, counts: OperationCounts,
): Promise<void> {
  const draft = {
    type: 'expense' as const, amountMinor: '1234', date: '2026-09-05',
    splits: [{ category: 'Ledger conformance groceries', amountMinor: '1234' }],
    notes: 'Private ledger provider note sentinel',
  };
  const transaction = createTransaction(`record-${runId}`, draft, 2, '2026-09-05T01:00:00.000Z');
  const base = seedLedgerDocument({
    id: `workspace-${runId}`, name: 'Ledger provider household', currency: 'CNY', precision: 2,
    createdAt: '2026-09-01T00:00:00.000Z',
  }, [transaction], { '2026-09': '50000' });
  const first = new ProviderLedgerPort(base);
  const second = new ProviderLedgerPort(null);
  const factory = () => new CountingLedgerObjectStore(new S3LedgerObjectStore(connection, credentials), counts, key);
  const firstSession = new LedgerSyncSession(first, factory);
  const secondSession = new LedgerSyncSession(second, factory);
  const inspector = factory();
  const signal = AbortSignal.timeout(60_000);
  try {
    stage = 'ledger-bootstrap';
    await firstSession.configure({ connection, credentials, rememberSecrets: false });
    await secondSession.configure({ connection, credentials, rememberSecrets: false });
    expect((await firstSession.syncNow()).code === 'synced', 'Ledger source did not upload.');
    expect((await secondSession.syncNow()).code === 'synced', 'Empty ledger client did not restore.');
    expectEqual(first.document, second.document, 'Ledger restore did not match its source.');
    const staleObject = await inspector.get(key, signal);
    expect(staleObject !== null, 'Ledger object was missing after upload.');

    stage = 'ledger-offline-divergence';
    first.document = appendLedgerRevision(base, {
      id: `edit-${runId}`, kind: 'transaction', entityId: transaction.id,
      value: reviseTransaction(transaction, { ...draft, notes: 'Provider offline edit sentinel' }, 2, '2026-09-05T02:00:00.000Z'),
    });
    second.document = appendLedgerRevision(base, {
      id: `delete-${runId}`, kind: 'transaction', entityId: transaction.id,
      value: tombstoneTransaction(transaction, '2026-09-05T02:00:00.000Z'),
    });
    expect((await firstSession.syncNow()).code === 'synced', 'Ledger edit did not upload.');
    stage = 'ledger-real-conditional-conflicts';
    for (const etag of [staleObject.etag, null]) {
      stage = etag === null ? 'ledger-create-only-conflict' : 'ledger-stale-etag-conflict';
      let conflicted = false;
      const competingClient = factory();
      try { await competingClient.put(key, staleObject.body, etag, signal); }
      catch (error) {
        if (!(error instanceof LedgerObjectError) || error.code !== 'conflict') {
          await diagnoseConditionalFailure(connection, credentials, key, staleObject.body, etag);
          throw error;
        }
        conflicted = true;
      } finally { competingClient.close(); }
      expect(conflicted, 'Provider accepted a stale or create-only overwrite.');
    }
    const afterConflicts = await inspector.get(key, signal);
    expect(afterConflicts !== null, 'Ledger object disappeared after rejected writes.');
    expect(afterConflicts.etag !== staleObject.etag, 'Ledger update did not advance the provider ETag.');
    expectEqual(await decryptLedgerDocument(afterConflicts.body, credentials.passphrase), first.document,
      'A rejected condition changed the current ledger payload.');

    stage = 'ledger-conflict-resolution';
    expect((await secondSession.syncNow()).code === 'synced', 'Ledger deletion did not merge.');
    expect((await firstSession.syncNow()).code === 'synced', 'Ledger conflict did not converge.');
    expectEqual(first.document, second.document, 'Ledger conflict graphs diverged.');
    expect(first.document !== null, 'Merged ledger is missing.');
    const projection = projectLedgerDocument(first.document);
    expect(projection.transactions.length === 0, 'An unresolved financial conflict entered the projection.');
    const conflict = projection.conflicts[0];
    expect(conflict?.kind === 'transaction' && projection.conflicts.length === 1, 'Missing explicit edit/delete conflict.');
    first.document = resolveLedgerChoice(first.document, {
      kind: 'transaction', entityId: transaction.id, selectedHeadId: `delete-${runId}`,
      expectedHeadIds: conflict.heads.map((head) => head.id),
    }, `resolve-${runId}`, '2026-09-05T03:00:00.000Z');
    expect((await firstSession.syncNow()).code === 'synced', 'Ledger resolution did not upload.');
    expect((await secondSession.syncNow()).code === 'synced', 'Ledger resolution did not restore.');
    expectEqual(first.document, second.document, 'Ledger clients did not converge after resolution.');
    const resolved = projectLedgerDocument(first.document);
    expect(resolved.conflicts.length === 0 && resolved.transactions.length === 1 && resolved.transactions[0]?.deletedAt != null,
      'Resolved deletion was not retained.');

    stage = 'ledger-idempotency-and-ciphertext';
    const beforeRepeat = await inspector.get(key, signal);
    const putsBeforeRepeat = counts.put;
    await firstSession.syncNow();
    await secondSession.syncNow();
    const afterRepeat = await inspector.get(key, signal);
    expect(beforeRepeat !== null && afterRepeat !== null, 'Repeated ledger sync lost the remote object.');
    expect(counts.put === putsBeforeRepeat, 'Repeated ledger sync rewrote unchanged ciphertext.');
    expectEqual(afterRepeat, beforeRepeat, 'Repeated ledger sync changed encrypted bytes or ETag.');
    expectEqual(await decryptLedgerDocument(afterRepeat.body, credentials.passphrase), first.document,
      'Provider ciphertext did not decrypt to the current graph.');
    for (const forbidden of [credentials.accessKeyId, credentials.secretAccessKey, credentials.passphrase,
      credentials.sessionToken, draft.notes, 'Provider offline edit sentinel', base.workspace.id,
      connection.endpoint, connection.bucket, connection.prefix, '"amountMinor"']) {
      if (forbidden) expect(!afterRepeat.body.includes(forbidden), 'Ledger ciphertext contains forbidden plaintext.');
    }
    stage = 'ledger-disabled';
    secondSession.clear();
    const beforeDisabled = { ...counts };
    expect((await secondSession.syncNow()).code === 'disabled', 'Cleared ledger session remained enabled.');
    await secondSession.getCurrentStatus();
    expectEqual(counts, beforeDisabled, 'Disabled ledger session performed remote IO.');
    expectEqual(counts, { get: 13, put: 6 }, 'Ledger provider operation counts changed unexpectedly.');
  } finally {
    firstSession.clear();
    secondSession.clear();
    inspector.close();
  }
}

async function diagnoseConditionalFailure(
  connection: ConfigSyncConnection, credentials: ConfigSyncCredentialsInput,
  key: string, body: string, etag: string | null,
): Promise<void> {
  const client = createCleanupClient(connection, credentials);
  try {
    await client.send(new PutObjectCommand({
      Bucket: connection.bucket, Key: key, Body: new TextEncoder().encode(body), ContentType: 'application/json',
      ...(etag === null ? { IfNoneMatch: '*' } : { IfMatch: etag }),
    }), { abortSignal: AbortSignal.timeout(15_000) });
    throw new SafeConformanceError('Diagnostic conditional write unexpectedly succeeded.', 'conditional-unprotected');
  } catch (error) {
    if (error instanceof SafeConformanceError) throw error;
    const metadata = typeof error === 'object' && error !== null && '$metadata' in error ? error.$metadata : null;
    const status = typeof metadata === 'object' && metadata !== null && 'httpStatusCode' in metadata
      ? metadata.httpStatusCode : null;
    const code = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
      ? `conditional-http-${status}` : 'conditional-no-http-status';
    throw new SafeConformanceError('Production ledger adapter did not classify the provider conditional failure.', code);
  } finally {
    client.destroy();
  }
}

async function createClient(
  directory: string,
  deviceId: string,
  systemLocale: string,
  objectStoreFactory: ConfigObjectStoreFactory,
  clock: { value: string },
): Promise<{ service: ConfigSyncService; store: SettingsStore }> {
  const store = new SettingsStore(directory, {
    deviceId: () => deviceId,
    systemLocale,
    now: () => clock.value,
  });
  await store.initialize();
  const service = new ConfigSyncService(
    store,
    new SecretStore(directory, new SessionOnlyProtector()),
    objectStoreFactory,
    {
      now: () => clock.value,
      sleep: async () => undefined,
    },
  );
  return { service, store };
}

async function bootstrap(
  service: ConfigSyncService,
  connection: ConfigSyncConnection,
  credentials: ConfigSyncCredentialsInput,
): Promise<void> {
  await service.configure({ connection, credentials, rememberSecrets: false });
  await service.updateSettings({ syncAllPortableSettings: true });
}

function readEnvironment(): ConformanceEnvironment {
  const missing = REQUIRED_ENVIRONMENT.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.length === 0;
  });
  if (missing.length > 0) {
    throw new SafeConformanceError(`Missing required environment variables: ${missing.join(', ')}.`, 'invalid-environment');
  }
  const provider = safeEvidenceValue(requiredEnvironment('LUNA_S3_CONFORMANCE_PROVIDER').trim(), 'provider');
  const providerVersion = safeEvidenceValue(
    requiredEnvironment('LUNA_S3_CONFORMANCE_PROVIDER_VERSION').trim(),
    'provider version',
  );
  const forcePathStyleText = requiredEnvironment('LUNA_S3_CONFORMANCE_FORCE_PATH_STYLE');
  if (forcePathStyleText !== 'true' && forcePathStyleText !== 'false') {
    throw new SafeConformanceError(
      'LUNA_S3_CONFORMANCE_FORCE_PATH_STYLE must be exactly true or false.',
      'invalid-environment',
    );
  }
  if (requiredEnvironment('LUNA_S3_CONFORMANCE_ALLOW_EXACT_OBJECT_WRITE') !== 'true') {
    throw new SafeConformanceError(
      'LUNA_S3_CONFORMANCE_ALLOW_EXACT_OBJECT_WRITE must be exactly true.',
      'invalid-environment',
    );
  }
  const sessionToken = process.env.LUNA_S3_CONFORMANCE_SESSION_TOKEN;
  const credentials = decodeConfigSyncCredentials({
    accessKeyId: requiredEnvironment('LUNA_S3_CONFORMANCE_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnvironment('LUNA_S3_CONFORMANCE_SECRET_ACCESS_KEY'),
    ...(sessionToken === undefined || sessionToken.length === 0
      ? {}
      : { sessionToken }),
    passphrase: requiredEnvironment('LUNA_S3_CONFORMANCE_TEST_PASSPHRASE'),
  });
  const connection = decodeConfigSyncConnection({
    endpoint: requiredEnvironment('LUNA_S3_CONFORMANCE_ENDPOINT'),
    region: requiredEnvironment('LUNA_S3_CONFORMANCE_REGION'),
    bucket: requiredEnvironment('LUNA_S3_CONFORMANCE_BUCKET'),
    prefix: '',
    forcePathStyle: forcePathStyleText === 'true',
  });
  assertScannableEnvironment(connection, credentials);
  return {
    provider,
    providerVersion,
    connection,
    credentials,
  };
}

function assertScannableEnvironment(
  connection: ConfigSyncConnection,
  credentials: ConfigSyncCredentialsInput,
): void {
  const values = [
    connection.endpoint,
    connection.region,
    connection.bucket,
    credentials.accessKeyId,
    credentials.secretAccessKey,
    credentials.sessionToken,
    credentials.passphrase,
  ].filter((value): value is string => value !== undefined);
  if (values.some((value) => value.length < MIN_SCAN_VALUE_LENGTH)) {
    throw new SafeConformanceError(
      `Connection and credential scan values must be at least ${MIN_SCAN_VALUE_LENGTH} characters.`,
      'invalid-environment',
    );
  }
}

function requiredEnvironment(name: (typeof REQUIRED_ENVIRONMENT)[number]): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new SafeConformanceError(`Missing required environment variable: ${name}.`, 'invalid-environment');
  }
  return value;
}

function optionalEnvironment(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function safeEvidenceValue(value: string, label: string): string {
  if (value.length === 0 || value.length > 200 || /[^\x20-\x7E]/.test(value)) {
    throw new SafeConformanceError(`${label} must be 1-200 printable ASCII characters.`, 'invalid-environment');
  }
  return value;
}

function createCleanupClient(
  connection: ConfigSyncConnection,
  credentials: ConfigSyncCredentialsInput,
): S3Client {
  const config: S3ClientConfig = {
    endpoint: connection.endpoint,
    region: connection.region,
    forcePathStyle: connection.forcePathStyle,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken === undefined ? {} : { sessionToken: credentials.sessionToken }),
    },
    maxAttempts: 1,
  };
  return new S3Client(config);
}

async function cleanupExactObject(
  client: S3Client,
  connection: ConfigSyncConnection,
  credentials: ConfigSyncCredentialsInput,
  key: string,
  runId: string,
): Promise<void> {
  assertExactTestKey(key, runId);
  await client.send(new DeleteObjectCommand({ Bucket: connection.bucket, Key: key }));
  try {
    await createS3ConfigObjectStore(connection, credentials).get(key);
  } catch (error) {
    if (error instanceof ObjectStoreError && error.code === 'not-found') return;
    throw error;
  }
  throw new SafeConformanceError('Exact test object still exists after cleanup.', 'cleanup-failed');
}

function assertExactTestKey(key: string, runId: string): void {
  const expectedSuffix = `luna-config-conformance/${runId}/config/v1/settings.enc.json`;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId) ||
    !key.endsWith(expectedSuffix) ||
    key.includes('//')
  ) {
    throw new SafeConformanceError('Refusing remote cleanup because the object key is not run-scoped.', 'unsafe-cleanup');
  }
}

function assertExactLedgerTestKey(key: string, runId: string): void {
  const suffix = `luna-config-conformance/${runId}/ledger-v1.enc.json`;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId) ||
    !(key === suffix || key.endsWith(`/${suffix}`)) || key.includes('//')
  ) {
    throw new SafeConformanceError('Refusing ledger cleanup because the object key is not run-scoped.', 'unsafe-cleanup');
  }
}

async function cleanupExactLedgerObject(
  client: S3Client, connection: ConfigSyncConnection, credentials: ConfigSyncCredentialsInput,
  key: string, runId: string,
): Promise<void> {
  assertExactLedgerTestKey(key, runId);
  await client.send(new DeleteObjectCommand({ Bucket: connection.bucket, Key: key }));
  const inspector = new S3LedgerObjectStore(connection, credentials);
  try {
    expect(await inspector.get(key, AbortSignal.timeout(15_000)) === null,
      'Exact ledger test object still exists after cleanup.', 'cleanup-failed');
  } finally {
    inspector.close();
  }
}

function assertRemoteCiphertext(
  bytes: Uint8Array,
  credentials: ConfigSyncCredentialsInput,
  connection: ConfigSyncConnection,
  localPaths: readonly string[],
  deviceIds: readonly string[],
  createdPortable: AppSettingsFileV1['portable'],
  changedPortable: AppSettingsFileV1['portable'],
): void {
  const remoteText = Buffer.from(bytes).toString('utf8');
  const forbidden = [
    credentials.accessKeyId,
    credentials.secretAccessKey,
    credentials.sessionToken,
    credentials.passphrase,
    connection.endpoint,
    connection.region,
    connection.bucket,
    connection.prefix,
    ...localPaths,
    ...deviceIds,
    JSON.stringify(createdPortable),
    JSON.stringify(changedPortable),
    '"portable"',
    '"locale"',
    '"hideSensitiveAmountsByDefault"',
    '"value":"zh-CN"',
    '"value":false',
    '"value":true',
  ].filter((value): value is string => value !== undefined && value.length > 0);
  expect(
    forbidden.every((value) => !remoteText.includes(value)),
    'Remote encrypted bytes contain forbidden plaintext.',
  );
}

function expect(condition: boolean, message: string, code = 'assertion-failed'): asserts condition {
  if (!condition) throw new SafeConformanceError(message, code);
}

function expectEqual(actual: unknown, expected: unknown, message: string): void {
  expect(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function expectBytesEqual(actual: Uint8Array, expected: Uint8Array, message: string): void {
  expect(actual.byteLength === expected.byteLength && Buffer.from(actual).equals(Buffer.from(expected)), message);
}

run().catch((error: unknown) => {
  if (error instanceof SafeConformanceError) {
    console.error(`LUNA_CONFIG_SYNC_PROVIDER_CONFORMANCE_FAILED stage=${stage} code=${error.code}: ${error.message}`);
  } else if (error instanceof ConfigSyncServiceError || error instanceof ObjectStoreError ||
    error instanceof LedgerCryptoError || error instanceof LedgerSyncError ||
    error instanceof LedgerSessionError || error instanceof LedgerObjectError) {
    console.error(`LUNA_CONFIG_SYNC_PROVIDER_CONFORMANCE_FAILED stage=${stage} code=${error.code}`);
  } else if (error instanceof SettingsDecodeError) {
    console.error(`LUNA_CONFIG_SYNC_PROVIDER_CONFORMANCE_FAILED stage=${stage} code=${error.code} message=${error.message}`);
  } else {
    console.error(`LUNA_CONFIG_SYNC_PROVIDER_CONFORMANCE_FAILED stage=${stage} code=unexpected-error`);
  }
  process.exitCode = 1;
});
