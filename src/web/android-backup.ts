import { registerPlugin } from '@capacitor/core';
import type { LunaLedgerApi } from '../shared/api';
import { MAX_LEDGER_ENVELOPE_BYTES } from '../shared/ledger-crypto';
import { MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES, MAX_BACKUP_FILE_BYTES } from '../shared/attachment-contract';

export interface AndroidBackupWriter {
  /** Legacy v1 JSON writer retained for old plugin builds and tests. */
  save?(options: { json: string }): Promise<void>;
  beginSave?(options: { fileName: string }): Promise<{ handle: string }>;
  writeChunk?(options: { handle: string; sequence: number; base64: string }): Promise<{ receivedBytes: number }>;
  finishSave?(options: { handle: string }): Promise<void>;
  cancelSave?(options: { handle: string }): Promise<void>;
}

export interface AndroidBackupReader {
  beginOpen?(): Promise<{ handle: string; size: number | null }>;
  readChunk?(options: {
    handle: string;
    sequence: number;
  }): Promise<{ base64: string; eof: boolean; receivedBytes: number }>;
  closeOpen?(options: { handle: string }): Promise<void>;
}

const writer = registerPlugin<AndroidBackupWriter>('LedgerBackup');
const reader = registerPlugin<AndroidBackupReader>('LedgerBackup');

export async function saveAndroidLedgerBackup(
  api: Pick<LunaLedgerApi, 'exportLedgerBackup'> & Partial<Pick<LunaLedgerApi, 'beginBackupExport' | 'readBackupChunk' | 'finishBackupExport' | 'cancelBackupJob'>>,
  password: string,
  nativeWriter: AndroidBackupWriter = writer,
): Promise<void> {
  const completeApi = api.beginBackupExport && api.readBackupChunk && api.finishBackupExport && api.cancelBackupJob
    ? {
        beginBackupExport: api.beginBackupExport,
        readBackupChunk: api.readBackupChunk,
        finishBackupExport: api.finishBackupExport,
        cancelBackupJob: api.cancelBackupJob,
      }
    : null;
  const completeWriter = nativeWriter.beginSave && nativeWriter.writeChunk && nativeWriter.finishSave && nativeWriter.cancelSave
    ? {
        beginSave: nativeWriter.beginSave,
        writeChunk: nativeWriter.writeChunk,
        finishSave: nativeWriter.finishSave,
        cancelSave: nativeWriter.cancelSave,
      }
    : null;
  if (completeApi && completeWriter) {
    await saveCompleteBackup(completeApi, password, completeWriter);
    return;
  }
  const json = await api.exportLedgerBackup(password);
  if (new TextEncoder().encode(json).byteLength > MAX_LEDGER_ENVELOPE_BYTES) {
    throw new Error('LUNA_ERROR:ledger-invalid-envelope');
  }
  try {
    if (!nativeWriter.save) throw new Error('legacy Android backup writer unavailable');
    await nativeWriter.save({ json });
  } catch (error) {
    const code = error instanceof Error && error.message === 'LUNA_ERROR:ledger-backup-cancelled'
      ? 'ledger-backup-cancelled' : 'ledger-backup-failed';
    throw new Error(`LUNA_ERROR:${code}`);
  }
}

