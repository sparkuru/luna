import type { Page } from "@playwright/test";
import { decryptLedgerDocument } from "../../../src/shared/ledger-crypto";
import type { LedgerDocument } from "../../../src/shared/ledger-sync";

/** Read a graph only through the public encrypted-backup boundary in tests. */
export async function readLedgerDocument(
  page: Page,
  password: string,
): Promise<LedgerDocument | null> {
  let raw: string;
  try {
    raw = await page.evaluate(
      (passphrase) => window.lunaLedger.exportLedgerBackup(passphrase),
      password,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("ledger-empty"))
      return null;
    throw error;
  }
  return decryptLedgerDocument(raw, password);
}
