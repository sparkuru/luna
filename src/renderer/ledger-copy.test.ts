import assert from "node:assert/strict";
import test from "node:test";
import { en, zhCN } from "./i18n";
import { chooseLedgerCopyKey, LEDGER_COPY_KEYS } from "./ledger-copy";

test("ledger copy selection covers every word-bank entry", () => {
  assert.ok(LEDGER_COPY_KEYS.length > 1);
  for (let index = 0; index < LEDGER_COPY_KEYS.length; index += 1) {
    const sample = (index + 0.5) / LEDGER_COPY_KEYS.length;
    assert.equal(chooseLedgerCopyKey(() => sample), LEDGER_COPY_KEYS[index]);
  }
});

test("ledger copy selection clamps injected random values safely", () => {
  const first = LEDGER_COPY_KEYS[0];
  const last = LEDGER_COPY_KEYS[LEDGER_COPY_KEYS.length - 1];
  assert.equal(chooseLedgerCopyKey(() => -1), first);
  assert.equal(chooseLedgerCopyKey(() => Number.NaN), first);
  assert.equal(chooseLedgerCopyKey(() => 1), last);
  assert.equal(chooseLedgerCopyKey(() => Number.POSITIVE_INFINITY), first);
});

test("the default copy uses the next-entry wording in both locales", () => {
  assert.equal(zhCN.ledgerIntro, "先看发生了什么，再记下一笔。");
  assert.match(en.ledgerIntro, /record the next entry/);
});
