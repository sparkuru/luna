import { sha256 } from "@noble/hashes/sha2.js";
import {
  AttachmentContractError,
  MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES,
  decryptAttachmentBytes,
  MAX_BACKUP_FILE_BYTES,
  MAX_BACKUP_MANIFEST_BYTES,
  MAX_CIPHER_ATTACHMENT_BYTES,
  MAX_LEDGER_ATTACHMENT_BYTES,
  MAX_LEDGER_ATTACHMENT_COUNT,
  sha256Hex,
  validateAttachmentDescriptor,
  type StoredAttachmentDescriptor,
} from "./attachment-contract";
import {
  decodeLedgerDocument,
  upgradeLedgerDocument,
  type LedgerDocument,
} from "./ledger-sync";
import { isStoredTransaction } from "./ledger-record";
import { LedgerCryptoError, validateLedgerPassword } from "./ledger-crypto";

/**
 * The complete backup container is intentionally separate from the small
 * encrypted ledger envelope. It carries the normalized graph and the
 * immutable ciphertexts needed to restore every historical reference.
 */
export const FULL_BACKUP_MAGIC = "LUNABK02" as const;
export const FULL_BACKUP_FOOTER_MAGIC = "LUNAEND2" as const;
export const FULL_BACKUP_FORMAT = "luna-full-backup-manifest" as const;
export const FULL_BACKUP_VERSION = 2 as const;
export const FULL_BACKUP_HEADER_BYTES = 56;
export const FULL_BACKUP_FOOTER_BYTES = 40;
export const FULL_BACKUP_FRAME_HEADER_BYTES = 40;
const FULL_BACKUP_PBKDF2_ITERATIONS = 600_000;
const AES_GCM_TAG_BYTES = 16;
const encoder = new TextEncoder();

export type FullBackupErrorCode =
  | "backup-invalid-container"
  | "backup-unsupported-container"
  | "backup-too-large"
  | "backup-password-invalid"
  | "backup-wrong-password-or-tampered"
  | "backup-crypto-unavailable"
  | "backup-attachment-missing"
  | "backup-attachment-extra"
  | "backup-attachment-mismatch"
  | "backup-workspace-mismatch";

export class FullBackupError extends Error {
  constructor(readonly code: FullBackupErrorCode) {
    super(`LUNA_ERROR:${code}`);
    this.name = "FullBackupError";
  }
}

export interface FullBackupAttachment {
  descriptor: StoredAttachmentDescriptor;
  ciphertext: Uint8Array;
}

export interface FullBackupArchive {
  graph: LedgerDocument;
  attachments: FullBackupAttachment[];
}

export interface FullBackupStreamChunk {
  bytes: Uint8Array<ArrayBuffer>;
  eof: boolean;
}

export interface FullBackupStream {
  readonly totalBytes: number;
  readChunk(maxBytes?: number): Promise<FullBackupStreamChunk>;
  dispose(): void;
}

/**
 * Consumer used by the host-side streaming importer. Implementations should
 * persist each ciphertext before returning and only publish the graph from
 * commit(), so a malformed or cancelled file never becomes a live ledger.
 */
export interface FullBackupRestoreSink {
  writeAttachment(item: FullBackupAttachment): Promise<void> | void;
  commit(graph: LedgerDocument): Promise<void> | void;
  abort(): Promise<void> | void;
}

export interface FullBackupStreamImportReceipt {
  graph: LedgerDocument;
  attachmentCount: number;
  totalBytes: number;
}

export interface FullBackupStreamDecoder {
  append(bytes: Uint8Array): Promise<void>;
  finish(): Promise<FullBackupStreamImportReceipt>;
  abort(): Promise<void>;
}

interface FullBackupManifest {
  format: typeof FULL_BACKUP_FORMAT;
  version: typeof FULL_BACKUP_VERSION;
  graph: LedgerDocument;
  attachments: Array<{
    id: string;
    cipherByteLength: number;
    cipherSha256: string;
  }>;
  totalCipherBytes: number;
}

/**
 * Prepare a complete v2 backup as a bounded stream. The graph and encrypted
 * manifest stay resident, while at most one validated ciphertext is loaded
 * while producing frames.
 */
