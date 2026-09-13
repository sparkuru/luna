import assert from 'node:assert/strict';
import test from 'node:test';
import { ledgerToolsErrorMessage, ledgerToolsMessage, ledgerToolsMessages } from './ledger-tools-i18n';

test('ledger tools catalogs cover identical complete English and Chinese keys', () => {
  assert.deepEqual(Object.keys(ledgerToolsMessages.en).sort(), Object.keys(ledgerToolsMessages['zh-CN']).sort());
  for (const catalog of Object.values(ledgerToolsMessages)) {
    for (const text of Object.values(catalog)) assert.ok(text.trim().length > 0);
  }
  assert.match(ledgerToolsMessage('en', 'confirmImport'), /merge.*preserved.*different workspace/);
  assert.match(ledgerToolsMessage('zh-CN', 'conflictWarning'), /暂不计入汇总/);
});

test('ledger tool errors are localized without leaking exception details', () => {
  for (const code of ['ledger-password-invalid', 'ledger-wrong-password-or-tampered', 'ledger-workspace-mismatch',
    'ledger-stale-heads', 'ledger-invalid-envelope', 'ledger-unsupported-envelope', 'ledger-crypto-unavailable',
    'ledger-insecure-connection', 'ledger-network', 'permission', 'attachment-incomplete',
    'attachment-merge-quota-exceeded']) {
    const error = new Error(`LUNA_ERROR:${code}`);
    const en = ledgerToolsErrorMessage('en', error);
    const zh = ledgerToolsErrorMessage('zh-CN', error);
    assert.ok(en && zh && en !== zh);
    assert.notEqual(en, code);
    assert.equal(en.includes('LUNA_ERROR:'), false);
  }
  assert.equal(ledgerToolsErrorMessage('en', new Error('private endpoint and credential')), undefined);
  assert.equal(ledgerToolsErrorMessage('en', { message: 'private data' }), undefined);
  assert.match(ledgerToolsErrorMessage('en', new Error('Error invoking remote method: Error: LUNA_ERROR:ledger-remote-network')) ?? '', /CORS/);
  assert.match(ledgerToolsErrorMessage('zh-CN', new Error('LUNA_ERROR:ledger-remote-permission')) ?? '', /权限/);
  assert.match(ledgerToolsErrorMessage('en', new Error('LUNA_ERROR:ledger-stale-budget')) ?? '', /draft was not saved/);
  assert.match(ledgerToolsErrorMessage('zh-CN', new Error('LUNA_ERROR:ledger-backup-cancelled')) ?? '', /未生成备份/);
  assert.match(ledgerToolsErrorMessage('en', new Error('LUNA_ERROR:attachment-incomplete')) ?? '', /missing/);
  assert.match(ledgerToolsErrorMessage('zh-CN', new Error('LUNA_ERROR:attachment-merge-quota-exceeded')) ?? '', /超过附件配额/);
});
