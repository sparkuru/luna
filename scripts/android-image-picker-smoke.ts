import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect, type AndroidDevice, type Page } from '@playwright/test';

const appId = 'majo.im.luna';
const pickerPackage = 'com.google.android.documentsui';
const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/** Verify the real Android DocumentsUI-to-encrypted-attachment path on the disposable AVD. */
export async function verifyAndroidImagePicker(
  device: AndroidDevice,
  page: Page,
): Promise<Page> {
  const dumpPath = `/data/local/tmp/luna-image-picker-${randomUUID()}.xml`;
  const filename = `luna-android-picker-${randomUUID()}.png`;
  const imagePath = `/sdcard/Download/${filename}`;
  const mediaPath = `/storage/emulated/0/Download/${filename}`;
  const merchant = 'Android picker image';
  let transactionId: string | undefined;
  let attachmentId: string | undefined;
  let date: string | undefined;

  async function dumpUi(): Promise<string> {
    await device.shell(`uiautomator dump ${dumpPath}`);
    return (await device.shell(`cat ${dumpPath}`)).toString();
  }

  async function nodeWhere(predicate: (node: string) => boolean): Promise<string> {
    let match: string | undefined;
    await expect.poll(async () => {
      match = (await dumpUi()).match(/<node\b[^>]*>/g)?.find(predicate);
      return match !== undefined;
    }, { timeout: 30_000 }).toBe(true);
    assert.ok(match);
    return match;
  }

  async function tapNode(node: string): Promise<void> {
    const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    assert.ok(bounds, `Expected tappable bounds: ${node}`);
    const x = Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2);
    const y = Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2);
    await device.shell(`input tap ${x} ${y}`);
  }

  async function tap(predicate: (node: string) => boolean): Promise<void> {
    await tapNode(await nodeWhere(predicate));
  }

  async function foreground(): Promise<string> {
    return (await device.shell('dumpsys activity activities')).toString()
      .split('\n')
      .filter((line) => line.includes('mResumedActivity') || line.includes('topResumedActivity'))
      .join('\n');
  }

  async function openApp(): Promise<Page> {
    await device.shell(`am start -n ${appId}/.MainActivity`);
    let pid = 0;
    await expect.poll(async () => {
      pid = Number((await device.shell(`pidof ${appId}`)).toString().trim());
      return Number.isInteger(pid) && pid > 0;
    }, { timeout: 30_000 }).toBe(true);
    await expect.poll(
      () => device.webViews().some((view) => view.pkg() === appId && view.pid() === pid),
      { timeout: 60_000 },
    ).toBe(true);
    const webview = device.webViews().find((view) => view.pkg() === appId && view.pid() === pid);
    assert.ok(webview);
    const reopened = await webview.page();
    reopened.setDefaultTimeout(30_000);
    await reopened.waitForURL('https://localhost/**');
    return reopened;
  }

  async function readAttachmentBytes(targetPage: Page): Promise<{
    bytes: number[];
    mime: string;
    width: number;
    height: number;
  }> {
    assert.ok(transactionId && attachmentId);
    return targetPage.evaluate(async ({ id, attachment }) => {
      const result = await window.lunaLedger.readTransactionImage(id, attachment);
      const value = {
        bytes: Array.from(result.bytes),
        mime: result.mime,
        width: result.width,
        height: result.height,
      };
      result.bytes.fill(0);
      return value;
    }, { id: transactionId, attachment: attachmentId });
  }

  try {
    await device.shell(`rm -f ${imagePath}`);
    await device.shell(`printf '%s' '${onePixelPng}' | base64 -d > ${imagePath}`);
    // ADB-created files are not always indexed by the emulator's media provider.
    // Insert only this synthetic fixture so DocumentsUI can discover it.
    await device.shell(`content insert --uri content://media/external/images/media \
      --bind _data:s:${mediaPath} --bind mime_type:s:image/png \
      --bind title:s:${filename} --bind _display_name:s:${filename}`);
    const indexed = await device.shell(
      `content query --uri content://media/external/images/media \
        --projection _id:_data:_display_name:mime_type --where "_data='${mediaPath}'"`,
    );
    assert.match(indexed.toString(), /mime_type=image\/png/);
    assert.match(
      (await device.shell(`stat -c %s ${imagePath}`)).toString().trim(),
      /^[1-9]\d*$/,
    );
    await page.locator('#record-expense').click();
    await expect(page.locator('#transaction-dialog')).toBeVisible();
    await page.locator('#transaction-amount').fill('6.50');
    await page.locator('#transaction-category').fill('Android picker');
    date = await page.locator('#transaction-date').inputValue();
    await page.locator('#transaction-advanced-details summary').click();
    await page.locator('#transaction-merchant').fill(merchant);
    await page.locator('.attachment-picker button').click();
    await nodeWhere((node) => node.includes(`package="${pickerPackage}"`)
      && node.includes('content-desc="Show roots"'));
    await tap((node) => node.includes(`package="${pickerPackage}"`)
      && node.includes('content-desc="Show roots"'));
    await tap((node) => node.includes(`package="${pickerPackage}"`)
      && node.includes('text="Downloads"')
      && node.includes('resource-id="android:id/title"'));
    await tap((node) => node.includes(`package="${pickerPackage}"`)
      && node.includes(`content-desc="${filename},`));

    if (!(await foreground()).includes(appId)) {
      await tap((node) => node.includes(`package="${pickerPackage}"`)
        && (node.includes('text="Open"') || node.includes('resource-id="android:id/button1"')));
    }
    await expect(page.locator('#transaction-dialog')).toBeVisible();
    await expect(page.locator('.attachment-preview')).toHaveCount(1);
    await expect(page.locator('.attachment-preview-meta')).toContainText('1×1');
    await page.locator('#save-transaction').click();
    await expect(page.locator('#transaction-list-region')).toContainText(merchant);

    assert.ok(date);
    const snapshot = await page.evaluate((month) => window.lunaLedger.getSnapshot(month), date.slice(0, 7));
    const transaction = snapshot.transactions.find((item) => item.merchant === merchant);
    assert.ok(transaction);
    transactionId = transaction.id;
    attachmentId = transaction.attachments?.[0]?.id;
    assert.ok(attachmentId);
    const saved = await readAttachmentBytes(page);
    assert.deepEqual(saved.bytes.slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.deepEqual({ mime: saved.mime, width: saved.width, height: saved.height }, {
      mime: 'image/png', width: 1, height: 1,
    });

    await device.shell(`am force-stop ${appId}`);
    const reopened = await openApp();
    await expect(reopened.locator('#transaction-list-region')).toContainText(merchant);
    const restored = await readAttachmentBytes(reopened);
    assert.deepEqual(restored.bytes.slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.deepEqual({ mime: restored.mime, width: restored.width, height: restored.height }, {
      mime: 'image/png', width: 1, height: 1,
    });
    return reopened;
  } finally {
    await device.shell(`rm -f ${dumpPath} ${imagePath}`);
    await device.shell(
      `content delete --uri content://media/external/images/media --where "_data='${mediaPath}'"`,
    ).catch(() => undefined);
  }
}