export async function createFullBackupStream(
  document: LedgerDocument,
  password: string,
  readAttachmentCiphertext: (
    attachmentId: string,
  ) => Promise<FullBackupAttachment | null>,
): Promise<FullBackupStream> {
  const graph = normalizeGraph(document);
  const inventory = validateGraphInventory(graph);
  const descriptors = [...inventory.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );

  // Validate the frozen inventory before exposing a job. This makes a missing
  // or corrupt local object fail before a host can report a seemingly valid
  // backup file.
  for (const descriptor of descriptors) {
    const item = await readAttachmentCiphertext(descriptor.id);
    await validateAttachmentForBackup(descriptor, item);
  }

  const totalCipherBytes = sumDescriptorCipherBytes(descriptors);
  const manifest: FullBackupManifest = {
    format: FULL_BACKUP_FORMAT,
    version: FULL_BACKUP_VERSION,
    graph,
    attachments: descriptors.map((descriptor) => ({
      id: descriptor.id,
      cipherByteLength: descriptor.cipherByteLength,
      cipherSha256: descriptor.cipherSha256,
    })),
    totalCipherBytes,
  };
  const manifestPlaintext = encoder.encode(JSON.stringify(manifest));
  if (manifestPlaintext.byteLength > MAX_BACKUP_MANIFEST_BYTES)
    fail("backup-too-large");

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const encryptedManifestLength = manifestPlaintext.byteLength + AES_GCM_TAG_BYTES;
  const frameBytes = descriptors.reduce(
    (total, descriptor) =>
      total + FULL_BACKUP_FRAME_HEADER_BYTES + descriptor.cipherByteLength,
    0,
  );
  const totalContainerLength =
    FULL_BACKUP_HEADER_BYTES + encryptedManifestLength + frameBytes + FULL_BACKUP_FOOTER_BYTES;
  if (totalContainerLength > MAX_BACKUP_FILE_BYTES) fail("backup-too-large");
  const header = encodeHeader(
    encryptedManifestLength,
    descriptors.length,
    totalContainerLength,
    salt,
    iv,
  );

  let encryptedManifest: Uint8Array<ArrayBuffer> | undefined;
  const passwordBytes = decodePassword(password);
  try {
    encryptedManifest = await encryptManifest(
      manifestPlaintext,
      header,
      salt,
      iv,
      passwordBytes,
    );
  } finally {
    passwordBytes.fill(0);
    salt.fill(0);
    iv.fill(0);
    manifestPlaintext.fill(0);
  }
  if (encryptedManifest === undefined) fail("backup-crypto-unavailable");

  return new FullBackupStreamImpl(
    header,
    encryptedManifest,
    descriptors,
    totalContainerLength,
    readAttachmentCiphertext,
  );
}

/**
 * Encode one complete v2 backup. This compatibility helper deliberately
 * collects the stream; host sessions should use createFullBackupStream().
 */
export async function encodeFullBackup(
  document: LedgerDocument,
  attachments: readonly FullBackupAttachment[],
  password: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const graph = normalizeGraph(document);
  const inventory = validateGraphInventory(graph);
  const byId = new Map(attachments.map((item) => [item.descriptor.id, item]));
  if (byId.size !== attachments.length) fail("backup-attachment-mismatch");
  for (const item of attachments) {
    const expected = inventory.get(item.descriptor.id);
    if (expected === undefined) fail("backup-attachment-extra");
    if (byId.get(item.descriptor.id) !== item)
      fail("backup-attachment-mismatch");
    await validateAttachmentForBackup(expected, item);
  }
  const stream = await createFullBackupStream(graph, password, async (id) =>
    byId.get(id) ?? null,
  );
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await stream.readChunk();
      chunks.push(chunk.bytes);
      length += chunk.bytes.byteLength;
      if (chunk.eof) break;
    }
    const output = concatChunks(chunks, length);
    return output;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    stream.dispose();
  }
}

class FullBackupStreamImpl implements FullBackupStream {
  readonly totalBytes: number;
  private readonly hash = sha256.create();
  private phase: "prefix" | "frames" | "footer" | "done" = "prefix";
  private prefixStage: "header" | "manifest" = "header";
  private segment: Uint8Array | null;
  private segmentOffset = 0;
  private segmentKind: "header" | "manifest" | "frame-header" | "frame-body" | "footer";
  private frameIndex = 0;
  private currentCiphertext: Uint8Array<ArrayBuffer> | null = null;
  private disposed = false;

  constructor(
    private readonly header: Uint8Array<ArrayBuffer>,
    private encryptedManifest: Uint8Array<ArrayBuffer>,
    private readonly descriptors: readonly StoredAttachmentDescriptor[],
    totalBytes: number,
    private readonly readAttachmentCiphertext: (
      attachmentId: string,
    ) => Promise<FullBackupAttachment | null>,
  ) {
    this.totalBytes = totalBytes;
    this.segment = header;
    this.segmentKind = "header";
  }

  async readChunk(maxBytes = MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES): Promise<FullBackupStreamChunk> {
    if (this.disposed) fail("backup-invalid-container");
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES)
      fail("backup-too-large");
    if (this.isDone()) return { bytes: new Uint8Array(0), eof: true };