async function saveCompleteBackup(
  api: Required<Pick<LunaLedgerApi, 'beginBackupExport' | 'readBackupChunk' | 'finishBackupExport' | 'cancelBackupJob'>>,
  password: string,
  nativeWriter: Required<Pick<AndroidBackupWriter, 'beginSave' | 'writeChunk' | 'finishSave' | 'cancelSave'>>,
): Promise<void> {
  const start = await api.beginBackupExport(password);
  let handle: string | null = null;
  let writerFinished = false;
  let hostFinished = false;
  try {
    if (
      typeof start.jobId !== 'string' ||
      start.jobId.length === 0 ||
      !Number.isSafeInteger(start.totalBytes) ||
      start.totalBytes < 1 ||
      start.totalBytes > MAX_BACKUP_FILE_BYTES
    ) {
      throw new Error('LUNA_ERROR:backup-invalid-container');
    }
    const opened = await nativeWriter.beginSave({
      fileName: `luna-ledger-${new Date().toISOString().slice(0, 10)}.luna-backup`,
    });
    handle = opened.handle;
    let writtenBytes = 0;
    let reachedEof = false;
    for (let sequence = 0; sequence <= Math.floor(MAX_BACKUP_FILE_BYTES / MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES); sequence += 1) {
      const chunk = await api.readBackupChunk(start.jobId, sequence);
      if (chunk.bytes.byteLength > MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES)
        throw new Error('LUNA_ERROR:backup-too-large');
      const nextWrittenBytes = writtenBytes + chunk.bytes.byteLength;
      if (nextWrittenBytes > start.totalBytes || nextWrittenBytes > MAX_BACKUP_FILE_BYTES)
        throw new Error('LUNA_ERROR:backup-invalid-container');
      const receipt = await nativeWriter.writeChunk({
        handle,
        sequence,
        base64: encodeBase64(chunk.bytes),
      });
      if (!Number.isSafeInteger(receipt.receivedBytes) || receipt.receivedBytes !== nextWrittenBytes)
        throw new Error('LUNA_ERROR:backup-invalid-container');
      writtenBytes = nextWrittenBytes;
      if (chunk.eof) {
        reachedEof = true;
        break;
      }
      if (sequence === Math.floor(MAX_BACKUP_FILE_BYTES / MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES))
        throw new Error('LUNA_ERROR:backup-invalid-container');
    }
    if (!reachedEof || writtenBytes !== start.totalBytes)
      throw new Error('LUNA_ERROR:backup-invalid-container');
    await nativeWriter.finishSave({ handle });
    writerFinished = true;
    await api.finishBackupExport(start.jobId);
    hostFinished = true;
  } catch (error) {
    const code = error instanceof Error && error.message === 'LUNA_ERROR:ledger-backup-cancelled'
      ? 'ledger-backup-cancelled'
      : error instanceof Error && /^LUNA_ERROR:backup-/.test(error.message)
        ? error.message.slice('LUNA_ERROR:'.length)
        : 'ledger-backup-failed';
    throw new Error(`LUNA_ERROR:${code}`);
  } finally {
    if (!hostFinished) await api.cancelBackupJob(start.jobId).catch(() => undefined);
    if (handle !== null && !writerFinished)
      await nativeWriter.cancelSave({ handle }).catch(() => undefined);
  }
}

/** Import a backup through the Android SAF reader without materializing the file. */
export async function importAndroidLedgerBackup(
  api: Required<Pick<LunaLedgerApi, 'beginBackupImport' | 'appendBackupChunk' | 'finishBackupImport' | 'cancelBackupJob'>>,
  password: string,
  nativeReader: Required<AndroidBackupReader> = reader as Required<AndroidBackupReader>,
): Promise<void> {
  const opened = await nativeReader.beginOpen();
  let jobId: string | null = null;
  let finished = false;
  try {
    const host = await api.beginBackupImport(opened.size, password);
    jobId = host.jobId;
    let receivedBytes = 0;
    for (let sequence = 0; sequence <= Math.floor(MAX_BACKUP_FILE_BYTES / MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES); sequence += 1) {
      const chunk = await nativeReader.readChunk({ handle: opened.handle, sequence });
      const bytes = decodeBase64(chunk.base64);
      if (bytes.byteLength > MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES)
        throw new Error('LUNA_ERROR:backup-too-large');
      const nextReceivedBytes = receivedBytes + bytes.byteLength;
      if (!Number.isSafeInteger(chunk.receivedBytes) || chunk.receivedBytes !== nextReceivedBytes)
        throw new Error('LUNA_ERROR:backup-invalid-container');
      if (nextReceivedBytes > MAX_BACKUP_FILE_BYTES)
        throw new Error('LUNA_ERROR:backup-too-large');
      let receipt: { receivedBytes: number };
      try {
        receipt = await api.appendBackupChunk(jobId, sequence, bytes);
      } finally {
        bytes.fill(0);
      }
      if (!Number.isSafeInteger(receipt.receivedBytes) || receipt.receivedBytes !== nextReceivedBytes)
        throw new Error('LUNA_ERROR:backup-invalid-container');
      receivedBytes = nextReceivedBytes;
      const eof = chunk.eof || (opened.size !== null && receivedBytes === opened.size);
      if (eof) {
        await api.finishBackupImport(jobId);
        finished = true;
        break;
      }
      if (sequence === Math.floor(MAX_BACKUP_FILE_BYTES / MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES))
        throw new Error('LUNA_ERROR:backup-invalid-container');
    }
    if (!finished) throw new Error('LUNA_ERROR:backup-invalid-container');
  } finally {
    await nativeReader.closeOpen({ handle: opened.handle }).catch(() => undefined);
    if (!finished && jobId !== null) await api.cancelBackupJob(jobId).catch(() => undefined);
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const copy = new Uint8Array(bytes);
  for (let offset = 0; offset < copy.byteLength; offset += 0x8000)
    binary += String.fromCharCode(...copy.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function decodeBase64(encoded: string): Uint8Array {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    if (encoded === '') return new Uint8Array(0);
    throw new Error('LUNA_ERROR:backup-invalid-container');
  }
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error('LUNA_ERROR:backup-invalid-container');
  }
  if (btoa(binary) !== encoded) throw new Error('LUNA_ERROR:backup-invalid-container');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
