import {
  MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES,
  MAX_BACKUP_FILE_BYTES,
  type StoredAttachmentDescriptor,
} from "./attachment-contract";
import {
  createFullBackupStreamDecoder,
  createFullBackupStream,
  decodeFullBackup,
  FullBackupError,
  type FullBackupArchive,
  type FullBackupRestoreSink,
  type FullBackupStreamDecoder,
} from "./full-backup";
import type { LedgerDocument } from "./ledger-sync";
import { secureRandomUuid } from "./secure-random";

export interface BackupExportStart {
  jobId: string;
  totalBytes: number;
}

export interface BackupChunk {
  bytes: Uint8Array;
  eof: boolean;
}

export interface BackupImportReceipt {
  attachmentCount: number;
  totalBytes: number;
}

export interface FullBackupSessionSource {
  getLedgerDocument(): LedgerDocument | null | Promise<LedgerDocument | null>;
  readAttachmentCiphertext?(
    attachmentId: string,
  ): Promise<{ descriptor: StoredAttachmentDescriptor; ciphertext: Uint8Array } | null>;
  restoreFullBackup(archive: FullBackupArchive): Promise<void> | void;
  beginFullBackupRestore?(
    graph: import("./ledger-sync").LedgerDocumentV2,
  ): Promise<FullBackupRestoreSink> | FullBackupRestoreSink;
}

type ExportJob = {
  kind: "export";
  id: string;
  stream: import("./full-backup").FullBackupStream;
  totalBytes: number;
  sentBytes: number;
  nextSequence: number;
  lastSequence: number | null;
  lastChunk: Uint8Array | null;
};

type ImportJob = {
  kind: "import";
  id: string;
  password: string;
  expectedTotalBytes: number | null;
  receivedBytes: number;
  nextSequence: number;
  decoder: FullBackupStreamDecoder | null;
  chunks: Uint8Array[];
  lastSequence: number | null;
  lastChunk: Uint8Array | null;
};

type BackupJob = ExportJob | ImportJob;

/**
 * Host-side bounded bridge for complete backups. The codec remains the only
 * place that understands container bytes; this class enforces one active job,
 * monotonic chunk sequences, cancellation, and secret cleanup at the host
 * boundary.
 */
export class FullBackupSessionManager {
  private readonly jobs = new Map<string, BackupJob>();
  private activeJobId: string | null = null;

  constructor(private readonly source: FullBackupSessionSource) {}

  async beginBackupExport(password: string): Promise<BackupExportStart> {
    this.assertIdle();
    const document = await this.source.getLedgerDocument();
    if (document === null) throw new Error("LUNA_ERROR:ledger-empty");
    const stream = await createFullBackupStream(
      document,
      password,
      async (attachmentId) =>
        this.source.readAttachmentCiphertext === undefined
          ? null
          : this.source.readAttachmentCiphertext(attachmentId),
    );
    const id = opaqueJobId();
    const job: ExportJob = {
      kind: "export",
      id,
      stream,
      totalBytes: stream.totalBytes,
      sentBytes: 0,
      nextSequence: 0,
      lastSequence: null,
      lastChunk: null,
    };
    this.jobs.set(id, job);
    this.activeJobId = id;
    return { jobId: id, totalBytes: stream.totalBytes };
  }

  async readBackupChunk(jobId: string, sequence: number): Promise<BackupChunk> {
    const job = this.exportJob(jobId);
    assertSequence(sequence, job.nextSequence, job.lastSequence);
    if (job.lastSequence === sequence && job.lastChunk !== null) {
      return {
        bytes: copy(job.lastChunk),
        eof: job.sentBytes >= job.totalBytes,
      };
    }
    const chunk = await job.stream.readChunk(MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES);
    job.sentBytes += chunk.bytes.byteLength;
    const eof = chunk.eof || job.sentBytes === job.totalBytes;
    if (job.sentBytes > job.totalBytes || (eof && job.sentBytes !== job.totalBytes))
      fail("backup-invalid-container");
    job.lastSequence = sequence;
    job.lastChunk = copy(chunk.bytes);
    job.nextSequence += 1;
    return { bytes: copy(chunk.bytes), eof };
  }

  finishBackupExport(jobId: string): void {
    const job = this.exportJob(jobId);
    if (job.sentBytes !== job.totalBytes) fail("backup-invalid-container");
    this.dispose(job);
  }