    const output = new Uint8Array(maxBytes);
    let written = 0;
    while (written < maxBytes) {
      if (this.isDone()) break;
      if (this.segment === null) await this.prepareNextSegment();
      if (this.segment === null) continue;
      const available = this.segment.byteLength - this.segmentOffset;
      const length = Math.min(available, maxBytes - written);
      const part = this.segment.subarray(this.segmentOffset, this.segmentOffset + length);
      output.set(part, written);
      if (this.segmentKind !== "footer") this.hash.update(part);
      written += length;
      this.segmentOffset += length;
      if (this.segmentOffset === this.segment.byteLength) this.completeSegment();
    }
    const eof = this.isDone();
    return { bytes: output.subarray(0, written), eof };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.header.fill(0);
    this.encryptedManifest.fill(0);
    this.currentCiphertext?.fill(0);
    this.currentCiphertext = null;
    this.segment = null;
  }

  private completeSegment(): void {
    switch (this.segmentKind) {
      case "header":
        this.prefixStage = "manifest";
        this.setSegment(this.encryptedManifest, "manifest");
        return;
      case "manifest":
        this.phase = "frames";
        this.segment = null;
        this.segmentOffset = 0;
        return;
      case "frame-header":
        if (this.currentCiphertext === null) fail("backup-invalid-container");
        this.setSegment(this.currentCiphertext, "frame-body");
        return;
      case "frame-body":
        const ciphertext = this.currentCiphertext;
        if (ciphertext === null) fail("backup-invalid-container");
        ciphertext.fill(0);
        this.currentCiphertext = null;
        this.segment = null;
        this.segmentOffset = 0;
        return;
      case "footer":
        this.phase = "done";
        this.segment = null;
        this.segmentOffset = 0;
        return;
    }
  }

  private async prepareNextSegment(): Promise<void> {
    if (this.phase === "prefix") {
      if (this.prefixStage !== "manifest") fail("backup-invalid-container");
      return;
    }
    if (this.phase === "frames") {
      const descriptor = this.descriptors[this.frameIndex];
      if (descriptor !== undefined) {
        const item = await this.readAttachmentCiphertext(descriptor.id);
        await validateAttachmentForBackup(descriptor, item);
        if (item === null) fail("backup-attachment-missing");
        this.currentCiphertext = copyBytes(item.ciphertext);
        this.frameIndex += 1;
        this.setSegment(
          encodeFrameHeader(descriptor.id, this.currentCiphertext.byteLength),
          "frame-header",
        );
        return;
      }
      const footer = new Uint8Array(FULL_BACKUP_FOOTER_BYTES);
      writeAscii(footer, 0, FULL_BACKUP_FOOTER_MAGIC);
      footer.set(this.hash.digest(), 8);
      this.phase = "footer";
      this.setSegment(footer, "footer");
    }
  }

  private setSegment(
    segment: Uint8Array,
    kind: "header" | "manifest" | "frame-header" | "frame-body" | "footer",
  ): void {
    this.segment = segment;
    this.segmentKind = kind;
    this.segmentOffset = 0;
  }

  private isDone(): boolean {
    return this.phase === "done";
  }
}

interface ParsedFullBackupHeader {
  encryptedManifestLength: number;
  attachmentCount: number;
  totalContainerLength: number;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
}

/** Create a bounded parser for a complete backup arriving in arbitrary chunks. */
export function createFullBackupStreamDecoder(
  password: string,
  expectedTotalBytes: number | null,
  beginRestore: (
    graph: LedgerDocument,
  ) => Promise<FullBackupRestoreSink> | FullBackupRestoreSink,
): FullBackupStreamDecoder {
  return new FullBackupStreamDecoderImpl(password, expectedTotalBytes, beginRestore);
}

class FullBackupStreamDecoderImpl implements FullBackupStreamDecoder {
  private readonly header = new Uint8Array(FULL_BACKUP_HEADER_BYTES);
  private readonly footer = new Uint8Array(FULL_BACKUP_FOOTER_BYTES);
  private headerReceived = 0;
  private footerReceived = 0;
  private manifestCiphertext: Uint8Array<ArrayBuffer> | null = null;
  private manifestReceived = 0;
  private parsedHeader: ParsedFullBackupHeader | null = null;
  private manifest: FullBackupManifest | null = null;
  private inventory: Map<string, StoredAttachmentDescriptor> | null = null;
  private frameHeader = new Uint8Array(FULL_BACKUP_FRAME_HEADER_BYTES);
  private frameHeaderReceived = 0;
  private frameCiphertext: Uint8Array<ArrayBuffer> | null = null;
  private frameReceived = 0;
  private frameIndex = 0;
  private currentDescriptor: StoredAttachmentDescriptor | null = null;
  private receivedBytes = 0;
  private state: "header" | "manifest" | "frames" | "footer" | "done" = "header";
  private hash = sha256.create();
  private sink: FullBackupRestoreSink | null = null;
  private committed = false;
  private disposed = false;

  constructor(
    private password: string,
    private readonly expectedTotalBytes: number | null,
    private readonly beginRestore: (
      graph: LedgerDocument,
    ) => Promise<FullBackupRestoreSink> | FullBackupRestoreSink,
  ) {
    if (
      expectedTotalBytes !== null &&
      (!Number.isSafeInteger(expectedTotalBytes) ||
        expectedTotalBytes < FULL_BACKUP_HEADER_BYTES + FULL_BACKUP_FOOTER_BYTES ||
        expectedTotalBytes > MAX_BACKUP_FILE_BYTES)
    )
      fail("backup-too-large");
  }

