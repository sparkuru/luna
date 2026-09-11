import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect, type AndroidDevice, type Page } from '@playwright/test';
import { decryptLedgerDocument } from '../src/shared/ledger-crypto';

/** Driverless SAF interaction, restricted by the caller to its disposable AVD. */
export async function verifyAndroidBackup(device: AndroidDevice, page: Page): Promise<void> {
  const dumpPath = `/data/local/tmp/luna-backup-${randomUUID()}.xml`;
  let savedPath: string | undefined;
  const phrase = 'synthetic Android backup phrase';
  const picker = 'com.google.android.documentsui';
  async function nodeWhere(predicate: (node: string) => boolean): Promise<string> {
    let match: string | undefined;
    await expect.poll(async () => {
      await device.shell(`uiautomator dump ${dumpPath}`);
      const xml = (await device.shell(`cat ${dumpPath}`)).toString();
      match = xml.match(/<node\b[^>]*>/g)?.find(predicate);
      return match !== undefined;
    }, { timeout: 30_000 }).toBe(true);
    assert.ok(match);
    return match;
  }
  async function tap(predicate: (node: string) => boolean): Promise<void> {
    const node = await nodeWhere(predicate);
    const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    assert.ok(bounds);
    const x = Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2);
    const y = Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2);
    await device.shell(`input tap ${x} ${y}`);
  }
  async function openPicker(): Promise<void> {
    await page.locator('#ledger-export-password').fill(phrase);
    await page.locator('#ledger-export-submit').click();
    await nodeWhere((node) => node.includes(`package="${picker}"`) && node.includes('class="android.widget.EditText"'));
    await expect(page.locator('#ledger-export-submit')).toBeDisabled();
  }
  try {
    assert.equal(await page.evaluate(() => typeof window.lunaLedger.saveLedgerBackup), 'function');
    await page.locator('#open-secondary-menu').click();
    await page.locator('#ledger-backup-details summary').click();
    await openPicker();
    // First Back dismisses an optional keyboard; the next exits the picker.
    await device.shell('input keyevent KEYCODE_BACK');
    const foreground = (await device.shell('dumpsys activity activities')).toString();
    if (/mResumedActivity:.*documentsui/.test(foreground)) await device.shell('input keyevent KEYCODE_BACK');
    await expect(page.locator('#ledger-tools-alert')).toContainText(/cancelled/i);
    await expect(page.locator('#ledger-export-password')).toHaveValue('');
    await openPicker();
    await tap((node) => node.includes(`package="${picker}"`) && node.includes('content-desc="Show roots"'));
    await tap((node) => node.includes(`package="${picker}"`) && node.includes('text="Downloads"') && node.includes('resource-id="android:id/title"'));
    const title = await nodeWhere((node) => node.includes('class="android.widget.EditText"') && node.includes('text="luna-ledger-'));
    const filename = /text="(luna-ledger-\d+\.encrypted\.json)"/.exec(title)?.[1];
    assert.ok(filename);
    savedPath = `/sdcard/Download/${filename}`;
    assert.equal((await device.shell(`test -e ${savedPath} && echo exists`)).toString().trim(), '');
    await tap((node) => node.includes(`package="${picker}"`) && node.includes('resource-id="android:id/button1"'));
    await expect(page.locator('#ledger-tools-alert')).toContainText('Encrypted backup saved.');
    await expect(page.locator('#ledger-export-password')).toHaveValue('');
    const raw = (await device.shell(`cat ${savedPath}`)).toString('utf8');
    assert.ok(!raw.includes(phrase) && !raw.includes('Android offline market'));
    assert.deepEqual(await decryptLedgerDocument(raw, phrase), await page.evaluate(() => window.lunaLedger.getLedgerDocument()));
  } finally {
    await device.shell(`rm -f ${dumpPath}`);
    if (savedPath !== undefined) await device.shell(`rm -f ${savedPath}`);
  }
}
