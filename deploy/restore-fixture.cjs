// Synthetic fixture executed only by smoke-server-restore.mjs, never shipped in the API image.
const { readFileSync } = require('node:fs');
const { encryptLedgerDocument, decryptLedgerDocument } = require('/app/dist/server/shared/ledger-crypto.js');
const { seedLedgerDocument, mergeLedgerDocuments } = require('/app/dist/server/shared/ledger-sync.js');
const { createTransaction } = require('/app/dist/server/shared/domain.js');
const password = 'restore-fixture-ledger-passphrase';

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
  const workspace = {
    id: 'restore-fixture-workspace', name: 'Restore fixture', currency: 'CNY',
    precision: 2, createdAt: '2026-09-08T00:00:00.000Z',
  };
  const records = (input.records ?? ['first']).map((id) => createTransaction(id, {
    type: 'expense', amountMinor: '1250', date: '2026-09-08',
    splits: [{ category: 'Fixture', amountMinor: '1250' }], notes: `Synthetic ${id}`,
  }, 2, '2026-09-08T00:00:00.000Z'));
  return encryptLedgerDocument(seedLedgerDocument(workspace, records, { '2026-09': '20000' }), password);
}
main().then((result) => console.log(JSON.stringify(result))).catch(() => {
  console.error('RESTORE_FIXTURE_FAILED'); process.exitCode = 1;
});