  async append(bytes: Uint8Array): Promise<void> {
    if (this.disposed || this.state === "done") fail("backup-invalid-container");
    if (bytes.byteLength > MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES)
      fail("backup-too-large");
    const nextTotal = this.receivedBytes + bytes.byteLength;
    if (
      nextTotal > MAX_BACKUP_FILE_BYTES ||
      (this.expectedTotalBytes !== null && nextTotal > this.expectedTotalBytes)
    )
      fail("backup-too-large");
    this.receivedBytes = nextTotal;

    let offset = 0;
    while (offset < bytes.byteLength) {
      if (this.state === "header") {
        offset = this.copyInto(this.header, this.headerReceived, bytes, offset);
        this.headerReceived += this.lastCopied;
        if (this.headerReceived === this.header.byteLength) {
          const headerLength = readBigUint64(this.header, 48);
          if (headerLength > BigInt(Number.MAX_SAFE_INTEGER)) fail("backup-too-large");
          const declaredLength = Number(headerLength);
          if (
            this.expectedTotalBytes !== null &&
            declaredLength !== this.expectedTotalBytes
          )
            fail("backup-invalid-container");
          this.parsedHeader = decodeHeader(this.header, declaredLength);
          this.manifestCiphertext = new Uint8Array(
            this.parsedHeader.encryptedManifestLength,
          );
          this.state = "manifest";
        }
        continue;
      }

      if (this.state === "manifest") {
        if (this.manifestCiphertext === null) fail("backup-invalid-container");
        offset = this.copyInto(
          this.manifestCiphertext,
          this.manifestReceived,
          bytes,
          offset,
        );
        this.manifestReceived += this.lastCopied;
        if (this.manifestReceived === this.manifestCiphertext.byteLength) {
          await this.finishManifest();
        }
        continue;
      }

      if (this.state === "frames") {
        if (this.frameIndex >= (this.parsedHeader?.attachmentCount ?? 0)) {
          this.state = "footer";
          continue;
        }
        if (this.frameHeaderReceived < this.frameHeader.byteLength) {
          offset = this.copyInto(
            this.frameHeader,
            this.frameHeaderReceived,
            bytes,
            offset,
          );
          this.frameHeaderReceived += this.lastCopied;
          if (this.frameHeaderReceived === this.frameHeader.byteLength)
            this.beginFrame();
          continue;
        }
        if (this.frameCiphertext === null) fail("backup-invalid-container");
        offset = this.copyInto(
          this.frameCiphertext,
          this.frameReceived,
          bytes,
          offset,
        );
        const copied = this.lastCopied;
        if (copied > 0) {
          const start = this.frameReceived;
          this.hash.update(this.frameCiphertext.subarray(start, start + copied));
          this.frameReceived += copied;
        }
        if (this.frameReceived === this.frameCiphertext.byteLength)
          await this.finishFrame();
        continue;
      }

      if (this.state === "footer") {
        offset = this.copyInto(this.footer, this.footerReceived, bytes, offset);
        this.footerReceived += this.lastCopied;
        if (this.footerReceived === this.footer.byteLength) await this.finishFooter();
        continue;
      }

      fail("backup-invalid-container");
    }
  }

  async finish(): Promise<FullBackupStreamImportReceipt> {
    if (this.disposed || this.state !== "done" || this.manifest === null || this.parsedHeader === null)
      fail("backup-invalid-container");
    if (
      this.receivedBytes !== this.parsedHeader.totalContainerLength ||
      (this.expectedTotalBytes !== null && this.receivedBytes !== this.expectedTotalBytes)
    )
      fail("backup-invalid-container");
    return {
      graph: this.manifest.graph,
      attachmentCount: this.manifest.attachments.length,
      totalBytes: this.receivedBytes,
    };
  }

  async abort(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.password = "";
    this.manifestCiphertext?.fill(0);
    this.frameCiphertext?.fill(0);
    const sink = this.sink;
    this.sink = null;
    if (!this.committed) await sink?.abort();
  }

