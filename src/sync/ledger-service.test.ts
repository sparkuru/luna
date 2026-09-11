import assert from 'node:assert/strict';
import test from 'node:test';
import { createTransaction, reviseTransaction, tombstoneTransaction, type TransactionDraft } from '../shared/domain';
import { decryptLedgerDocument, encryptLedgerDocument } from '../shared/ledger-crypto';
import { resolveLedgerChoice } from '../shared/ledger-data';
import { LedgerSessionError } from '../shared/ledger-session';
import {
  appendLedgerRevision, decodeLedgerDocument, mergeLedgerDocuments, projectLedgerDocument,
  seedLedgerDocument, type LedgerDocument,
} from '../shared/ledger-sync';
import type { ConfigureConfigSyncInput } from '../shared/settings';
import { LedgerSyncSession, type LedgerDataPort } from './ledger-service';
import { LedgerObjectError, type LedgerObjectStore } from './s3-ledger-store';

const PASSWORD = 'test-only-long-ledger-passphrase';
const draft: TransactionDraft = {
  type: 'expense', amountMinor: '1234', date: '2026-09-05',
  splits: [{ category: 'Private groceries category', amountMinor: '1234' }],
  merchant: 'Private merchant sentinel', notes: 'Private ledger note sentinel',
};

function configuration(password = PASSWORD): ConfigureConfigSyncInput {
  return {
    connection: { endpoint: 'https://objects.example.test', region: 'us-east-1', bucket: 'ledger-tests', prefix: 'household/', forcePathStyle: true },
    credentials: { accessKeyId: 'TEST_ACCESS_SENTINEL', secretAccessKey: 'TEST_SECRET_SENTINEL', passphrase: password },
    rememberSecrets: false,
  };
}

function initialDocument(): LedgerDocument {
  return seedLedgerDocument({
    id: 'private-workspace-sentinel', name: 'Private household sentinel', currency: 'CNY', precision: 2,
    createdAt: '2026-09-01T00:00:00.000Z',
  }, [createTransaction('record', draft, 2, '2026-09-05T01:00:00.000Z')], { '2026-09': '50000' });
}

class LocalGraph implements LedgerDataPort {
  reads = 0;
  merges = 0;
  constructor(public document: LedgerDocument | null) {}
  getLedgerDocument(): LedgerDocument | null {
    this.reads++;
    return this.document === null ? null : decodeLedgerDocument(this.document);
  }
  mergeLedgerDocument(document: LedgerDocument): LedgerDocument {
    this.merges++;
    this.document = this.document === null ? decodeLedgerDocument(document) : mergeLedgerDocuments(this.document, document);
    return decodeLedgerDocument(this.document);
  }
  add(id: string): void {
    assert.ok(this.document);
    this.document = appendLedgerRevision(this.document, {
      id: `create-${id}`, kind: 'transaction', entityId: id,
      value: createTransaction(id, draft, 2, '2026-09-05T02:00:00.000Z'),
    });
  }
}

class CasRemote implements LedgerObjectStore {
  object: { body: string; etag: string } | null = null;
  gets: string[] = [];
  puts: { key: string; body: string; etag: string | null }[] = [];
  closes = 0;
  forceConflict = false;
  getError: LedgerObjectError | null = null;
  beforeGet: ((signal: AbortSignal) => void | Promise<void>) | undefined;
  beforePut: ((signal: AbortSignal) => void | Promise<void>) | undefined;
  private version = 0;

  replace(body: string): void { this.object = { body, etag: `"version-${++this.version}"` }; }
  async get(key: string, signal: AbortSignal): Promise<{ body: string; etag: string } | null> {
    this.gets.push(key);
    await this.beforeGet?.(signal);
    if (this.getError !== null) throw this.getError;
    return this.object === null ? null : { ...this.object };
  }
  async put(key: string, body: string, etag: string | null, signal: AbortSignal): Promise<void> {
    this.puts.push({ key, body, etag });
    await this.beforePut?.(signal);
    if (signal.aborted) throw new LedgerObjectError('network');
    if (this.forceConflict || (this.object?.etag ?? null) !== etag) throw new LedgerObjectError('conflict');
    this.replace(body);
  }
  close(): void { this.closes++; }
}

function gate() {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release: () => { assert.ok(release); release(); } };
}

