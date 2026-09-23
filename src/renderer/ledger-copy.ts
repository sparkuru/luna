import type { MessageKey } from "./i18n";

export const LEDGER_COPY_KEYS = [
  "ledgerIntro",
  "ledgerPromptNotice",
  "ledgerPromptSmallStep",
  "ledgerPromptStart",
] as const satisfies readonly MessageKey[];

export type LedgerCopyKey = (typeof LEDGER_COPY_KEYS)[number];
export type RandomSource = () => number;

export function chooseLedgerCopyKey(
  random: RandomSource = Math.random,
): LedgerCopyKey {
  const sample = random();
  const bounded = Number.isFinite(sample)
    ? Math.min(Math.max(sample, 0), 1 - Number.EPSILON)
    : 0;
  const index = Math.floor(bounded * LEDGER_COPY_KEYS.length);
  return LEDGER_COPY_KEYS[index] ?? LEDGER_COPY_KEYS[0];
}