  private async finishManifest(): Promise<void> {
    if (this.parsedHeader === null || this.manifestCiphertext === null)
      fail("backup-invalid-container");
    const encryptedManifest = this.manifestCiphertext;
    let plaintext: Uint8Array<ArrayBuffer> | undefined;
    try {
      const passwordBytes = decodePassword(this.password);
      try {
        plaintext = await decryptManifest(
          encryptedManifest,
          this.header,
          this.parsedHeader.salt,
          this.parsedHeader.iv,
          passwordBytes,
        );
      } finally {
        passwordBytes.fill(0);
        this.parsedHeader.salt.fill(0);
        this.parsedHeader.iv.fill(0);
      }
      if (plaintext.byteLength > MAX_BACKUP_MANIFEST_BYTES)
        fail("backup-too-large");
      let parsed: unknown;
      try {
        parsed = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
        );
      } catch {
        fail("backup-invalid-container");
      }
      const manifest = decodeManifest(parsed);
      const inventory = validateGraphInventory(manifest.graph);
      validateManifestInventory(inventory, manifest.attachments);
      this.manifest = manifest;
      this.inventory = inventory;
      this.sink = await this.beginRestore(manifest.graph);
      this.hash.update(this.header);
      this.hash.update(encryptedManifest);
      this.state = "frames";
    } finally {
      plaintext?.fill(0);
      encryptedManifest.fill(0);
      this.manifestCiphertext = null;
    }
  }

  private beginFrame(): void {
    if (this.manifest === null || this.inventory === null)
      fail("backup-invalid-container");
    const id = readAscii(this.frameHeader, 0, 36);
    const length = readU32(this.frameHeader, 36);
    const entry = this.manifest.attachments[this.frameIndex];
    const descriptor = this.inventory.get(id);
    if (
      entry === undefined ||
      descriptor === undefined ||
      entry.id !== id ||
      !isUuidV4(id) ||
      id !== id.toLowerCase() ||
      length !== entry.cipherByteLength ||
      length < AES_GCM_TAG_BYTES ||
      length > MAX_CIPHER_ATTACHMENT_BYTES
    )
      fail("backup-invalid-container");
    this.currentDescriptor = descriptor;
    this.frameCiphertext = new Uint8Array(length);
    this.frameReceived = 0;
    this.hash.update(this.frameHeader);
  }

  private async finishFrame(): Promise<void> {
    const descriptor = this.currentDescriptor;
    const ciphertext = this.frameCiphertext;
    if (descriptor === null || ciphertext === null || this.manifest === null)
      fail("backup-invalid-container");
    const entry = this.manifest.attachments[this.frameIndex];
    if (entry === undefined || hexDigest(ciphertext) !== entry.cipherSha256)
      fail("backup-attachment-mismatch");
    let plaintext: Uint8Array<ArrayBuffer> | undefined;
    try {
      try {
        plaintext = await decryptAttachmentBytes(ciphertext, descriptor);
      } catch (error) {
        if (error instanceof AttachmentContractError)
          fail("backup-attachment-mismatch");
        throw error;
      }
      if (this.sink === null) fail("backup-invalid-container");
      await this.sink.writeAttachment({ descriptor, ciphertext });
    } finally {
      plaintext?.fill(0);
      ciphertext.fill(0);
      this.frameCiphertext = null;
      this.currentDescriptor = null;
    }
    this.frameIndex += 1;
    this.frameHeader.fill(0);
    this.frameHeaderReceived = 0;
    this.frameReceived = 0;
  }

  private async finishFooter(): Promise<void> {
    if (readAscii(this.footer, 0, FULL_BACKUP_FOOTER_MAGIC.length) !== FULL_BACKUP_FOOTER_MAGIC)
      fail("backup-invalid-container");
    if (!equalBytes(this.hash.digest(), this.footer.subarray(8)))
      fail("backup-invalid-container");
    if (this.manifest === null) fail("backup-invalid-container");
    if (this.sink === null) fail("backup-invalid-container");
    await this.sink.commit(this.manifest.graph);
    this.committed = true;
    this.state = "done";
    this.password = "";
  }

  private lastCopied = 0;

  private copyInto(
    target: Uint8Array,
    targetOffset: number,
    source: Uint8Array,
    sourceOffset: number,
  ): number {
    const length = Math.min(
      target.byteLength - targetOffset,
      source.byteLength - sourceOffset,
    );
    if (length <= 0) {
      this.lastCopied = 0;
      return sourceOffset;
    }
    target.set(source.subarray(sourceOffset, sourceOffset + length), targetOffset);
    this.lastCopied = length;
    return sourceOffset + length;
  }
}

