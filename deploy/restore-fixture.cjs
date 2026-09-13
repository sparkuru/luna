// Synthetic fixture executed only by smoke-server-restore.mjs, never shipped in the API image.
const { readFileSync } = require('node:fs');
const { encryptLedgerDocument, decryptLedgerDocument } = require('/app/dist/server/shared/ledger-crypto.js');
const { seedLedgerDocument, seedLedgerDocumentV2, mergeLedgerDocuments } = require('/app/dist/server/shared/ledger-sync.js');
const { createEncryptedAttachment } = require('/app/dist/server/shared/attachment-contract.js');
const { storedTransactionFromTransaction } = require('/app/dist/server/shared/ledger-record.js');
const { createTransaction } = require('/app/dist/server/shared/domain.js');
const password = 'restore-fixture-ledger-passphrase';
const workspace = {
  id: 'restore-fixture-workspace', name: 'Restore fixture', currency: 'CNY',
  precision: 2, createdAt: '2026-09-08T00:00:00.000Z',
};
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
  0, 0, 0, 0,
]);

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input.action === 'account') {
    const { createDatabase, environment } = require('/app/dist/server/server/config.js');
    const { migrate } = require('/app/dist/server/server/db/migration.js');
    const { setAccount } = require('/app/dist/server/server/auth.js');
    const database = createDatabase(environment().databaseFile);
    try {
      await migrate(database);
      await setAccount(database, 'restore_fixture', 'restore-fixture-account-password');
    } finally { database.close(); }
    return { created: true };
  }
  if (input.action === 'decrypt') return decryptLedgerDocument(input.raw, password);
  if (input.action === 'merge') {
    const a = await decryptLedgerDocument(input.a, password);
    const b = await decryptLedgerDocument(input.b, password);
    return encryptLedgerDocument(mergeLedgerDocuments(a, b), password);
  }
  if (input.action === 'encrypt-with-attachment') {
    const encrypted = await createEncryptedAttachment(
      PNG_1X1,
      workspace.id,
      'image/png',
      1,
      1,
    );
    const transaction = createTransaction('restore-with-attachment', {
      type: 'expense', amountMinor: '1250', date: '2026-09-08',
      splits: [{ category: 'Fixture', amountMinor: '1250' }], notes: 'Synthetic attachment',
    }, 2, '2026-09-08T00:00:00.000Z');
    const graph = seedLedgerDocumentV2(
      workspace,
      [storedTransactionFromTransaction(transaction, [encrypted.descriptor])],
      { '2026-09': '20000' },
    );
    return {
      raw: await encryptLedgerDocument(graph, password),
      descriptor: encrypted.descriptor,
      ciphertext: Buffer.from(encrypted.ciphertext).toString('base64'),
    };
  }
  const records = (input.records ?? ['first']).map((id) => createTransaction(id, {
    type: 'expense', amountMinor: '1250', date: '2026-09-08',
    splits: [{ category: 'Fixture', amountMinor: '1250' }], notes: `Synthetic ${id}`,
  }, 2, '2026-09-08T00:00:00.000Z'));
  const graph = input.action === 'encrypt-v2'
    ? seedLedgerDocumentV2(
        workspace,
        records.map((record) => storedTransactionFromTransaction(record)),
        { '2026-09': '20000' },
      )
    : seedLedgerDocument(workspace, records, { '2026-09': '20000' });
  return encryptLedgerDocument(graph, password);
}
main().then((result) => console.log(JSON.stringify(result))).catch(() => {
  console.error('RESTORE_FIXTURE_FAILED'); process.exitCode = 1;
});
