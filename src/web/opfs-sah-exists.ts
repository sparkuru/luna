/** Read-only SAH-pool probe for the pinned @sqlite.org/sqlite-wasm 3.53 format.
 * Opening a pool to inspect it can create files or repair headers. Catalog
 * discovery must instead validate the persisted association without mutation.
 */
export async function hasSahDatabase(
  directory: FileSystemDirectoryHandle,
  filename: string,
): Promise<boolean> {
  const opaque = await directory.getDirectoryHandle(".opaque");
  const entries = opaque as FileSystemDirectoryHandle & {
    values(): AsyncIterableIterator<FileSystemHandle>;
  };
  for await (const entry of entries.values()) {
    if (entry.kind !== "file") continue;
    const handle = await opaque.getFileHandle(entry.name);
    const file = await handle.getFile();
    if (file.size < 4112) continue;
    const bytes = new Uint8Array(await file.slice(0, 4112).arrayBuffer());
    if (isSahDatabaseHeader(bytes, filename)) return true;
  }
  return false;
}

export function isSahDatabaseHeader(bytes: Uint8Array, filename: string): boolean {
  if (bytes.length < 4112) return false;
  const path = new TextEncoder().encode(`/${filename}\0`);
  if (path.length > 512 || !path.every((byte, index) => bytes[index] === byte))
    return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = view.getUint32(512);
  // SQLITE_OPEN_MAIN_DB, SQLITE_OPEN_DELETEONCLOSE, SQLITE_OPEN_MEMORY
  // (the last bit selects SQLite's v2 association digest).
  if (!(flags & 0x100) || (flags & 0x8)) return false;
  let h1 = 0;
  let h2 = 0;
  if (flags & 0x80) {
    h1 = 0xdeadbeef;
    h2 = 0x41c6ce57;
    for (const byte of bytes.subarray(0, 516)) {
      h1 = Math.imul(h1 ^ byte, 2654435761);
      h2 = Math.imul(h2 ^ byte, 104729);
    }
  }
  if (view.getUint32(516, true) !== (h1 >>> 0) ||
      view.getUint32(520, true) !== (h2 >>> 0)) return false;
  return new TextDecoder().decode(bytes.subarray(4096, 4112)) === "SQLite format 3\0";
}