/** Decode and authenticate a complete v2 backup before any graph is published. */
export async function decodeFullBackup(
  input: Uint8Array,
  password: string,
): Promise<FullBackupArchive> {
  // Check the caller-owned view before making a private copy of untrusted input.
  if (input.byteLength > MAX_BACKUP_FILE_BYTES) fail("backup-too-large");
  const bytes = copyBytes(input);
  if (bytes.byteLength < FULL_BACKUP_HEADER_BYTES + FULL_BACKUP_FOOTER_BYTES)
    fail("backup-invalid-container");
  const header = bytes.subarray(0, FULL_BACKUP_HEADER_BYTES);
  const parsedHeader = decodeHeader(header, bytes.byteLength);
  const encryptedManifestStart = FULL_BACKUP_HEADER_BYTES;
  const encryptedManifestEnd = encryptedManifestStart + parsedHeader.encryptedManifestLength;
  if (encryptedManifestEnd > bytes.byteLength - FULL_BACKUP_FOOTER_BYTES)
    fail("backup-invalid-container");
  const encryptedManifest = bytes.subarray(encryptedManifestStart, encryptedManifestEnd);
  const footerStart = bytes.byteLength - FULL_BACKUP_FOOTER_BYTES;
  const footer = bytes.subarray(footerStart);
  if (readAscii(footer, 0, FULL_BACKUP_FOOTER_MAGIC.length) !== FULL_BACKUP_FOOTER_MAGIC)
    fail("backup-invalid-container");

  const passwordBytes = decodePassword(password);
  let manifestPlaintext: Uint8Array<ArrayBuffer> | undefined;
  try {
    manifestPlaintext = await decryptManifest(
      encryptedManifest,
      header,
      parsedHeader.salt,
      parsedHeader.iv,
      passwordBytes,
    );
  } finally {
    passwordBytes.fill(0);
    parsedHeader.salt.fill(0);
    parsedHeader.iv.fill(0);
  }
  let manifest: FullBackupManifest;
  try {
    if (manifestPlaintext.byteLength > MAX_BACKUP_MANIFEST_BYTES)
      fail("backup-too-large");
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(manifestPlaintext),
    );
    manifest = decodeManifest(parsed);
  } catch (error) {
    if (error instanceof FullBackupError) throw error;
    fail("backup-invalid-container");
  } finally {
    manifestPlaintext.fill(0);
  }
  if (parsedHeader.attachmentCount !== manifest.attachments.length)
    fail("backup-invalid-container");
  if (manifest.totalCipherBytes > MAX_LEDGER_ATTACHMENT_BYTES)
    fail("backup-too-large");
  if (manifest.totalCipherBytes !== sumManifestCipherBytes(manifest.attachments))
    fail("backup-invalid-container");

  const inventory = validateGraphInventory(manifest.graph);
  validateManifestInventory(inventory, manifest.attachments);
  let offset = encryptedManifestEnd;
  const frameEnd = footerStart;
  const frames = new Map<string, Uint8Array<ArrayBuffer>>();
  const hash = sha256.create();
  hash.update(header);
  hash.update(encryptedManifest);
  let frameCipherBytes = 0;
  let previousId = "";
  for (let index = 0; index < parsedHeader.attachmentCount; index += 1) {
    if (offset + FULL_BACKUP_FRAME_HEADER_BYTES > frameEnd)
      fail("backup-invalid-container");
    const frameHeader = bytes.subarray(offset, offset + FULL_BACKUP_FRAME_HEADER_BYTES);
    const id = readAscii(frameHeader, 0, 36);
    const length = readU32(frameHeader, 36);
    if (!isUuidV4(id) || id !== id.toLowerCase() || (previousId !== "" && id <= previousId))
      fail("backup-invalid-container");
    previousId = id;
    const frame = offset + FULL_BACKUP_FRAME_HEADER_BYTES;
    const next = frame + length;
    if (length < AES_GCM_TAG_BYTES || length > MAX_CIPHER_ATTACHMENT_BYTES || next > frameEnd)
      fail("backup-invalid-container");
    const ciphertext = copyBytes(bytes.subarray(frame, next));
    const entry = manifest.attachments[index];
    if (entry === undefined || entry.id !== id || entry.cipherByteLength !== length)
      fail("backup-invalid-container");
    if (hexDigest(ciphertext) !== entry.cipherSha256)
      fail("backup-attachment-mismatch");
    if (frames.has(id)) fail("backup-invalid-container");
    frames.set(id, ciphertext);
    frameCipherBytes += length;
    offset = next;
    hash.update(frameHeader);
    hash.update(ciphertext);
  }
  if (offset !== frameEnd || frameCipherBytes !== manifest.totalCipherBytes)
    fail("backup-invalid-container");
  if (!equalBytes(hash.digest(), footer.subarray(8)))
    fail("backup-invalid-container");

  const attachments: FullBackupAttachment[] = [];
  for (const entry of manifest.attachments) {
    const descriptor = inventory.get(entry.id);
    const ciphertext = frames.get(entry.id);
    if (descriptor === undefined) fail("backup-attachment-missing");
    if (ciphertext === undefined) fail("backup-attachment-missing");
    try {
      await decryptAttachmentBytes(ciphertext, descriptor);
    } catch (error) {
      if (error instanceof AttachmentContractError) fail("backup-attachment-mismatch");
      throw error;
    }
    attachments.push({ descriptor: { ...descriptor }, ciphertext });
  }
  return { graph: manifest.graph, attachments };
}

function normalizeGraph(document: LedgerDocument): LedgerDocument {
  try {
    const decoded = decodeLedgerDocument(document);
    return decoded.schemaVersion >= 3 ? decoded : upgradeLedgerDocument(decoded);
  } catch (error) {
    if (error instanceof FullBackupError) throw error;
    throw error;
  }
}

function validateGraphInventory(
  graph: LedgerDocument,
): Map<string, StoredAttachmentDescriptor> {
  const inventory = new Map<string, StoredAttachmentDescriptor>();
  for (const revision of graph.revisions) {
    if (revision.kind !== "transaction") continue;
    if (!isStoredTransaction(revision.value)) fail("backup-invalid-container");
    for (const descriptor of revision.value.attachments) {
      try {
        validateAttachmentDescriptor(descriptor);
      } catch (error) {
        if (error instanceof AttachmentContractError)
          fail("backup-attachment-mismatch");
        throw error;
      }
      if (descriptor.workspaceId !== graph.workspace.id)
        fail("backup-workspace-mismatch");
      const existing = inventory.get(descriptor.id);
      if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(descriptor))
        fail("backup-attachment-mismatch");
      inventory.set(descriptor.id, { ...descriptor });
    }
  }
  if (inventory.size > MAX_LEDGER_ATTACHMENT_COUNT) fail("backup-too-large");
  const total = [...inventory.values()].reduce((sum, item) => sum + item.cipherByteLength, 0);
  if (total > MAX_LEDGER_ATTACHMENT_BYTES) fail("backup-too-large");
  return inventory;
}

