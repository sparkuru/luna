import assert from 'node:assert/strict';
import test from 'node:test';
import {
  en,
  formatDate,
  formatMoney,
  formatMonth,
  syncStatusMessageKey,
  t,
  zhCN,
} from './i18n';

test('English and Simplified Chinese catalogs have identical complete key sets', () => {
  assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(en).sort());
  assert.equal(Object.values(en).every((value) => value.length > 0), true);
  assert.equal(Object.values(zhCN).every((value) => value.length > 0), true);
  assert.equal(t('zh-CN', 'income'), '收入');
  assert.equal(t('en', 'income'), 'Income');
  assert.equal(t('en', syncStatusMessageKey('invalid-remote-config')), en.statusInvalidRemote);
  assert.equal(t('zh-CN', syncStatusMessageKey('wrong-password-or-tampered')), zhCN.statusWrongPassword);
});

test('CNY money uses locale currency conventions without losing integer precision', () => {
  const enMoney = formatMoney('en', '123456', 'CNY', 2);
  const zhMoney = formatMoney('zh-CN', '123456', 'CNY', 2);
  assert.match(enMoney, /1,234\.56/);
  assert.match(zhMoney, /1,234\.56/);
  assert.match(enMoney, /¥/);
  assert.match(zhMoney, /¥/);
  assert.match(formatMoney('en', '9007199254740993', 'CNY', 2), /90,071,992,547,409\.93/);
  assert.match(formatMoney('zh-CN', '-50', 'CNY', 2), /-.*0\.50|.*-0\.50/);
});

test('month and local date formatting follows the selected locale', () => {
  assert.notEqual(formatMonth('en', '2026-08'), formatMonth('zh-CN', '2026-08'));
  assert.notEqual(formatDate('en', '2026-08-30'), formatDate('zh-CN', '2026-08-30'));
});