async function connected(local: LocalGraph, remote: CasRemote, password = PASSWORD): Promise<LedgerSyncSession> {
  const session = new LedgerSyncSession(local, () => remote);
  await session.configure(configuration(password));
  return session;
}

test('disabled sessions perform zero local or remote IO and expose no credentials', async () => {
  const local = new LocalGraph(initialDocument());
  let factories = 0;
  const session = new LedgerSyncSession(local, () => { factories++; return new CasRemote(); });
  assert.deepEqual(await session.syncNow(), { enabled: false, configured: false, code: 'disabled', lastSyncedAt: null });
  assert.equal(local.reads, 0);
  assert.equal(local.merges, 0);
  assert.equal(factories, 0);
  const status = session.getStatus();
  status.code = 'failed';
  assert.equal(session.getStatus().code, 'disabled');
});

test('upload uses real authenticated encryption, scoped object key, and idempotent retries', async () => {
  const document = initialDocument();
  const local = new LocalGraph(document);
  const remote = new CasRemote();
  const session = await connected(local, remote);
  const configured = JSON.stringify(session.getStatus());
  assert.equal(configured.includes(PASSWORD), false);
  const result = await session.syncNow();
  assert.equal(result.code, 'synced');
  assert.ok(result.lastSyncedAt);
  assert.equal(remote.puts.length, 1);
  assert.equal(remote.puts[0]?.etag, null);
  assert.equal(remote.puts[0]?.key, 'household/ledger-v1.enc.json');
  assert.ok(remote.object);
  for (const sentinel of [document.workspace.id, document.workspace.name, draft.merchant, draft.notes, PASSWORD, 'TEST_ACCESS_SENTINEL', 'TEST_SECRET_SENTINEL', 'amountMinor']) {
    assert.ok(sentinel);
    assert.equal(remote.object.body.includes(sentinel), false);
  }
  assert.deepEqual(await decryptLedgerDocument(remote.object.body, PASSWORD), document);
  const originalObject = { ...remote.object };
  assert.equal((await session.syncNow()).code, 'synced');
  assert.equal(remote.puts.length, 1);
  assert.deepEqual(remote.object, originalObject);
  session.clear();
  assert.equal(remote.closes, 1);
});

test('an empty client restores a complete encrypted remote graph without uploading again', async () => {
  const document = initialDocument();
  const remote = new CasRemote();
  remote.replace(await encryptLedgerDocument(document, PASSWORD));
  const local = new LocalGraph(null);
  const session = await connected(local, remote);
  assert.equal((await session.syncNow()).code, 'synced');
  assert.deepEqual(local.document, document);
  assert.equal(local.merges, 1);
  assert.equal(remote.puts.length, 0);
});

test('two clients preserve offline edit/delete divergence, expose conflict, resolve, and converge', async () => {
  const base = initialDocument();
  const first = new LocalGraph(base);
  const second = new LocalGraph(null);
  const remote = new CasRemote();
  const firstSession = await connected(first, remote);
  const secondSession = await connected(second, remote);
  await firstSession.syncNow();
  await secondSession.syncNow();
  const original = projectLedgerDocument(base).transactions[0];
  assert.ok(original);
  first.document = appendLedgerRevision(base, {
    id: 'first-edit', kind: 'transaction', entityId: original.id,
    value: reviseTransaction(original, { ...draft, notes: 'Edited offline' }, 2, '2026-09-05T02:00:00.000Z'),
  });
  second.document = appendLedgerRevision(base, {
    id: 'second-delete', kind: 'transaction', entityId: original.id,
    value: tombstoneTransaction(original, '2026-09-05T02:00:00.000Z'),
  });
  await firstSession.syncNow();
  await secondSession.syncNow();
  await firstSession.syncNow();
  assert.deepEqual(first.document, second.document);
  assert.ok(first.document);
  const projection = projectLedgerDocument(first.document);
  assert.equal(projection.transactions.length, 0);
  const conflict = projection.conflicts[0];
  assert.ok(conflict?.kind === 'transaction');
  first.document = resolveLedgerChoice(first.document, {
    kind: 'transaction', entityId: original.id, selectedHeadId: 'second-delete',
    expectedHeadIds: conflict.heads.map((head) => head.id),
  }, 'explicit-resolution', '2026-09-05T03:00:00.000Z');
  await firstSession.syncNow();
  await secondSession.syncNow();
  assert.deepEqual(first.document, second.document);
  const resolved = projectLedgerDocument(first.document);
  assert.equal(resolved.conflicts.length, 0);
  assert.ok(resolved.transactions[0]?.deletedAt);
  assert.ok(remote.object);
  assert.deepEqual(await decryptLedgerDocument(remote.object.body, PASSWORD), first.document);
});