async function validateAttachmentForBackup(
  expected: StoredAttachmentDescriptor,
  item: FullBackupAttachment | null,
): Promise<void> {
  if (item === null) fail("backup-attachment-missing");
  try {
    validateAttachmentDescriptor(item.descriptor);
  } catch (error) {
    if (error instanceof AttachmentContractError)
      fail("backup-attachment-mismatch");
    throw error;
  }
  if (
    JSON.stringify(expected) !== JSON.stringify(item.descriptor) ||
    item.ciphertext.byteLength !== expected.cipherByteLength ||
    (await sha256Hex(item.ciphertext)) !== expected.cipherSha256
  )
    fail("backup-attachment-mismatch");
  let plaintext: Uint8Array<ArrayBuffer> | undefined;
  try {
    plaintext = await decryptAttachmentBytes(item.ciphertext, expected);
  } catch (error) {
    if (error instanceof AttachmentContractError)
      fail("backup-attachment-mismatch");
    throw error;
  } finally {
    plaintext?.fill(0);
  }
}

function validateManifestInventory(
  inventory: ReadonlyMap<string, StoredAttachmentDescriptor>,
  entries: readonly FullBackupManifest["attachments"][number][],
): void {
  if (entries.length !== inventory.size) fail("backup-attachment-mismatch");
  const seen = new Set<string>();
  let previousId = "";
  for (const entry of entries) {
    if (
      !isUuidV4(entry.id) ||
      entry.id !== entry.id.toLowerCase() ||
      (previousId !== "" && entry.id <= previousId) ||
      seen.has(entry.id) ||
      !Number.isSafeInteger(entry.cipherByteLength) ||
      entry.cipherByteLength < AES_GCM_TAG_BYTES ||
      entry.cipherByteLength > MAX_CIPHER_ATTACHMENT_BYTES ||
      !/^[0-9a-f]{64}$/.test(entry.cipherSha256)
    )
      fail("backup-attachment-mismatch");
    previousId = entry.id;
    seen.add(entry.id);
    const descriptor = inventory.get(entry.id);
    if (
      descriptor === undefined ||
      descriptor.cipherByteLength !== entry.cipherByteLength ||
      descriptor.cipherSha256 !== entry.cipherSha256
    )
      fail("backup-attachment-mismatch");
  }
}

function decodeManifest(value: unknown): FullBackupManifest {
  if (!isRecord(value)) fail("backup-invalid-container");
  exactKeys(value, ["format", "version", "graph", "attachments", "totalCipherBytes"]);
  if (value.format !== FULL_BACKUP_FORMAT || value.version !== FULL_BACKUP_VERSION)
    fail("backup-unsupported-container");
  if (!Array.isArray(value.attachments)) fail("backup-invalid-container");
  if (value.attachments.length > MAX_LEDGER_ATTACHMENT_COUNT)
    fail("backup-too-large");
  let graph: LedgerDocument;
  try {
    const decodedGraph = decodeLedgerDocument(value.graph);
    if (decodedGraph.schemaVersion !== 2 && decodedGraph.schemaVersion !== 3)
      fail("backup-invalid-container");
    graph = decodedGraph;
  } catch (error) {
    if (error instanceof FullBackupError) throw error;
    fail("backup-invalid-container");
  }
  const entries = value.attachments.map((entry) => {
    if (!isRecord(entry)) fail("backup-invalid-container");
    exactKeys(entry, ["id", "cipherByteLength", "cipherSha256"]);
    if (
      typeof entry.id !== "string" ||
      typeof entry.cipherSha256 !== "string" ||
      typeof entry.cipherByteLength !== "number"
    )
      fail("backup-invalid-container");
    return {
      id: entry.id,
      cipherByteLength: entry.cipherByteLength,
      cipherSha256: entry.cipherSha256,
    };
  });
  if (
    typeof value.totalCipherBytes !== "number" ||
    !Number.isSafeInteger(value.totalCipherBytes) ||
    value.totalCipherBytes < 0 ||
    value.totalCipherBytes > MAX_LEDGER_ATTACHMENT_BYTES
  )
    fail("backup-invalid-container");
  return {
    format: FULL_BACKUP_FORMAT,
    version: FULL_BACKUP_VERSION,
    graph,
    attachments: entries,
    totalCipherBytes: value.totalCipherBytes,
  };
}

function sumDescriptorCipherBytes(
  descriptors: readonly StoredAttachmentDescriptor[],
): number {
  const total = descriptors.reduce((sum, item) => sum + item.cipherByteLength, 0);
  if (total > MAX_LEDGER_ATTACHMENT_BYTES) fail("backup-too-large");
  return total;
}

function sumManifestCipherBytes(
  attachments: readonly FullBackupManifest["attachments"][number][],
): number {
  const total = attachments.reduce((sum, item) => sum + item.cipherByteLength, 0);
  if (total > MAX_LEDGER_ATTACHMENT_BYTES) fail("backup-too-large");
  return total;
}

function encodeHeader(
  encryptedManifestLength: number,
  attachmentCount: number,
  totalContainerLength: number,
  salt: Uint8Array,
  iv: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(FULL_BACKUP_HEADER_BYTES);
  writeAscii(header, 0, FULL_BACKUP_MAGIC);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  view.setUint16(8, FULL_BACKUP_VERSION, false);
  view.setUint16(10, 0, false);
  view.setUint32(12, encryptedManifestLength, false);
  header.set(salt, 16);
  header.set(iv, 32);
  view.setUint32(44, attachmentCount, false);
  view.setBigUint64(48, BigInt(totalContainerLength), false);
  return header;
}