  async beginBackupImport(
    totalBytes: number | null,
    password: string,
  ): Promise<{ jobId: string }> {
    this.assertIdle();
    if (
      totalBytes !== null &&
      (!Number.isSafeInteger(totalBytes) || totalBytes < 0 || totalBytes > MAX_BACKUP_FILE_BYTES)
    )
      fail("backup-too-large");
    const id = opaqueJobId();
    const job: ImportJob = {
      kind: "import",
      id,
      password,
      expectedTotalBytes: totalBytes,
      receivedBytes: 0,
      nextSequence: 0,
      decoder:
        this.source.beginFullBackupRestore === undefined
          ? null
          : createFullBackupStreamDecoder(
              password,
              totalBytes,
              (graph) => this.source.beginFullBackupRestore!(graph),
            ),
      chunks: [],
      lastSequence: null,
      lastChunk: null,
    };
    this.jobs.set(id, job);
    this.activeJobId = id;
    return { jobId: id };
  }

  async appendBackupChunk(
    jobId: string,
    sequence: number,
    bytes: Uint8Array,
  ): Promise<{ receivedBytes: number }> {
    const job = this.importJob(jobId);
    if (bytes.byteLength > MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES)
      fail("backup-too-large");
    assertSequence(sequence, job.nextSequence, job.lastSequence);
    if (job.lastSequence === sequence && job.lastChunk !== null) {
      if (!equalBytes(job.lastChunk, bytes)) fail("backup-invalid-container");
      return { receivedBytes: job.receivedBytes };
    }
    const copyOfChunk = copy(bytes);
    const receivedBytes = job.receivedBytes + copyOfChunk.byteLength;
    if (
      receivedBytes > MAX_BACKUP_FILE_BYTES ||
      (job.expectedTotalBytes !== null && receivedBytes > job.expectedTotalBytes)
    )
      fail("backup-too-large");
    if (job.decoder !== null) {
      try {
        await job.decoder.append(copyOfChunk);
      } catch (error) {
        try {
          await job.decoder.abort();
        } finally {
          this.dispose(job);
        }
        throw error;
      }
    } else {
      job.chunks.push(copyOfChunk);
    }
    job.receivedBytes = receivedBytes;
    job.lastSequence = sequence;
    job.lastChunk = copyOfChunk;
    job.nextSequence += 1;
    return { receivedBytes };
  }

  async finishBackupImport(jobId: string): Promise<BackupImportReceipt> {
    const job = this.importJob(jobId);
    try {
      if (job.expectedTotalBytes !== null && job.receivedBytes !== job.expectedTotalBytes)
        fail("backup-invalid-container");
      if (job.decoder !== null) {
        const receipt = await job.decoder.finish();
        return {
          attachmentCount: receipt.attachmentCount,
          totalBytes: receipt.totalBytes,
        };
      }
      const bytes = concatChunks(job.chunks, job.receivedBytes);
      const archive = await decodeFullBackup(bytes, job.password);
      await this.source.restoreFullBackup(archive);
      return {
        attachmentCount: archive.attachments.length,
        totalBytes: bytes.byteLength,
      };
    } finally {
      job.password = "";
      if (job.decoder !== null) await job.decoder.abort().catch(() => undefined);
      for (const chunk of job.chunks) chunk.fill(0);
      this.dispose(job);
    }
  }

  async cancelBackupJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job === undefined) return;
    try {
      if (job.kind === "import" && job.decoder !== null)
        await job.decoder.abort();
    } finally {
      this.dispose(job);
    }
  }

  async cancelAll(): Promise<void> {
    for (const job of [...this.jobs.values()]) await this.cancelBackupJob(job.id);
  }

  private assertIdle(): void {
    if (this.activeJobId !== null) throw new Error("LUNA_ERROR:ledger-backup-busy");
  }

  private exportJob(id: string): ExportJob {
    const job = this.jobs.get(id);
    if (job?.kind !== "export") fail("backup-invalid-container");
    return job;
  }

  private importJob(id: string): ImportJob {
    const job = this.jobs.get(id);
    if (job?.kind !== "import") fail("backup-invalid-container");
    return job;
  }

  private dispose(job: BackupJob): void {
    if (job.kind === "export") {
      job.stream.dispose();
      job.lastChunk?.fill(0);
    } else {
      job.password = "";
      for (const chunk of job.chunks) chunk.fill(0);
      job.lastChunk?.fill(0);
    }
    this.jobs.delete(job.id);
    if (this.activeJobId === job.id) this.activeJobId = null;
  }
}

function assertSequence(
  sequence: number,
  expected: number,
  previous: number | null,
): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || (sequence !== expected && sequence !== previous))
    fail("backup-invalid-container");
}

function concatChunks(chunks: readonly Uint8Array[], length: number): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(bytes.byteLength);
  result.set(bytes);
  return result;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function opaqueJobId(): string {
  return secureRandomUuid();
}

function fail(code: "backup-too-large" | "backup-invalid-container" | "backup-attachment-missing"): never {
  throw new FullBackupError(code);
}