test('a CAS 412 conflict forces redownload and remerge before retrying with the new ETag', async () => {
  const base = initialDocument();
  const local = new LocalGraph(base);
  local.add('local-add');
  const competing = new LocalGraph(base);
  competing.add('remote-add');
  assert.ok(competing.document);
  const competingBody = await encryptLedgerDocument(competing.document, PASSWORD);
  const remote = new CasRemote();
  remote.beforePut = () => {
    remote.beforePut = undefined;
    remote.replace(competingBody);
  };
  const session = await connected(local, remote);
  assert.equal((await session.syncNow()).code, 'synced');
  assert.equal(remote.gets.length, 2);
  assert.deepEqual(remote.puts.map((put) => put.etag), [null, '"version-1"']);
  assert.ok(remote.object);
  const restored = await decryptLedgerDocument(remote.object.body, PASSWORD);
  assert.deepEqual(projectLedgerDocument(restored).transactions.map((value) => value.id).sort(), ['local-add', 'record', 'remote-add']);
  assert.deepEqual(restored, local.document);
});

test('an edit committed while an encrypted upload is pending is uploaded before reporting synced', async () => {
  const local = new LocalGraph(initialDocument());
  const remote = new CasRemote();
  const enteredPut = gate();
  const releasePut = gate();
  remote.beforePut = async () => {
    remote.beforePut = undefined;
    enteredPut.release();
    await releasePut.promise;
  };
  const session = await connected(local, remote);
  const pending = session.syncNow();
  await enteredPut.promise;
  assert.equal(session.getStatus().code, 'syncing');
  assert.equal(session.getStatus().lastSyncedAt, null);
  local.add('created-during-upload');
  releasePut.release();
  assert.equal((await pending).code, 'synced');
  assert.equal(remote.puts.length, 2);
  const firstBody = remote.puts[0]?.body;
  assert.ok(firstBody);
  assert.equal(projectLedgerDocument(await decryptLedgerDocument(firstBody, PASSWORD)).transactions.length, 1);
  assert.ok(remote.object);
  const final = await decryptLedgerDocument(remote.object.body, PASSWORD);
  assert.equal(projectLedgerDocument(final).transactions.length, 2);
  assert.deepEqual(final, local.document);
});

test('an edit during key derivation is detected after the real encryption operation and synchronized', async (t) => {
  const local = new LocalGraph(initialDocument());
  const remote = new CasRemote();
  const enteredDerivation = gate();
  const releaseDerivation = gate();
  const original = globalThis.crypto.subtle.deriveKey;
  let first = true;
  const derive = t.mock.method(globalThis.crypto.subtle, 'deriveKey', async function (
    this: SubtleCrypto, ...args: Parameters<SubtleCrypto['deriveKey']>
  ): Promise<CryptoKey> {
    if (first) {
      first = false;
      enteredDerivation.release();
      await releaseDerivation.promise;
    }
    return original.apply(this, args);
  });
  const session = await connected(local, remote);
  const pending = session.syncNow();
  await enteredDerivation.promise;
  local.add('created-during-encryption');
  assert.equal(session.getStatus().code, 'syncing');
  releaseDerivation.release();
  assert.equal((await pending).code, 'synced');
  derive.mock.restore();
  assert.equal(remote.puts.length, 2);
  assert.ok(remote.object);
  const restored = await decryptLedgerDocument(remote.object.body, PASSWORD);
  assert.equal(projectLedgerDocument(restored).transactions.length, 2);
  assert.deepEqual(restored, local.document);
});

