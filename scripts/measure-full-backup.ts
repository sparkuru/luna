import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ATTACHMENT_GCM_TAG_BYTES,
  MAX_CIPHER_ATTACHMENT_BYTES,
  MAX_LEDGER_ATTACHMENT_BYTES,
  MAX_NORMALIZED_IMAGE_BYTES,
  createEncryptedAttachment,
  encryptAttachmentBytes,
  type StoredAttachmentDescriptor,
} from "../src/shared/attachment-contract";
import {
  createFullBackupStream,
  createFullBackupStreamDecoder,
} from "../src/shared/full-backup";
import { createTransaction } from "../src/shared/domain";
import { storedTransactionFromTransaction } from "../src/shared/ledger-record";
import { seedLedgerDocumentV2 } from "../src/shared/ledger-sync";

const PASSWORD = "full-backup-capacity-measurement-passphrase";
const MAX_MEASURED_RSS_DELTA_BYTES = 128 * 1024 * 1024;
const PNG_SIGNATURE = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
] as const;
const MIN_SYNTHETIC_PNG_BYTES = 33;

interface MemorySnapshot {
  rss: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

async function main(): Promise<void> {
  const targetCipherBytes = parseCapacity(
    process.argv.find((value) => value.startsWith("--bytes="))?.slice(8) ??
      "64MiB",
  );
  if (
    targetCipherBytes < MIN_SYNTHETIC_PNG_BYTES + ATTACHMENT_GCM_TAG_BYTES ||
    targetCipherBytes > MAX_LEDGER_ATTACHMENT_BYTES
  )
    throw new Error("--bytes must fit 33-byte synthetic images and the 512MiB attachment limit");

  const sizes = balancedCipherSizes(targetCipherBytes);
  const workspace = {
    id: "backup-capacity-measurement-workspace",
    name: "Backup capacity measurement",
    currency: "CNY",
    precision: 2,
    createdAt: "2026-09-13T00:00:00.000Z",
  };
  const descriptors = new Map<string, StoredAttachmentDescriptor>();
  const seeds = new Map<string, number>();
  const transactions = [];
  const buildStarted = memory();

  for (const [index, cipherByteLength] of sizes.entries()) {
    const seed = index % 251;
    const plaintext = syntheticImage(cipherByteLength - ATTACHMENT_GCM_TAG_BYTES, seed);
    const encrypted = await createEncryptedAttachment(
      plaintext,
      workspace.id,
      "image/png",
      1,
      1,
    );
    const descriptor = { ...encrypted.descriptor };
    descriptors.set(descriptor.id, descriptor);
    seeds.set(descriptor.id, seed);
    transactions.push(
      storedTransactionFromTransaction(
        createTransaction(
          `capacity-${index}`,
          {
            type: "expense",
            amountMinor: "1",
            date: `2026-09-${String((index % 28) + 1).padStart(2, "0")}`,
            splits: [{ category: "Synthetic", amountMinor: "1" }],
          },
          workspace.precision,
          "2026-09-13T00:00:00.000Z",
        ),
        [descriptor],
      ),
    );
    encrypted.ciphertext.fill(0);
    plaintext.fill(0);
  }

  const graph = seedLedgerDocumentV2(workspace, transactions, {});
  const afterInventory = memory();
  let peak = maxMemory(buildStarted, afterInventory);
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "luna-backup-measure-"));
  const outputPath = path.join(temporaryRoot, "backup.luna-part");
  let file: Awaited<ReturnType<typeof open>> | null = null;
  let stream: Awaited<ReturnType<typeof createFullBackupStream>> | null = null;
  let written = 0;
  let chunks = 0;
  let maxChunkBytes = 0;
  let importResult: ImportMeasurement | null = null;
  try {
    stream = await createFullBackupStream(graph, PASSWORD, async (id) => {
      const descriptor = descriptors.get(id);
      const seed = seeds.get(id);
      if (descriptor === undefined || seed === undefined) return null;
      const plaintext = syntheticImage(descriptor.byteLength, seed);
      try {
        const ciphertext = await encryptAttachmentBytes(plaintext, descriptor);
        return { descriptor, ciphertext };
      } finally {
        plaintext.fill(0);
      }
    });
    peak = maxMemory(peak, memory());
    file = await open(outputPath, "wx", 0o600);
    for (;;) {
      const chunk = await stream.readChunk();
      maxChunkBytes = Math.max(maxChunkBytes, chunk.bytes.byteLength);
      await writeAll(file, chunk.bytes);
      written += chunk.bytes.byteLength;
      chunks += 1;
      peak = maxMemory(peak, memory());
      if (chunk.eof) break;
    }
    await file.sync();
    await file.close();
    file = null;
    const fileBytes = (await stat(outputPath)).size;
    if (
      written !== stream.totalBytes ||
      fileBytes !== stream.totalBytes
    )
      throw new Error("streamed backup length did not match the declared container length");
    importResult = await measureImport(outputPath, stream.totalBytes);
    peak = maxMemory(peak, importResult.peakMemoryBytes);
    console.log(
      JSON.stringify({
        targetCipherBytes,
        attachmentCount: sizes.length,
        totalContainerBytes: stream.totalBytes,
        writtenBytes: written,
        fileBytes,
        chunks,
        maxChunkBytes,
        peakMemoryBytes: peak,
        finalMemoryBytes: memory(),
        importedAttachmentCount: importResult.attachmentCount,
        importedCipherBytes: importResult.cipherBytes,
        importedBytes: importResult.receivedBytes,
        importChunkBytes: importResult.chunkBytes,
        importPeakMemoryBytes: importResult.peakMemoryBytes,
        baselineMemoryBytes: buildStarted,
        peakRssDeltaBytes: Math.max(0, peak.rss - buildStarted.rss),
        temporaryOutputRemoved: true,
        memoryBounded:
          Math.max(0, peak.rss - buildStarted.rss) <= MAX_MEASURED_RSS_DELTA_BYTES,
        bounded:
          maxChunkBytes <= 1024 * 1024 &&
          importResult.chunkBytes <= 1024 * 1024 &&
          importResult.receivedBytes === stream.totalBytes &&
          Math.max(0, peak.rss - buildStarted.rss) <= MAX_MEASURED_RSS_DELTA_BYTES,
      }),
    );
  } finally {
    if (file !== null) await file.close().catch(() => undefined);
    stream?.dispose();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

interface ImportMeasurement {
  attachmentCount: number;
  cipherBytes: number;
  receivedBytes: number;
  chunkBytes: number;
  peakMemoryBytes: MemorySnapshot;
}

async function measureImport(
  outputPath: string,
  totalBytes: number,
): Promise<ImportMeasurement> {
  let attachmentCount = 0;
  let cipherBytes = 0;
  let committed = false;
  let decoder: ReturnType<typeof createFullBackupStreamDecoder> | null = null;
  let file: Awaited<ReturnType<typeof open>> | null = null;
  let receivedBytes = 0;
  let chunkBytes = 0;
  let peak = memory();
  try {
    decoder = createFullBackupStreamDecoder(
      PASSWORD,
      totalBytes,
      () => ({
        writeAttachment(item) {
          attachmentCount += 1;
          cipherBytes += item.ciphertext.byteLength;
        },
        commit() {
          committed = true;
        },
        abort() {
          // The measurement sink does not retain any ciphertext.
        },
      }),
    );
    file = await open(outputPath, "r");
    const buffer = new Uint8Array(1024 * 1024);
    let offset = 0;
    for (;;) {
      const result = await file.read(buffer, 0, buffer.byteLength, offset);
      if (result.bytesRead === 0) break;
      const chunk = buffer.subarray(0, result.bytesRead);
      chunkBytes = Math.max(chunkBytes, chunk.byteLength);
      await decoder.append(chunk);
      offset += result.bytesRead;
      receivedBytes += result.bytesRead;
      peak = maxMemory(peak, memory());
    }
    await file.close();
    file = null;
    const receipt = await decoder.finish();
    if (
      !committed ||
      receivedBytes !== totalBytes ||
      receipt.totalBytes !== totalBytes ||
      receipt.attachmentCount !== attachmentCount
    )
      throw new Error("streamed backup import did not commit the complete archive");
    return {
      attachmentCount,
      cipherBytes,
      receivedBytes,
      chunkBytes,
      peakMemoryBytes: peak,
    };
  } finally {
    if (file !== null) await file.close().catch(() => undefined);
    await decoder?.abort().catch(() => undefined);
  }
}

function balancedCipherSizes(total: number): number[] {
  const count = Math.ceil(total / MAX_CIPHER_ATTACHMENT_BYTES);
  const base = Math.floor(total / count);
  const remainder = total % count;
  if (base <= ATTACHMENT_GCM_TAG_BYTES)
    throw new Error("--bytes produces a ciphertext smaller than the GCM tag");
  return Array.from(
    { length: count },
    (_unused, index) => base + (index < remainder ? 1 : 0),
  );
}

function syntheticImage(length: number, seed: number): Uint8Array<ArrayBuffer> {
  if (length < MIN_SYNTHETIC_PNG_BYTES || length > MAX_NORMALIZED_IMAGE_BYTES)
    throw new Error("synthetic image size is outside the normalized image limit");
  const bytes = new Uint8Array(length);
  bytes.fill(seed);
  bytes.set(PNG_SIGNATURE, 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(16, 1, false);
  view.setUint32(20, 1, false);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

function parseCapacity(value: string): number {
  const match = /^(\d+)(B|KiB|MiB|GiB)$/.exec(value);
  if (!match) throw new Error("--bytes must use B, KiB, MiB, or GiB");
  const amount = Number(match[1]);
  const multiplier = match[2] === "B" ? 1 : match[2] === "KiB" ? 1024 : match[2] === "MiB" ? 1024 ** 2 : 1024 ** 3;
  const bytes = amount * multiplier;
  if (!Number.isSafeInteger(bytes)) throw new Error("--bytes is too large");
  return bytes;
}

async function writeAll(
  file: Awaited<ReturnType<typeof open>>,
  bytes: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await file.write(bytes, offset, bytes.byteLength - offset);
    if (result.bytesWritten < 1) throw new Error("backup-file-write-incomplete");
    offset += result.bytesWritten;
  }
}

function memory(): MemorySnapshot {
  const snapshot = process.memoryUsage();
  return {
    rss: snapshot.rss,
    heapUsed: snapshot.heapUsed,
    external: snapshot.external,
    arrayBuffers: snapshot.arrayBuffers,
  };
}

function maxMemory(left: MemorySnapshot, right: MemorySnapshot): MemorySnapshot;
function maxMemory(left: MemorySnapshot, right: MemorySnapshot, third: MemorySnapshot): MemorySnapshot;
function maxMemory(
  left: MemorySnapshot,
  right: MemorySnapshot,
  third?: MemorySnapshot,
): MemorySnapshot {
  const snapshots = third === undefined ? [left, right] : [left, right, third];
  return {
    rss: Math.max(...snapshots.map((snapshot) => snapshot.rss)),
    heapUsed: Math.max(...snapshots.map((snapshot) => snapshot.heapUsed)),
    external: Math.max(...snapshots.map((snapshot) => snapshot.external)),
    arrayBuffers: Math.max(...snapshots.map((snapshot) => snapshot.arrayBuffers)),
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "backup capacity measurement failed");
  process.exitCode = 1;
});