function decodeHeader(
  header: Uint8Array,
  actualLength: number,
): ParsedFullBackupHeader {
  if (readAscii(header, 0, FULL_BACKUP_MAGIC.length) !== FULL_BACKUP_MAGIC)
    fail("backup-unsupported-container");
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (view.getUint16(8, false) !== FULL_BACKUP_VERSION || view.getUint16(10, false) !== 0)
    fail("backup-unsupported-container");
  const encryptedManifestLength = view.getUint32(12, false);
  if (
    encryptedManifestLength < AES_GCM_TAG_BYTES ||
    encryptedManifestLength > MAX_BACKUP_MANIFEST_BYTES + AES_GCM_TAG_BYTES
  )
    fail("backup-too-large");
  const attachmentCount = view.getUint32(44, false);
  if (attachmentCount > MAX_LEDGER_ATTACHMENT_COUNT) fail("backup-too-large");
  const totalContainerLengthBig = view.getBigUint64(48, false);
  if (totalContainerLengthBig > BigInt(Number.MAX_SAFE_INTEGER))
    fail("backup-too-large");
  const totalContainerLength = Number(totalContainerLengthBig);
  if (totalContainerLength > MAX_BACKUP_FILE_BYTES || totalContainerLength !== actualLength)
    fail("backup-invalid-container");
  return {
    encryptedManifestLength,
    attachmentCount,
    totalContainerLength,
    salt: copyBytes(header.subarray(16, 32)),
    iv: copyBytes(header.subarray(32, 44)),
  };
}

function encodeFrameHeader(id: string, length: number): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(FULL_BACKUP_FRAME_HEADER_BYTES);
  writeAscii(header, 0, id);
  new DataView(header.buffer, header.byteOffset, header.byteLength).setUint32(36, length, false);
  return header;
}

async function encryptManifest(
  plaintext: Uint8Array,
  header: Uint8Array,
  salt: Uint8Array,
  iv: Uint8Array,
  password: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoApi = requireCrypto();
  try {
    const key = await deriveKey(cryptoApi, password, salt, "encrypt");
    return new Uint8Array(await cryptoApi.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        tagLength: 128,
        additionalData: toArrayBuffer(concatBytes(encoder.encode("luna-full-backup-v2"), header)),
      },
      key,
      toArrayBuffer(plaintext),
    ));
  } catch (error) {
    if (error instanceof FullBackupError) throw error;
    throw new FullBackupError("backup-crypto-unavailable");
  }
}

async function decryptManifest(
  ciphertext: Uint8Array,
  header: Uint8Array,
  salt: Uint8Array,
  iv: Uint8Array,
  password: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoApi = requireCrypto();
  try {
    const key = await deriveKey(cryptoApi, password, salt, "decrypt");
    return new Uint8Array(await cryptoApi.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        tagLength: 128,
        additionalData: toArrayBuffer(concatBytes(encoder.encode("luna-full-backup-v2"), header)),
      },
      key,
      toArrayBuffer(ciphertext),
    ));
  } catch (error) {
    if (error instanceof FullBackupError) throw error;
    if (error instanceof DOMException && error.name === "OperationError")
      fail("backup-wrong-password-or-tampered");
    throw new FullBackupError("backup-crypto-unavailable");
  }
}

async function deriveKey(
  cryptoApi: Crypto,
  password: Uint8Array,
  salt: Uint8Array,
  usage: "encrypt" | "decrypt",
): Promise<CryptoKey> {
  try {
    const material = await cryptoApi.subtle.importKey(
      "raw",
      toArrayBuffer(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return await cryptoApi.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: FULL_BACKUP_PBKDF2_ITERATIONS,
        salt: toArrayBuffer(salt),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      [usage],
    );
  } catch {
    throw new FullBackupError("backup-crypto-unavailable");
  }
}

function decodePassword(password: string): Uint8Array<ArrayBuffer> {
  try {
    validateLedgerPassword(password);
  } catch (error) {
    if (error instanceof LedgerCryptoError && error.code === "ledger-password-invalid")
      fail("backup-password-invalid");
    throw error;
  }
  return encoder.encode(password);
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const cryptoApi = requireCrypto();
  const bytes = new Uint8Array(length);
  cryptoApi.getRandomValues(bytes);
  return bytes;
}

function requireCrypto(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.subtle === undefined || typeof cryptoApi.getRandomValues !== "function")
    fail("backup-crypto-unavailable");
  return cryptoApi;
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function concatChunks(
  chunks: readonly Uint8Array[],
  length: number,
): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== length) fail("backup-invalid-container");
  return result;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left);
  result.set(right, left.byteLength);
  return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function hexDigest(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1)
    bytes[offset + index] = value.charCodeAt(index);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.byteLength) fail("backup-invalid-container");
  let value = "";
  for (let index = 0; index < length; index += 1)
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  return value;
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) fail("backup-invalid-container");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function readBigUint64(bytes: Uint8Array, offset: number): bigint {
  if (offset < 0 || offset + 8 > bytes.byteLength) fail("backup-invalid-container");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, false);
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  )
    fail("backup-invalid-container");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: FullBackupErrorCode): never {
  throw new FullBackupError(code);
}