test('wrong password and authenticated ciphertext tampering preserve local and remote state', async () => {
  const document = initialDocument();
  const encrypted = await encryptLedgerDocument(document, PASSWORD);
  const tampered = encrypted.replace(/("ciphertext":")([A-Za-z0-9+/])/, (_whole, prefix: string, character: string) => `${prefix}${character === 'A' ? 'B' : 'A'}`);
  assert.notEqual(tampered, encrypted);
  for (const [body, password] of [[encrypted, 'a-different-long-passphrase'], [tampered, PASSWORD]]) {
    assert.ok(body && password);
    const local = new LocalGraph(document);
    local.add('local-only');
    const before = JSON.stringify(local.document);
    const remote = new CasRemote();
    remote.replace(body);
    const object = { ...remote.object };
    const session = await connected(local, remote, password);
    await assert.rejects(session.syncNow(), /ledger-wrong-password-or-tampered/);
    assert.equal(JSON.stringify(local.document), before);
    assert.equal(local.merges, 0);
    assert.equal(remote.puts.length, 0);
    assert.deepEqual(remote.object, object);
    assert.equal(session.getStatus().code, 'failed');
  }
});

test('a remote permission/403 error is never treated as a missing object or overwrite opportunity', async () => {
  const local = new LocalGraph(initialDocument());
  const remote = new CasRemote();
  remote.getError = new LedgerObjectError('permission');
  const session = await connected(local, remote);
  await assert.rejects(session.syncNow(), /ledger-remote-permission/);
  assert.equal(remote.puts.length, 0);
  assert.equal(local.reads, 0);
  assert.equal(local.merges, 0);
  assert.equal(session.getStatus().code, 'failed');
});

test('repeated CAS conflicts stop after four attempts as pending and allow a later retry', async () => {
  const local = new LocalGraph(initialDocument());
  const before = JSON.stringify(local.document);
  const remote = new CasRemote();
  remote.forceConflict = true;
  const session = await connected(local, remote);
  const result = await session.syncNow();
  assert.equal(result.code, 'pending');
  assert.equal(result.lastSyncedAt, null);
  assert.equal(remote.gets.length, 4);
  assert.equal(remote.puts.length, 4);
  assert.equal(remote.object, null);
  assert.equal(JSON.stringify(local.document), before);
  remote.forceConflict = false;
  assert.equal((await session.syncNow()).code, 'synced');
});

test('clear aborts an in-flight fetch and ignores a late remote response without touching local state', async () => {
  const local = new LocalGraph(null);
  const remote = new CasRemote();
  remote.replace(await encryptLedgerDocument(initialDocument(), PASSWORD));
  const enteredGet = gate();
  const releaseGet = gate();
  let signal: AbortSignal | undefined;
  remote.beforeGet = async (requestSignal) => {
    signal = requestSignal;
    enteredGet.release();
    await releaseGet.promise;
  };
  const session = await connected(local, remote);
  const pending = session.syncNow();
  const rejection = assert.rejects(pending, /ledger-sync-cancelled/);
  await enteredGet.promise;
  await assert.rejects(session.syncNow(), /ledger-sync-busy/);
  assert.equal(session.clear().code, 'disabled');
  assert.equal(signal?.aborted, true);
  assert.equal(remote.closes, 1);
  releaseGet.release();
  await rejection;
  assert.equal(local.document, null);
  assert.equal(local.reads, 0);
  assert.equal(local.merges, 0);
  assert.equal(remote.puts.length, 0);
  assert.equal(session.getStatus().code, 'disabled');
});

test('clear cancels a queued local merge before it commits and leaves the next session usable', async () => {
  const local = new LocalGraph(null);
  const enteredMerge = gate();
  const releaseMerge = gate();
  const port: LedgerDataPort = {
    getLedgerDocument: () => local.getLedgerDocument(),
    async mergeLedgerDocument(document, signal) {
      assert.ok(signal);
      enteredMerge.release();
      await releaseMerge.promise;
      if (signal.aborted) throw new LedgerSessionError('ledger-sync-cancelled');
      return local.mergeLedgerDocument(document);
    },
  };
  const remote = new CasRemote();
  remote.replace(await encryptLedgerDocument(initialDocument(), PASSWORD));
  const session = new LedgerSyncSession(port, () => remote);
  await session.configure(configuration());
  const pending = session.syncNow();
  const rejection = assert.rejects(pending, /ledger-sync-cancelled/);
  await enteredMerge.promise;
  session.clear();
  releaseMerge.release();
  await rejection;
  assert.equal(local.document, null);
  assert.equal(local.merges, 0);
  assert.equal(remote.puts.length, 0);
  assert.equal(session.getStatus().code, 'disabled');
  await session.configure(configuration());
  assert.equal((await session.syncNow()).code, 'synced');
  assert.deepEqual(local.document, initialDocument());
  session.clear();
});
