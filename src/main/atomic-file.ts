import { constants } from 'node:fs';
import { access, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Write beside the destination, flush the file, then atomically replace it. */
export async function atomicWritePrivateFile(filePath: string, payload: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(payload, { encoding: 'utf8' });
    await handle.sync();
    await handle.close();
    handle = null;
    signal?.throwIfAborted();
    await rename(temporaryPath, filePath);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch {
    // Some platforms do not allow directory handles; the file fsync + rename remains valid.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
